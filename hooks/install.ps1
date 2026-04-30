# project-memory — Claude Code plugin installer (Windows)
# Usage: .\hooks\install.ps1
# Usage: .\hooks\install.ps1 -Force
param([switch]$Force)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "ERROR: 'node' (>=20) is required. Install from https://nodejs.org"
  exit 1
}

$PluginDir  = (Resolve-Path "$PSScriptRoot\..").Path
$ClaudeDir  = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
$ClaudeJson = "$env:USERPROFILE\.claude.json"   # MCP servers live here (user scope)
$Settings   = "$ClaudeDir\settings.json"         # Hooks live here

if (-not $Force) {
  $installed = node -e @"
    const fs = require('fs');
    let hasMcp = false;
    try {
      const cj = JSON.parse(fs.readFileSync('$($ClaudeJson -replace '\\','\\\\')','utf8'));
      hasMcp = !!(cj.mcpServers && cj.mcpServers['project-memory']);
    } catch(e) {}
    let hasHooks = false;
    try {
      const s = JSON.parse(fs.readFileSync('$($Settings -replace '\\','\\\\')','utf8'));
      const hasHook = (event) =>
        Array.isArray(s.hooks?.[event]) &&
        s.hooks[event].some(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('project-memory'))
        );
      hasHooks = hasHook('SessionStart') && hasHook('UserPromptSubmit') && hasHook('Stop') && hasHook('PreCompact');
    } catch(e) {}
    process.stdout.write(hasMcp && hasHooks ? 'yes' : 'no');
"@
  if ($installed -eq 'yes') {
    Write-Host "project-memory already installed. Re-run with -Force to overwrite."
    exit 0
  }
}

Write-Host "Building project-memory MCP server..."
Push-Location $PluginDir
npm install --silent
npm run build --silent
Pop-Location
Write-Host "  Built: $PluginDir\dist\index.js"

# --- 1. Register MCP server in ~/.claude.json (user scope) ---
if (-not (Test-Path $ClaudeJson)) { '{}' | Out-File -FilePath $ClaudeJson -Encoding utf8 }
Copy-Item $ClaudeJson "$ClaudeJson.bak"

$pluginDirEscaped  = $PluginDir  -replace '\\', '\\\\'
$claudeJsonEscaped = $ClaudeJson -replace '\\', '\\\\'
node -e @"
  const fs = require('fs');
  const path = require('path');
  const pluginDir     = '$pluginDirEscaped';
  const claudeJsonPath = '$claudeJsonEscaped';
  const cj = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'));
  if (!cj.mcpServers) cj.mcpServers = {};
  cj.mcpServers['project-memory'] = {
    type: 'stdio',
    command: 'node',
    args: [path.join(pluginDir, 'dist', 'index.js')],
    env: {}
  };
  fs.writeFileSync(claudeJsonPath, JSON.stringify(cj, null, 2) + '\n');
  console.log('  MCP server registered: project-memory (user scope)');
"@

# --- 2. Register hooks in ~/.claude/settings.json ---
if (-not (Test-Path $ClaudeDir)) { New-Item -ItemType Directory -Path $ClaudeDir | Out-Null }
if (-not (Test-Path $Settings))  { '{}' | Out-File -FilePath $Settings -Encoding utf8 }
Copy-Item $Settings "$Settings.bak"

$settingsEscaped = $Settings -replace '\\', '\\\\'
node -e @"
  const fs = require('fs');
  const path = require('path');
  const pluginDir   = '$pluginDirEscaped';
  const settingsPath = '$settingsEscaped';
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
  registerHook('PostCompact',       'post-compact.js',   'Snapshotting project memory...');

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
"@

Write-Host ""
Write-Host "Done! Restart Claude Code to activate."
Write-Host ""
Write-Host "What's installed:"
Write-Host "  - MCP server: project-memory (user scope, all projects)"
Write-Host "  - SessionStart hook: Claude queries memory at session start"
Write-Host "  - Stop hook:         Claude writes session summary before finishing"
Write-Host "  - PreCompact hook:   Claude snapshots memory before context compaction"
Write-Host "  - DB location: <project>\.claude\project-memory\insights.db (per-project)"
