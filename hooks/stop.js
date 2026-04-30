#!/usr/bin/env node
// project-memory — Claude Code Stop hook
// Prompts Claude to evaluate the session work and save insights before finishing.

process.stdout.write(
  'STOP: Evaluate this session before finishing.\n' +
  '\n' +
  'Answer these mentally, then act:\n' +
  '1. What decisions did I make? → add_insight(type=decision) for each significant one\n' +
  '2. What patterns did I notice in the codebase? → add_insight(type=pattern)\n' +
  '3. Did I make any mistakes or hit dead ends? → add_insight(type=mistake)\n' +
  '4. Were there blockers (config, deps, missing docs)? → add_insight(type=blocker)\n' +
  '5. Did I learn anything non-obvious? → add_insight(type=learning)\n' +
  '\n' +
  'Then call write_session:\n' +
  '- 2-5 sentence summary of what was done and why\n' +
  '- outcome: completed | partial | abandoned\n' +
  '- Do NOT repeat insights already saved via add_insight this session'
);
