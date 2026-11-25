#!/usr/bin/env node
// One command that renders EVERY asset from store-assets/brand.json + store-assets/plan.json.
// Usage (from the game folder): node <skill>/scripts/build.mjs [--dir store-assets] [--only icons,shots,feature,splash]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { args, outDir } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const a = args();
const dir = path.resolve(a.dir || outDir());
if (!fs.existsSync(path.join(dir, 'brand.json'))) { console.error(`No brand.json in ${dir}. Create store-assets/brand.json in the game project first.`); process.exit(1); }
console.log(`Output folder: ${dir}`);
const only = a.only ? new Set(a.only.split(',')) : null;
const want = k => !only || only.has(k);
const R = p => path.join(dir, p);
const brand = JSON.parse(fs.readFileSync(R('brand.json'), 'utf8'));
const plan = fs.existsSync(R('plan.json')) ? JSON.parse(fs.readFileSync(R('plan.json'), 'utf8')) : {};
const portrait = (brand.orientation || 'portrait') !== 'landscape';
// Capacitor games get @capacitor/assets sources (capacitor-assets/), Unity games get Image Asset layers + splash/
const capacitor = /^capacitor/i.test(brand.engine || '');
const jobs = [];
const pngSize = f => { const b = fs.readFileSync(path.resolve(dir, f)); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
const exists = p => fs.existsSync(R(p));

// ---------- ICONS ----------
if (want('icons') && exists('icon/icon.svg')) {
  jobs.push({ template: 'icon/icon.svg', out: R('icon/icon-1024.png'), w: 1024, h: 1024 });
  jobs.push({ template: 'icon/icon.svg', out: R('play-store/icon-512.png'), w: 512, h: 512 });
  if (capacitor) {
    // input files for `npx @capacitor/assets generate --android --assetPath store-assets/capacitor-assets`
    jobs.push({ template: 'icon/icon.svg', out: R('capacitor-assets/icon-only.png'), w: 1024, h: 1024 });
    if (exists('icon/fg.svg')) jobs.push({ template: 'icon/fg.svg', out: R('capacitor-assets/icon-foreground.png'), w: 1024, h: 1024, transparent: true });
    if (exists('icon/bg.svg')) jobs.push({ template: 'icon/bg.svg', out: R('capacitor-assets/icon-background.png'), w: 1024, h: 1024 });
  } else {
    // Unity: Player Settings > Icon (adaptive layers) or Android Studio > res > New > Image Asset
    if (exists('icon/fg.svg')) jobs.push({ template: 'icon/fg.svg', out: R('android-icon/foreground.png'), w: 1024, h: 1024, transparent: true });
    if (exists('icon/bg.svg')) jobs.push({ template: 'icon/bg.svg', out: R('android-icon/background.png'), w: 1024, h: 1024 });
  }
}
// render icon first so templates can use it
if (jobs.length) { run(jobs.splice(0)); }
if (exists('icon/icon-1024.png')) brand.iconPng = 'icon/icon-1024.png';

// ---------- SCREENSHOTS ----------
const shots = plan.screenshots || [];
if (want('shots') && shots.length) {
  const sizes = [{ tag: 'phone', w: portrait ? 1080 : 1920, h: portrait ? 1920 : 1080 }];
  if (plan.tablet) sizes.push({ tag: 'tablet', w: portrait ? 1440 : 2560, h: portrait ? 2560 : 1440 });
  for (const sz of sizes) shots.forEach((s, i) => {
    const dim = pngSize(s.image); const aspect = s.aspect || (dim ? dim[0] / dim[1] : undefined);
    jobs.push({ template: 'screenshot', out: R(`play-store/screenshots/${sz.tag}-${String(i + 1).padStart(2, '0')}.png`), w: sz.w, h: sz.h,
      data: { ...s, aspect, index: i, total: shots.length, bridgeLeft: i > 0 ? shots[i - 1].bridge : undefined } });
  });
}
// ---------- FEATURE GRAPHIC ----------
// plan.feature.template can point at the same key-art page as the splash (premium listings use the key art here)
if (want('feature') && plan.feature) {
  const ft = plan.feature.template;
  if (ft) { const kit = path.join(path.dirname(R(ft)), 'kit'); fs.mkdirSync(kit, { recursive: true }); for (const f of ['_base.css', '_base.js', 'scene.js']) fs.copyFileSync(path.join(here, '..', 'templates', f), path.join(kit, f)); }
  jobs.push({ template: ft || 'feature', out: R('play-store/feature-graphic-1024x500.png'), w: 1024, h: 500, data: { ...plan.feature, feature: true } });
}
// ---------- SPLASH ----------
if (want('splash')) {
  const sp = plan.splash || {};
  // plan.splash.template = a custom key-art page (e.g. "work/splash-art.html") built with templates/scene.js
  const tpl = sp.template || 'splash';
  if (sp.template) { // custom pages load kit/_base.css, kit/_base.js, kit/scene.js from the same folder
    const kit = path.join(path.dirname(R(sp.template)), 'kit'); fs.mkdirSync(kit, { recursive: true });
    for (const f of ['_base.css', '_base.js', 'scene.js']) fs.copyFileSync(path.join(here, '..', 'templates', f), path.join(kit, f));
  }
  if (capacitor) {
    // one 2732x2732 source; @capacitor/assets crops it for every Android screen (keep key elements in the centre)
    jobs.push({ template: tpl, out: R('capacitor-assets/splash.png'), w: 2732, h: 2732, data: sp });
  } else {
    jobs.push({ template: tpl, out: R('splash/splash-1080x1920.png'), w: 1080, h: 1920, data: sp });
    jobs.push({ template: tpl, out: R('splash/splash-1920x1080.png'), w: 1920, h: 1080, data: sp });
    jobs.push({ template: tpl, out: R('splash/splash-2732x2732.png'), w: 2732, h: 2732, data: sp });
  }
}
if (jobs.length) run(jobs);
// dark-mode splash: same key art unless the game provides a dark version (plan.splash.dark = template path)
if (capacitor && want('splash') && exists('capacitor-assets/splash.png') && !(plan.splash || {}).dark) fs.copyFileSync(R('capacitor-assets/splash.png'), R('capacitor-assets/splash-dark.png'));
execFileSync('python3', [path.join(here, 'finalize.py'), dir], { stdio: 'inherit' });

function run(list) {
  const jf = R('.jobs.tmp.json'); // temp, removed below: a rebuild must not leave scratch behind
  fs.writeFileSync(jf, JSON.stringify(list, null, 2));
  if (exists('icon/icon-1024.png')) brand.iconPng = 'icon/icon-1024.png';
  const bf = R('.brand.resolved.json'); // lives in store-assets/ so relative paths resolve there
  fs.writeFileSync(bf, JSON.stringify(brand, null, 2));
  try { execFileSync('node', [path.join(here, 'render.mjs'), jf, '--brand', bf], { stdio: 'inherit' }); }
  finally { fs.rmSync(bf, { force: true }); fs.rmSync(jf, { force: true }); }
}
