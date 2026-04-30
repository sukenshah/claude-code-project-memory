#!/bin/bash
# project-memory — Claude Code plugin uninstaller
set -e

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CLAUDE_JSON="$HOME/.claude.json"
SETTINGS="$CLAUDE_DIR/settings.json"

# Remove MCP server from ~/.claude.json
if [ -f "$CLAUDE_JSON" ]; then
  cp "$CLAUDE_JSON" "$CLAUDE_JSON.bak"
  node -e "
    const fs = require('fs');
    const cj = JSON.parse(fs.readFileSync('$CLAUDE_JSON', 'utf8'));
    if (cj.mcpServers && cj.mcpServers['project-memory']) {
      delete cj.mcpServers['project-memory'];
      console.log('  Removed MCP server: project-memory');
    }
    fs.writeFileSync('$CLAUDE_JSON', JSON.stringify(cj, null, 2) + '\n');
  "
fi

# Remove hooks from ~/.claude/settings.json
if [ -f "$SETTINGS" ]; then
  cp "$SETTINGS" "$SETTINGS.bak"
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$SETTINGS', 'utf8'));
    for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact', 'EndSession']) {
      if (Array.isArray(settings.hooks?.[event])) {
        const before = settings.hooks[event].length;
        settings.hooks[event] = settings.hooks[event].filter(e =>
          !(e.hooks && e.hooks.some(h => h.command && h.command.includes('project-memory')))
        );
        if (settings.hooks[event].length < before) {
          console.log('  Removed ' + event + ' hook');
        }
      }
    }
    fs.writeFileSync('$SETTINGS', JSON.stringify(settings, null, 2) + '\n');
  "
fi

echo "Done. Restart Claude Code to apply."
echo "Note: DB files at <project>/.claude/project-memory/ are preserved."
