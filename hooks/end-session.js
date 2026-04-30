#!/usr/bin/env node
// project-memory — Claude Code EndSession hook
// Final comprehensive memory sweep before the session closes.

process.stdout.write(
  'END SESSION: Final memory sweep before closing.\n' +
  '\n' +
  'Do a full review of this session:\n' +
  '1. What was the overall outcome? (completed / partial / abandoned)\n' +
  '2. What would future-you want to know before working on this project again?\n' +
  '3. Are there any insights from early in the session that were never saved?\n' +
  '4. Did any pattern repeat across multiple tasks? Worth a type=pattern insight.\n' +
  '\n' +
  'Call add_insight for any gaps, then call write_session with:\n' +
  '- Full summary (2-5 sentences)\n' +
  '- Correct outcome\n' +
  '- session_id and project_path\n' +
  'Do NOT repeat insights already saved via add_insight this session.'
);
