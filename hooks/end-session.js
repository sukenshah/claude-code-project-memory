#!/usr/bin/env node
// project-memory — Claude Code EndSession hook
// Final mandatory memory sweep before the session closes.

process.stdout.write(
  'END SESSION: You MUST complete a full memory sweep NOW before this session closes.\n' +
  '\n' +
  'Do not skip any step:\n' +
  '1. Review the entire session — what decisions, patterns, mistakes, blockers, learnings occurred?\n' +
  '2. Call add_insight for every one not yet saved\n' +
  '3. Ask: what would future-you need to know before working on this project again?\n' +
  '4. Did any pattern repeat across multiple tasks? Save it as type=pattern.\n' +
  '\n' +
  'Then call write_session with:\n' +
  '- Full 2-5 sentence summary\n' +
  '- Correct outcome: completed | partial | abandoned\n' +
  '- session_id and project_path\n' +
  '- Do NOT repeat insights already saved via add_insight this session\n' +
  '\n' +
  'These tool calls are required. The session is not complete until write_session is called.'
);
