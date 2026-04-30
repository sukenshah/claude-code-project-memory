#!/usr/bin/env node
// project-memory — Claude Code PreCompact hook
// Injects instructions to snapshot memory before context is compacted.

process.stdout.write(
  'PRE-COMPACT: Context is about to be compacted. Call write_session on project-memory-mcp before this happens.\n' +
  '- Use the current session_id and project_path.\n' +
  '- Write a summary of work done so far and set outcome to partial.\n' +
  '- Save any insights not yet recorded via add_insight — decisions, patterns, mistakes, blockers, or learnings from this session.\n' +
  '- Do NOT repeat insights already saved via add_insight.\n' +
  'After compaction, call query_insights at the start of the new context to restore relevant memory.'
);
