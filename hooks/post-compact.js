#!/usr/bin/env node
// project-memory — Claude Code PostCompact hook
// Captures insights from compacted context before they become unrecoverable.

process.stdout.write(
  'POST-COMPACT: Context just compacted — some conversation history is now gone.\n' +
  'Capture anything important BEFORE it becomes unrecoverable:\n' +
  '\n' +
  '1. Review the compact summary for decisions, patterns, mistakes, blockers, learnings\n' +
  '2. Call add_insight for each one not yet saved\n' +
  '3. Call write_session with outcome=partial to checkpoint this session\n' +
  '\n' +
  'Priority: type=mistake and type=blocker first — these are most valuable to future sessions.'
);
