#!/bin/bash
# project-memory — Claude Code plugin installer
# Installs: MCP server (user scope in ~/.claude.json) + hooks (in ~/.claude/settings.json)
# Usage:
#   bash hooks/install.sh
#   bash hooks/install.sh --force   (re-install over existing config)
set -e

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 'node' (>=20) is required. Install from https://nodejs.org"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: 'npm' is required."
  exit 1
fi

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
# MCP servers → ~/.claude.json (user scope)
CLAUDE_JSON="$HOME/.claude.json"
# Hooks → ~/.claude/settings.json
SETTINGS="$CLAUDE_DIR/settings.json"

# Check already installed (unless --force)
if [ "$FORCE" -eq 0 ]; then
  INSTALLED=$(CLAUDE_JSON="$CLAUDE_JSON" SETTINGS_PATH="$SETTINGS" node -e "
    const fs = require('fs');
    let hasMcp = false;
    try {
      const cj = JSON.parse(fs.readFileSync(process.env.CLAUDE_JSON, 'utf8'));
      hasMcp = !!(cj.mcpServers && cj.mcpServers['project-memory']);
    } catch (e) {}
    let hasHooks = false;
    try {
      const s = JSON.parse(fs.readFileSync(process.env.SETTINGS_PATH, 'utf8'));
      const hasHook = (event) =>
        Array.isArray(s.hooks?.[event]) &&
        s.hooks[event].some(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('project-memory'))
        );
      hasHooks = hasHook('SessionStart') && hasHook('UserPromptSubmit') && hasHook('Stop') && hasHook('PreCompact');
    } catch (e) {}
    process.stdout.write(hasMcp && hasHooks ? 'yes' : 'no');
  " 2>/dev/null || echo "no")

  if [ "$INSTALLED" = "yes" ]; then
    echo "project-memory already installed. Re-run with --force to overwrite."
    exit 0
  fi
fi

echo "Building project-memory MCP server..."
cd "$PLUGIN_DIR"
npm install --silent
npm run build --silent
echo "  Built: $PLUGIN_DIR/dist/index.js"

# --- 1. Register MCP server in ~/.claude.json (user scope) ---
if [ ! -f "$CLAUDE_JSON" ]; then
  echo '{}' > "$CLAUDE_JSON"
fi
cp "$CLAUDE_JSON" "$CLAUDE_JSON.bak"

PLUGIN_DIR="$PLUGIN_DIR" CLAUDE_JSON_PATH="$CLAUDE_JSON" node -e "
  const fs = require('fs');
  const path = require('path');
  const pluginDir = process.env.PLUGIN_DIR;
  const claudeJsonPath = process.env.CLAUDE_JSON_PATH;

  const cj = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'));
  if (!cj.mcpServers) cj.mcpServers = {};
  cj.mcpServers['project-memory'] = {
    type: 'stdio',
    command: 'node',
    args: [path.join(pluginDir, 'dist', 'index.js')],
    env: {}
  };
  fs.writeFileSync(claudeJsonPath, JSON.stringify(cj, null, 2) + '\n');
  console.log('  MCP server registered: project-memory (user scope → ~/.claude.json)');
"

# --- 2. Register hooks in ~/.claude/settings.json ---
mkdir -p "$CLAUDE_DIR"
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi
cp "$SETTINGS" "$SETTINGS.bak"

PLUGIN_DIR="$PLUGIN_DIR" SETTINGS_PATH="$SETTINGS" node -e "
  const fs = require('fs');
  const path = require('path');
  const pluginDir = process.env.PLUGIN_DIR;
  const settingsPath = process.env.SETTINGS_PATH;

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (!settings.hooks) settings.hooks = {};

  const registerHook = (event, scriptName, statusMessage) => {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    const already = settings.hooks[event].some(e =>
      e.hooks && e.hooks.some(h => h.command && h.command.includes('project-memory'))
    );
    if (!already) {
      settings.hooks[event].push({
        hooks: [{
          type: 'command',
          command: 'node \"' + path.join(pluginDir, 'hooks', scriptName) + '\"',
          timeout: 10,
          statusMessage
        }]
      });
      console.log('  ' + event + ' hook registered');
    }
  };

  registerHook('SessionStart',     'session-start.js', 'Loading project memory...');
  registerHook('UserPromptSubmit', 'user-prompt.js',   'Checking project memory...');
  registerHook('Stop',             'stop.js',          'Saving project memory...');
  registerHook('PreCompact',       'pre-compact.js',   'Snapshotting project memory...');

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
"

echo ""
echo "Done! Restart Claude Code to activate."
echo ""
echo "What's installed:"
echo "  - MCP server: project-memory (user scope, all projects)"
echo "  - SessionStart hook: Claude queries memory at session start"
echo "  - Stop hook:         Claude writes session summary before finishing"
echo "  - PreCompact hook:   Claude snapshots memory before context compaction"
echo "  - DB location: <project>/.claude/project-memory/insights.db (per-project)"
