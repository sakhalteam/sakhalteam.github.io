#!/usr/bin/env bash
#
# Optimize all GLB files: Draco geometry + WebP textures + texture resize.
# Preserves Blender scene hierarchy (no flatten/join/simplify).
#
# Usage:
#   npm run optimize          — optimize all GLBs in public/
#   bash scripts/optimize-glb.sh public/island.glb   — optimize one file
#
set -euo pipefail

TEXTURE_SIZE="${TEXTURE_SIZE:-2048}"

optimize_file() {
  local input="$1"
  local backup="${input}.bak"
  local size_before
  size_before=$(du -sh "$input" | cut -f1)

  echo "⏳ Optimizing: $input ($size_before)"

  # Back up original
  cp "$input" "$backup"

  # Run gltf-transform optimize with hierarchy-safe flags
  npx gltf-transform optimize "$backup" "$input" \
    --compress draco \
    --texture-compress webp \
    --texture-size "$TEXTURE_SIZE" \
    --flatten false \
    --join false \
    --simplify false

  local size_after
  size_after=$(du -sh "$input" | cut -f1)

  # Clean up backup
  rm "$backup"

  echo "✅ $input: $size_before → $size_after"
}

if [ $# -gt 0 ]; then
  # Optimize specific files passed as arguments
  for f in "$@"; do
    optimize_file "$f"
  done
else
  # Optimize all GLBs in public/
  find public/ -name "*.glb" -type f | while read -r f; do
    optimize_file "$f"
  done
fi
