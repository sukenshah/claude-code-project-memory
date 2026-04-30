#!/usr/bin/env node
// project-memory — Claude Code PostCompact hook
// Captures insights from compacted context before they become unrecoverable.

process.stdout.write(
  'POST-COMPACT: Context was just compacted. Conversation history before this point is gone.\n' +
  '\n' +
  'You MUST call project-memory MCP tools NOW, before responding to anything else:\n' +
  '\n' +
  '1. Call add_insight for every decision, pattern, mistake, blocker, or learning from the compacted session\n' +
  '   — start with type=mistake and type=blocker (highest value for future sessions)\n' +
  '2. Call write_session with outcome=partial to checkpoint what was done so far\n' +
  '\n' +
  'Do this immediately. Do not wait for the next user message. Do not respond until these tool calls are complete.'
);
