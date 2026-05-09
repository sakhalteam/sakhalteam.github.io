"""
Blender source audit for sakhalteam GLB exports.

This script does not modify the open .blend file. It writes a Markdown report
and an optional JSON report describing the things that usually make GLB exports
large: high evaluated triangle counts, large images, packed textures, modifiers,
linked duplicates, unapplied scale, animations, and export-visibility gotchas.

Usage from Blender:
  1. Open the .blend file.
  2. Blender > Scripting > Open this file > Run Script.
  3. Find the report next to the .blend file, or in the current working dir.

Usage from command line:
  blender path/to/world.blend --background --python scripts/blender-source-audit.py -- --out notes/blender-source-audit.md --json notes/blender-source-audit.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import bpy


TOP_N = 30


def bytes_to_mb(value: int | float | None) -> float:
    if not value:
        return 0.0
    return round(float(value) / 1024 / 1024, 3)


def fmt_int(value: int | float | None) -> str:
    return f"{int(value or 0):,}"


def fmt_mb(value: int | float | None) -> str:
    return f"{bytes_to_mb(value):.2f} MB"


def safe_rel(path: str) -> str:
    if not path:
        return ""
    try:
        return bpy.path.abspath(path)
    except Exception:
        return path


def file_size(path: str) -> int:
    if not path:
        return 0
    resolved = safe_rel(path)
    try:
        return os.path.getsize(resolved)
    except OSError:
        return 0


def image_source_size(image: bpy.types.Image) -> int:
    if image.packed_file:
        return int(image.packed_file.size)
    return file_size(image.filepath)


def material_image_names(material: bpy.types.Material | None) -> list[str]:
    if not material or not material.use_nodes or not material.node_tree:
        return []
    names: list[str] = []
    for node in material.node_tree.nodes:
        if node.bl_idname == "ShaderNodeTexImage" and getattr(node, "image", None):
            names.append(node.image.name)
    return sorted(set(names))


def mesh_stats(mesh: bpy.types.Mesh) -> dict[str, int]:
    mesh.calc_loop_triangles()
    return {
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "polygons": len(mesh.polygons),
        "triangles": len(mesh.loop_triangles),
        "materials": len(mesh.materials),
        "uv_layers": len(mesh.uv_layers),
        "color_attributes": len(mesh.color_attributes),
        "shape_keys": len(mesh.shape_keys.key_blocks) if mesh.shape_keys else 0,
    }


def evaluated_mesh_stats(obj: bpy.types.Object, depsgraph: bpy.types.Depsgraph) -> dict[str, int] | None:
    if obj.type != "MESH":
        return None
    try:
        evaluated = obj.evaluated_get(depsgraph)
        temp_mesh = evaluated.to_mesh()
        stats = mesh_stats(temp_mesh)
        evaluated.to_mesh_clear()
        return stats
    except Exception as exc:
        return {"error": str(exc)}  # type: ignore[return-value]


def object_export_relevant(obj: bpy.types.Object) -> bool:
    # This is an approximation. Actual GLTF export depends on export settings
    # such as selected-only and visible-only.
    return not obj.hide_get() and not obj.hide_viewport and not obj.hide_render


def is_scale_unapplied(obj: bpy.types.Object) -> bool:
    sx, sy, sz = obj.scale
    return any(abs(v - 1.0) > 0.001 for v in (sx, sy, sz))


def collect_audit() -> dict[str, Any]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    blend_path = bpy.data.filepath
    scene = bpy.context.scene

    objects: list[dict[str, Any]] = []
    mesh_users: defaultdict[str, list[str]] = defaultdict(list)
    material_users: defaultdict[str, list[str]] = defaultdict(list)
    image_users: defaultdict[str, set[str]] = defaultdict(set)

    totals = {
        "objects": 0,
        "export_relevant_objects": 0,
        "mesh_objects": 0,
        "base_vertices": 0,
        "base_triangles": 0,
        "evaluated_vertices": 0,
        "evaluated_triangles": 0,
        "materials": len(bpy.data.materials),
        "images": len(bpy.data.images),
        "animations": len(bpy.data.actions),
        "modifiers": 0,
        "unapplied_scale_objects": 0,
    }

    type_counts = Counter(obj.type for obj in bpy.data.objects)

    for obj in bpy.data.objects:
        totals["objects"] += 1
        export_relevant = object_export_relevant(obj)
        if export_relevant:
            totals["export_relevant_objects"] += 1

        item: dict[str, Any] = {
            "name": obj.name,
            "type": obj.type,
            "collection_names": [c.name for c in obj.users_collection],
            "visible_get": bool(obj.visible_get()),
            "hide_viewport": bool(obj.hide_viewport),
            "hide_render": bool(obj.hide_render),
            "export_relevant_guess": export_relevant,
            "scale": [round(v, 5) for v in obj.scale],
            "unapplied_scale": is_scale_unapplied(obj),
            "modifiers": [
                {
                    "name": mod.name,
                    "type": mod.type,
                    "show_viewport": bool(mod.show_viewport),
                    "show_render": bool(mod.show_render),
                }
                for mod in obj.modifiers
            ],
            "animation_data": bool(obj.animation_data and obj.animation_data.action),
        }
        totals["modifiers"] += len(obj.modifiers)
        if item["unapplied_scale"]:
            totals["unapplied_scale_objects"] += 1

        if obj.type == "MESH" and obj.data:
            totals["mesh_objects"] += 1
            mesh = obj.data
            base = mesh_stats(mesh)
            evaluated = evaluated_mesh_stats(obj, depsgraph) or {}

            totals["base_vertices"] += base["vertices"]
            totals["base_triangles"] += base["triangles"]
            if "vertices" in evaluated:
                totals["evaluated_vertices"] += int(evaluated["vertices"])
            if "triangles" in evaluated:
                totals["evaluated_triangles"] += int(evaluated["triangles"])

            mesh_users[mesh.name].append(obj.name)

            material_names: list[str] = []
            image_names: list[str] = []
            for slot in obj.material_slots:
                mat = slot.material
                if not mat:
                    continue
                material_names.append(mat.name)
                material_users[mat.name].append(obj.name)
                for image_name in material_image_names(mat):
                    image_names.append(image_name)
                    image_users[image_name].add(mat.name)

            item.update(
                {
                    "mesh_name": mesh.name,
                    "mesh_users": mesh.users,
                    "base": base,
                    "evaluated": evaluated,
                    "material_names": sorted(set(material_names)),
                    "image_names": sorted(set(image_names)),
                }
            )

        objects.append(item)

    images: list[dict[str, Any]] = []
    for image in bpy.data.images:
        width, height = image.size
        source_size = image_source_size(image)
        filepath = safe_rel(image.filepath)
        images.append(
            {
                "name": image.name,
                "filepath": filepath,
                "source": image.source,
                "packed": bool(image.packed_file),
                "width": int(width),
                "height": int(height),
                "pixels": int(width * height),
                "channels": int(image.channels),
                "source_size_bytes": source_size,
                "source_size_mb": bytes_to_mb(source_size),
                "from_temp_path": bool(filepath and ("\\Temp\\" in filepath or "/Temp/" in filepath or "/tmp/" in filepath)),
                "users": int(image.users),
                "material_users": sorted(image_users.get(image.name, set())),
            }
        )

    materials: list[dict[str, Any]] = []
    for material in bpy.data.materials:
        image_names = material_image_names(material)
        materials.append(
            {
                "name": material.name,
                "users": int(material.users),
                "use_nodes": bool(material.use_nodes),
                "blend_method": getattr(material, "blend_method", ""),
                "alpha_threshold": getattr(material, "alpha_threshold", None),
                "image_names": image_names,
                "object_users": sorted(set(material_users.get(material.name, []))),
            }
        )

    def action_fcurve_count(action: bpy.types.Action) -> int:
        # Blender 4.4+ can store animation in layered Actions where fcurves are
        # no longer exposed directly on the Action object.
        direct_fcurves = getattr(action, "fcurves", None)
        if direct_fcurves is not None:
            return len(direct_fcurves)

        count = 0
        for layer in getattr(action, "layers", []):
            for strip in getattr(layer, "strips", []):
                channelbag = getattr(strip, "channelbag", None)
                if channelbag is not None:
                    count += len(getattr(channelbag, "fcurves", []))
                for channelbag in getattr(strip, "channelbags", []):
                    count += len(getattr(channelbag, "fcurves", []))
        return count

    actions: list[dict[str, Any]] = []
    for action in bpy.data.actions:
        actions.append(
            {
                "name": action.name,
                "users": int(action.users),
                "frame_range": [float(action.frame_range[0]), float(action.frame_range[1])],
                "fcurves": action_fcurve_count(action),
            }
        )

    linked_meshes = [
        {"mesh_name": mesh_name, "object_users": names}
        for mesh_name, names in mesh_users.items()
        if len(names) > 1
    ]

    warnings: list[str] = []
    image_total_bytes = sum(int(img.get("source_size_bytes", 0) or 0) for img in images)
    packed_image_count = sum(1 for img in images if img.get("packed"))
    oversized_image_count = sum(1 for img in images if img.get("width", 0) > 2048 or img.get("height", 0) > 2048)
    temp_path_image_count = sum(1 for img in images if img.get("from_temp_path"))
    zero_user_images = sum(1 for img in images if int(img.get("users", 0) or 0) == 0)
    zero_user_materials = sum(1 for mat in materials if int(mat.get("users", 0) or 0) == 0)

    if totals["evaluated_triangles"] > 500_000:
        warnings.append("Evaluated triangle count is high for a web GLB.")
    if oversized_image_count:
        warnings.append("One or more images are larger than 2048px.")
    if packed_image_count:
        warnings.append("Packed images can hide unexpectedly large texture payloads.")
    if temp_path_image_count:
        warnings.append("Some image file paths point into temp/import folders; repath or clean these before trusting exports.")
    if totals["modifiers"] > 0:
        warnings.append("Modifiers may increase exported geometry after evaluation.")
    if totals["unapplied_scale_objects"] > 0:
        warnings.append("Some objects have unapplied scale; this can complicate transforms, bounds, and reuse.")

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "blend_file": blend_path,
        "scene": scene.name,
        "frame_range": [scene.frame_start, scene.frame_end],
        "unit_system": scene.unit_settings.system,
        "type_counts": dict(type_counts),
        "totals": totals,
        "image_totals": {
            "source_size_bytes": image_total_bytes,
            "source_size_mb": bytes_to_mb(image_total_bytes),
            "packed_count": packed_image_count,
            "oversized_count": oversized_image_count,
            "temp_path_count": temp_path_image_count,
            "zero_user_image_count": zero_user_images,
            "zero_user_material_count": zero_user_materials,
        },
        "warnings": warnings,
        "objects": objects,
        "images": images,
        "materials": materials,
        "actions": actions,
        "linked_meshes": linked_meshes,
    }


def top_mesh_objects(audit: dict[str, Any]) -> list[dict[str, Any]]:
    mesh_objects = [obj for obj in audit["objects"] if obj.get("type") == "MESH"]
    return sorted(
        mesh_objects,
        key=lambda obj: int(obj.get("evaluated", {}).get("triangles", 0) or 0),
        reverse=True,
    )[:TOP_N]


def top_images(audit: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        audit["images"],
        key=lambda img: (int(img.get("source_size_bytes", 0) or 0), int(img.get("pixels", 0) or 0)),
        reverse=True,
    )[:TOP_N]


def write_markdown(audit: dict[str, Any], path: Path) -> None:
    totals = audit["totals"]
    image_totals = audit["image_totals"]
    lines: list[str] = []
    lines.append(f"# Blender Source Audit - {Path(audit['blend_file']).name or 'unsaved blend'}")
    lines.append("")
    lines.append(f"Generated: `{audit['generated_at']}`")
    lines.append(f"Blend file: `{audit['blend_file'] or '(unsaved)'}`")
    lines.append(f"Scene: `{audit['scene']}`")
    lines.append("")

    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Objects: {fmt_int(totals['objects'])} total, {fmt_int(totals['export_relevant_objects'])} export-relevant guess")
    lines.append(f"- Mesh objects: {fmt_int(totals['mesh_objects'])}")
    lines.append(f"- Base geometry: {fmt_int(totals['base_vertices'])} vertices, {fmt_int(totals['base_triangles'])} triangles")
    lines.append(f"- Evaluated geometry: {fmt_int(totals['evaluated_vertices'])} vertices, {fmt_int(totals['evaluated_triangles'])} triangles")
    lines.append(f"- Materials: {fmt_int(totals['materials'])}")
    lines.append(f"- Images: {fmt_int(totals['images'])} ({fmt_mb(image_totals['source_size_bytes'])} source payload)")
    lines.append(f"- Packed images: {fmt_int(image_totals['packed_count'])}")
    lines.append(f"- Images larger than 2048px: {fmt_int(image_totals['oversized_count'])}")
    lines.append(f"- Images from temp/import paths: {fmt_int(image_totals['temp_path_count'])}")
    lines.append(f"- Zero-user images/materials: {fmt_int(image_totals['zero_user_image_count'])} / {fmt_int(image_totals['zero_user_material_count'])}")
    lines.append(f"- Actions: {fmt_int(totals['animations'])}")
    lines.append(f"- Modifiers: {fmt_int(totals['modifiers'])}")
    lines.append(f"- Objects with unapplied scale: {fmt_int(totals['unapplied_scale_objects'])}")
    lines.append("")

    if audit["warnings"]:
        lines.append("## Warnings")
        lines.append("")
        for warning in audit["warnings"]:
            lines.append(f"- {warning}")
        lines.append("")

    lines.append("## Object Type Counts")
    lines.append("")
    for obj_type, count in sorted(audit["type_counts"].items(), key=lambda item: item[0]):
        lines.append(f"- `{obj_type}`: {fmt_int(count)}")
    lines.append("")

    lines.append(f"## Top {TOP_N} Mesh Objects By Evaluated Triangles")
    lines.append("")
    lines.append("| Object | Mesh | Base tris | Evaluated tris | Materials | Images | Modifiers | Scale | Export? |")
    lines.append("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |")
    for obj in top_mesh_objects(audit):
        base = obj.get("base", {})
        evaluated = obj.get("evaluated", {})
        scale = ", ".join(str(v) for v in obj.get("scale", []))
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{obj['name']}`",
                    f"`{obj.get('mesh_name', '')}`",
                    fmt_int(base.get("triangles")),
                    fmt_int(evaluated.get("triangles")),
                    fmt_int(len(obj.get("material_names", []))),
                    fmt_int(len(obj.get("image_names", []))),
                    fmt_int(len(obj.get("modifiers", []))),
                    f"`{scale}`",
                    "yes" if obj.get("export_relevant_guess") else "no",
                ]
            )
            + " |"
        )
    lines.append("")

    lines.append(f"## Top {TOP_N} Images By Source Size")
    lines.append("")
    lines.append("| Image | Size | Resolution | Packed | Temp path | Users | Materials | File |")
    lines.append("| --- | ---: | ---: | --- | --- | ---: | --- | --- |")
    for img in top_images(audit):
        materials = ", ".join(f"`{name}`" for name in img.get("material_users", [])[:6])
        if len(img.get("material_users", [])) > 6:
            materials += ", ..."
        filepath = img.get("filepath", "")
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{img['name']}`",
                    fmt_mb(img.get("source_size_bytes")),
                    f"{fmt_int(img.get('width'))} x {fmt_int(img.get('height'))}",
                    "yes" if img.get("packed") else "no",
                    "yes" if img.get("from_temp_path") else "no",
                    fmt_int(img.get("users")),
                    materials or "-",
                    f"`{filepath}`" if filepath else "-",
                ]
            )
            + " |"
        )
    lines.append("")

    if audit["linked_meshes"]:
        lines.append("## Linked Mesh Data")
        lines.append("")
        lines.append("Linked mesh data can be good for Blender authoring, but check whether export settings preserve it efficiently.")
        lines.append("")
        lines.append("| Mesh | Object users |")
        lines.append("| --- | --- |")
        for entry in sorted(audit["linked_meshes"], key=lambda item: len(item["object_users"]), reverse=True)[:TOP_N]:
            users = ", ".join(f"`{name}`" for name in entry["object_users"][:12])
            if len(entry["object_users"]) > 12:
                users += ", ..."
            lines.append(f"| `{entry['mesh_name']}` | {users} |")
        lines.append("")

    modifier_objects = [obj for obj in audit["objects"] if obj.get("modifiers")]
    if modifier_objects:
        lines.append("## Objects With Modifiers")
        lines.append("")
        lines.append("| Object | Modifiers |")
        lines.append("| --- | --- |")
        for obj in sorted(modifier_objects, key=lambda item: len(item["modifiers"]), reverse=True)[:TOP_N]:
            mods = ", ".join(f"`{m['type']}:{m['name']}`" for m in obj["modifiers"])
            lines.append(f"| `{obj['name']}` | {mods} |")
        lines.append("")

    scale_objects = [obj for obj in audit["objects"] if obj.get("unapplied_scale")]
    if scale_objects:
        lines.append("## Objects With Unapplied Scale")
        lines.append("")
        lines.append("| Object | Type | Scale |")
        lines.append("| --- | --- | --- |")
        for obj in scale_objects[:TOP_N]:
            scale = ", ".join(str(v) for v in obj.get("scale", []))
            lines.append(f"| `{obj['name']}` | `{obj['type']}` | `{scale}` |")
        lines.append("")

    if audit["actions"]:
        lines.append("## Animation Actions")
        lines.append("")
        lines.append("| Action | Users | Frame range | F-curves |")
        lines.append("| --- | ---: | --- | ---: |")
        for action in sorted(audit["actions"], key=lambda item: item["fcurves"], reverse=True)[:TOP_N]:
            frame_range = f"{action['frame_range'][0]:.1f} - {action['frame_range'][1]:.1f}"
            lines.append(f"| `{action['name']}` | {fmt_int(action['users'])} | {frame_range} | {fmt_int(action['fcurves'])} |")
        lines.append("")

    lines.append("## What To Send Back")
    lines.append("")
    lines.append("- This Markdown file.")
    lines.append("- The JSON file if generated.")
    lines.append("- Which GLB export this .blend is supposed to produce.")
    lines.append("- Whether you export selected objects only, visible objects only, or the whole scene.")
    lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    script_args = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="", help="Markdown report path")
    parser.add_argument("--json", default="", help="Optional JSON report path")
    return parser.parse_args(script_args)


def default_report_path() -> Path:
    if bpy.data.filepath:
        return Path(bpy.data.filepath).with_suffix(".blender-source-audit.md")
    return Path.cwd() / "blender-source-audit.md"


def main() -> None:
    args = parse_args()
    markdown_path = Path(args.out) if args.out else default_report_path()
    json_path = Path(args.json) if args.json else markdown_path.with_suffix(".json")

    audit = collect_audit()
    write_markdown(audit, markdown_path)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")

    print(f"[blender-source-audit] wrote {markdown_path}")
    print(f"[blender-source-audit] wrote {json_path}")


if __name__ == "__main__":
    main()
