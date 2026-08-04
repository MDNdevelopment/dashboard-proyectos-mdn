#!/usr/bin/env bash
# PostToolUse hook (Write|Edit): lint --fix + run related tests for edited src/**/*.{js,jsx}.
# Blocks (decision:block) on failure so the agent sees the error and fixes it in the same turn,
# instead of declaring the task done with broken code. See docs/QA_BLINDAJE.md (1.5).
set -u

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')

[ -z "$file" ] && exit 0
case "$file" in
  */src/*.js) ;;
  */src/*.jsx) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

lint_out=$(npx eslint --fix "$file" 2>&1)
lint_code=$?

test_out=""
test_code=0
if [ "$lint_code" -eq 0 ]; then
  test_out=$(npx vitest related --run "$file" 2>&1)
  test_code=$?
fi

if [ "$lint_code" -ne 0 ] || [ "$test_code" -ne 0 ]; then
  combined=$(printf 'ESLint/tests fallaron tras editar %s:\n\n%s\n%s' "$file" "$lint_out" "$test_out")
  jq -n --arg reason "$combined" '{decision: "block", reason: $reason}'
fi
exit 0
