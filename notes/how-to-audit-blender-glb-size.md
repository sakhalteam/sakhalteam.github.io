# How To Audit A Blender Scene Before Exporting GLB

Use this when a zone GLB is bigger than expected and you want to know what in Blender is probably causing it.

The audit script is non-destructive. It does not optimize, delete, decimate, pack, unpack, apply transforms, or change export settings. It only reads the current `.blend` file and writes reports.

## Script

`scripts/blender-source-audit.py`

## Easiest Use Inside Blender

1. Open the `.blend` file for the zone.
2. Go to Blender's **Scripting** tab.
3. Open `scripts/blender-source-audit.py`.
4. Click **Run Script**.
5. Look next to the `.blend` file for:
   - `<blend-name>.blender-source-audit.md`
   - `<blend-name>.blender-source-audit.json`

Send the Markdown report back to Codex first. The JSON is useful if we need to do deeper sorting/filtering.

## Command-Line Use

From the repo root:

```powershell
blender path\to\zone_bird_sanctuary.blend --background --python scripts\blender-source-audit.py -- --out notes\bird_sanctuary_blender_audit.md --json notes\bird_sanctuary_blender_audit.json
```

If `blender` is not on PATH, use the full Blender executable path.

## What It Reports

- Total object counts by Blender type.
- Base mesh vertices/triangles.
- Evaluated vertices/triangles after modifiers.
- Top mesh objects by evaluated triangle count.
- Top images by source file size and resolution.
- Packed images.
- Material/image usage.
- Objects with modifiers.
- Linked mesh data reused by multiple objects.
- Objects with unapplied scale.
- Animation actions and F-curve counts.
- A few common warnings for web GLB exports.

## What To Tell Codex With The Report

- Which zone GLB this `.blend` is supposed to produce.
- Whether you usually export the whole scene, selected objects only, or visible objects only.
- Whether the audit was run before or after applying any Blender cleanup.
- Any object you already suspect is weird.

## Common Things The Report Can Reveal

- One or two accidental ultra-dense objects.
- Texture images that are 4K/8K when the final web scene only needs 1K/2K.
- Packed images you forgot were embedded.
- Modifiers that massively increase exported geometry.
- Duplicate objects that are not sharing mesh data.
- Lots of unused or hidden stuff that might still export depending on settings.
- Animation data that is heavier than expected.

## Good Default Blender Habits For Web GLBs

- Keep final texture dimensions at 2048px or lower unless a hero object really needs more.
- Prefer fewer, shared materials where it does not hurt the look.
- Keep high-poly source objects separate from export-ready low-poly objects.
- Use simple invisible `_hitbox` meshes for click targets when a visual mesh is complex.
- Apply scale on export-ready meshes when possible.
- Delete or move non-export objects into a clearly named collection.
- Keep zone files boringly explicit: final export objects should be easy to identify in the outliner.
