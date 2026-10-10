#!/usr/bin/env node
/**
 * Fail the build if public/ still contains source, preview, or non-ship audio.
 * Forbidden: .py .md .mp4 .ogg; folders named src/preview or starting with _;
 * and leftover story/triggers_act1.json.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = 'public';
const BAD_EXT = new Set(['.py', '.md', '.mp4', '.ogg']);
const issues = [];

function badDir(name) {
  return name === 'src' || name === 'preview' || name.startsWith('_');
}

function walk(dir, rel = '') {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      if (badDir(name)) issues.push(`forbidden folder: ${ROOT}/${r}`);
      walk(full, r);
      continue;
    }
    const ext = extname(name).toLowerCase();
    if (BAD_EXT.has(ext)) issues.push(`forbidden file: ${ROOT}/${r}`);
    if (name === 'triggers_act1.json') issues.push(`forbidden file: ${ROOT}/${r}`);
  }
}

walk(ROOT);
if (issues.length) {
  console.error(`public/ leak check failed (${issues.length}):`);
  for (const line of issues) console.error(`  ${line}`);
  process.exit(1);
}
console.log('public/ leak check passed');
