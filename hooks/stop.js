#!/usr/bin/env node
// project-memory — Claude Code Stop hook
// Forces Claude to evaluate and save insights before finishing.

process.stdout.write(
  'If this turn involved a significant decision, a blocker, or a non-obvious discovery: ' +
  'call add_insight now (type=mistake or type=blocker are highest priority). ' +
  'Otherwise skip — EndSession handles the final comprehensive sweep.'
);
