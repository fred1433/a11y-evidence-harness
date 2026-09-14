/**
 * data/findings.json is the single source. This publishes it next to the page.
 *
 *   node scripts/export-findings.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = await readFile(path.join(ROOT, 'data/findings.json'), 'utf8');
await mkdir(path.join(ROOT, 'public'), { recursive: true });
await writeFile(path.join(ROOT, 'public/findings.json'), src);
const n = JSON.parse(src).observations.length;
console.log(`published public/findings.json with ${n} observations`);
