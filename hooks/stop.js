#!/usr/bin/env node
// project-memory — Claude Code Stop hook
// Forces Claude to evaluate and save insights before finishing.

process.stdout.write(
  'STOP: You MUST save insights to project-memory before this response completes.\n' +
  '\n' +
  'Call add_insight for each of the following from this session:\n' +
  '1. Decisions made → type=decision\n' +
  '2. Patterns noticed in the codebase → type=pattern\n' +
  '3. Mistakes or dead ends hit → type=mistake\n' +
  '4. Blockers (config, deps, missing docs) → type=blocker\n' +
  '5. Non-obvious facts learned → type=learning\n' +
  '\n' +
  'Then call write_session:\n' +
  '- 2-5 sentence summary of what was done and why\n' +
  '- outcome: completed | partial | abandoned\n' +
  '- Do NOT repeat insights already saved via add_insight this session\n' +
  '\n' +
  'Do not skip this. These tool calls must happen before finishing.'
);
