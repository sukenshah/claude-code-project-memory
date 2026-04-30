#!/bin/bash
# project-memory — Claude Code plugin reinstaller
# Removes existing hooks/MCP registration, rebuilds, and re-registers.
# Your project memory databases are NOT affected — all insights are preserved.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Reinstalling project-memory plugin..."
echo "Note: Project memory databases are NOT affected. All insights are preserved."
echo ""

bash "$SCRIPT_DIR/uninstall.sh"
echo ""
bash "$SCRIPT_DIR/install.sh" --force
