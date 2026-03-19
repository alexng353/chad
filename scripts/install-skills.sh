#!/usr/bin/env bash
# install-skills.sh — Symlink chad skills into ~/.claude/skills/
# Idempotent: skips existing symlinks, warns on non-symlink conflicts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_SKILLS_DIR="$SCRIPT_DIR/../.claude/skills"
TARGET_DIR="$HOME/.claude/skills"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

if [[ ! -d "$REPO_SKILLS_DIR" ]]; then
  echo "Error: skills directory not found: $REPO_SKILLS_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

found_any=false

for skill_dir in "$REPO_SKILLS_DIR"/*/; do
  [[ -d "$skill_dir" ]] || continue
  skill_name="$(basename "$skill_dir")"
  target="$TARGET_DIR/$skill_name"
  source="$(realpath "$skill_dir")"
  found_any=true

  if [[ "$DRY_RUN" == true ]]; then
    if [[ -L "$target" ]]; then
      echo "[dry-run] skill '$skill_name': already symlinked, would skip"
    elif [[ -e "$target" ]]; then
      echo "[dry-run] skill '$skill_name': WARNING — non-symlink exists at $target, would skip"
    else
      echo "[dry-run] skill '$skill_name': would symlink $source -> $target"
    fi
    continue
  fi

  if [[ -L "$target" ]]; then
    echo "skill '$skill_name': already symlinked, skipping"
  elif [[ -e "$target" ]]; then
    echo "WARNING: skill '$skill_name': non-symlink file/dir exists at $target — skipping" >&2
  else
    ln -s "$source" "$target"
    echo "skill '$skill_name': symlinked $source -> $target"
  fi
done

if [[ "$found_any" == false ]]; then
  echo "No skills found in $REPO_SKILLS_DIR"
fi
