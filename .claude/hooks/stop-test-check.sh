#!/usr/bin/env bash
# Stop hook: if this session touched any src/**/*.{js,jsx}, run the full suite before
# letting the agent consider the turn finished. Skips silently on turns with no code
# changes, so answering questions or reading files doesn't pay a ~25s tax every time.
# See docs/QA_BLINDAJE.md (1.5).
set -u

changed=$( { git diff --name-only HEAD -- src; git diff --name-only --cached -- src; git ls-files --others --exclude-standard -- src; } 2>/dev/null | grep -E '\.(js|jsx)$' | sort -u)

[ -z "$changed" ] && exit 0

out=$(npm test 2>&1)
code=$?

if [ "$code" -ne 0 ]; then
  jq -n --arg reason "$out" '{decision: "block", reason: ("La suite de tests quedó en rojo tras los cambios de esta sesión. No declares la tarea terminada sin arreglarlo:\n\n" + $reason)}'
fi
exit 0
