# project-memory — Claude Code plugin reinstaller (Windows)
# Removes existing hooks/MCP registration, rebuilds, and re-registers.
# Your project memory databases are NOT affected — all insights are preserved.
# Usage: .\hooks\reinstall.ps1
$ErrorActionPreference = 'Stop'

Write-Host "Reinstalling project-memory plugin..."
Write-Host "Note: Project memory databases are NOT affected. All insights are preserved."
Write-Host ""

& "$PSScriptRoot\uninstall.ps1"
Write-Host ""
& "$PSScriptRoot\install.ps1" -Force
