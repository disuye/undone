#!/usr/bin/env bash
# PostToolUse: after Claude edits shared markup/CSS, report drift back to Claude (exit 2).
set -euo pipefail

file="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input", {}).get("file_path", ""))')"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
rel="${file#"$ROOT"/}"

[[ "$rel" =~ ^(index\.html|cms/templates/|cms/pages/templates/|cms/pages/blocks\.py|cms/pages/wagtail_hooks\.py|assets/css/) ]] || exit 0

if ! out="$(python3 "$ROOT/_scripts/markup_drift.py" --strict)"; then
  { grep '^WARN' <<<"$out"; echo "Markup drift after editing $rel — update the other side (index.html or the Wagtail template) to match."; } >&2
  exit 2
fi
