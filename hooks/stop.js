#!/usr/bin/env node
// project-memory — Claude Code Stop hook
// Injects session-end instructions so Claude calls write_session before finishing.

process.stdout.write(
  'SESSION END: Call write_session on project-memory-mcp now.\n' +
  '- Use the current session_id and project_path.\n' +
  '- Write a 2-5 sentence summary of what was accomplished and why.\n' +
  '- Set outcome to completed, partial, or abandoned as appropriate.\n' +
  '- Include any insights not yet saved inline via add_insight during the session.\n' +
  '- Do NOT repeat insights already saved via add_insight.'
);
