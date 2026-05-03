// Optimize GLB files: Draco geometry + WebP textures + texture resize.
// Preserves Blender scene hierarchy (no flatten/join/simplify).
// Cross-platform (Windows / macOS / Linux) — no bash required.
//
// Usage:
//   npm run optimize                            — optimize all GLBs in public/
//   node scripts/optimize-glb.mjs <file> [...]  — optimize specific files

import { spawnSync, execSync } from "node:child_process";
import { readdirSync, statSync, copyFileSync, rmSync } from "node:fs";
import { join, sep } from "node:path";

const TEXTURE_SIZE = process.env.TEXTURE_SIZE ?? "2048";

function findGlbs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...findGlbs(full));
    else if (entry.toLowerCase().endsWith(".glb")) out.push(full);
  }
  return out;
}

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function optimize(file) {
  const backup = `${file}.bak`;
  const sizeBefore = statSync(file).size;
  console.log(`\n⏳ Optimizing: ${file} (${fmtMB(sizeBefore)})`);
  copyFileSync(file, backup);
  const result = spawnSync(
    "npx",
    [
      "gltf-transform",
      "optimize",
      backup,
      file,
      "--compress", "draco",
      "--texture-compress", "webp",
      "--texture-size", TEXTURE_SIZE,
      "--flatten", "false",
      "--join", "false",
      "--simplify", "false",
    ],
    { stdio: "inherit", shell: true },
  );
  if (result.status !== 0) {
    console.error(`❌ Failed: ${file} — restoring backup`);
    copyFileSync(backup, file);
    rmSync(backup);
    process.exit(result.status ?? 1);
  }
  const sizeAfter = statSync(file).size;
  rmSync(backup);
  console.log(`✅ ${file}: ${fmtMB(sizeBefore)} → ${fmtMB(sizeAfter)}`);
}

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : findGlbs("public");
if (targets.length === 0) {
  console.log("No GLBs found.");
  process.exit(0);
}
for (const f of targets) optimize(f.split("/").join(sep));
