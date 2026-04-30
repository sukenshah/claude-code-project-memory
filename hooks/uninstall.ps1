# project-memory — Claude Code plugin uninstaller (Windows)
# Usage: .\hooks\uninstall.ps1
$ErrorActionPreference = 'Stop'

$ClaudeDir  = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
$ClaudeJson = "$env:USERPROFILE\.claude.json"
$Settings   = "$ClaudeDir\settings.json"

# Remove MCP server from ~/.claude.json
if (Test-Path $ClaudeJson) {
  Copy-Item $ClaudeJson "$ClaudeJson.bak"
  $claudeJsonEscaped = $ClaudeJson -replace '\\', '\\\\'
  node -e @"
    const fs = require('fs');
    const cj = JSON.parse(fs.readFileSync('$claudeJsonEscaped', 'utf8'));
    if (cj.mcpServers && cj.mcpServers['project-memory']) {
      delete cj.mcpServers['project-memory'];
      console.log('  Removed MCP server: project-memory');
    }
    fs.writeFileSync('$claudeJsonEscaped', JSON.stringify(cj, null, 2) + '\n');
"@
}

# Remove hooks from ~/.claude/settings.json
if (Test-Path $Settings) {
  Copy-Item $Settings "$Settings.bak"
  $settingsEscaped = $Settings -replace '\\', '\\\\'
  node -e @"
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$settingsEscaped', 'utf8'));
    for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PostCompact', 'EndSession']) {
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
    fs.writeFileSync('$settingsEscaped', JSON.stringify(settings, null, 2) + '\n');
"@
}

Write-Host "Done. Restart Claude Code to apply."
Write-Host "Note: DB files at <project>\.claude\project-memory\ are preserved."
