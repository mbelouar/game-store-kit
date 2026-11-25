#!/usr/bin/env node
// Final step: leave ONLY what's needed to publish on Google Play.
//   store-assets/
//     play-store/     icon-512.png  feature-graphic-1024x500.png  screenshots/   -> upload in Play Console
//     android-icon/   foreground.png  background.png  (1024)                     -> Android Studio > res > New > Image Asset
//     splash/         designed key-art splash: portrait, landscape, 2732 square
// Everything else (brand.json, plan.json, sources, frames, android/splash renders, preview, work/) is deleted.
// --full keeps everything (for later rebuilds with the same look).
// Usage: node pack.mjs [--dir store-assets] [--full]
import fs from 'node:fs';
import path from 'node:path';
import { args, outDir } from './lib.mjs';

const a = args();
const dir = path.resolve(a.dir || outDir());
if (!fs.existsSync(path.join(dir, 'play-store'))) { console.error('No play-store/ in ' + dir + ' — run build.mjs first'); process.exit(1); }
const KEEP = new Set(['play-store', 'android-icon', 'splash']);
if (a.full) {
  fs.rmSync(path.join(dir, 'work'), { recursive: true, force: true });
} else {
  for (const e of fs.readdirSync(dir)) {
    if (!KEEP.has(e)) fs.rmSync(path.join(dir, e), { recursive: true, force: true });
  }
}
const list = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : list.push([path.relative(dir, f), fs.statSync(f).size]); } }; walk(dir);
for (const [f, s] of list.sort()) console.log(`  ${f}  ${(s / 1024).toFixed(0)} KB`);
console.log(`Packed ${dir}: ${list.length} files, ${(list.reduce((t, x) => t + x[1], 0) / 1e6).toFixed(1)} MB${a.full ? ' (full)' : ''}`);
