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
// Same simple output for Capacitor and Unity: android-icon/ (Image Asset / Player Settings layers) + splash/.
// Optional, only when asked: capacitor-assets/ for the @capacitor/assets CLI (brand.capacitorAssets = true).
const capAssets = brand.capacitorAssets === true;
const jobs = [];
const pngSize = f => { const b = fs.readFileSync(path.resolve(dir, f)); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
const exists = p => fs.existsSync(R(p));

// ---------- ICONS ----------
if (want('icons') && exists('icon/icon.svg')) {
  jobs.push({ template: 'icon/icon.svg', out: R('icon/icon-1024.png'), w: 1024, h: 1024 });
  jobs.push({ template: 'icon/icon.svg', out: R('play-store/icon-512.png'), w: 512, h: 512 });
  // Android Studio > res > New > Image Asset (Foreground/Background layer -> Path), or Unity Player Settings > Icon
  if (exists('icon/fg.svg')) jobs.push({ template: 'icon/fg.svg', out: R('android-icon/foreground.png'), w: 1024, h: 1024, transparent: true });
  if (exists('icon/bg.svg')) jobs.push({ template: 'icon/bg.svg', out: R('android-icon/background.png'), w: 1024, h: 1024 });
  if (capAssets) {
    jobs.push({ template: 'icon/icon.svg', out: R('capacitor-assets/icon-only.png'), w: 1024, h: 1024 });
    if (exists('icon/fg.svg')) jobs.push({ template: 'icon/fg.svg', out: R('capacitor-assets/icon-foreground.png'), w: 1024, h: 1024, transparent: true });
    if (exists('icon/bg.svg')) jobs.push({ template: 'icon/bg.svg', out: R('capacitor-assets/icon-background.png'), w: 1024, h: 1024 });
  }
}
// render icon first so templates can use it
if (jobs.length) { run(jobs.splice(0)); }
if (exists('icon/icon-1024.png')) brand.iconPng = 'icon/icon-1024.png';

// ---------- SCREENSHOTS ----------
// phone (required) + optional 7" and 10" tablet sets (Google needs 4+ tablet screenshots to feature a game on tablets).
// All 9:16 / 16:9 within Play's 1080-7680 px range. Per shot, `tabletImage` can point to a frame captured on a
// tablet emulator (better when the game's layout changes on tablets); otherwise the phone frame is reused.
// Localized sets: plan.locales = { "fr-FR": { screenshots: [{ headline, sub, chips, badge, callout: { label } }], feature: {...} } }
// Only texts are translated; frames, crops, layout and decor come from the main plan, so every language matches.
const shots = plan.screenshots || [];
const TEXT_KEYS = ['headline', 'sub', 'chips', 'badge'];
function screenshotJobs(list, base, lang) {
  const sizes = [{ dir: 'screenshots', tag: 'phone', w: 1080, h: 1920 }];
  if (plan.tablet) sizes.push({ dir: 'screenshots-7inch', tag: 'tablet7', w: 1440, h: 2560, tablet: true }, { dir: 'screenshots-10inch', tag: 'tablet10', w: 2160, h: 3840, tablet: true });
  for (const sz of sizes) {
    const [w, h] = portrait ? [sz.w, sz.h] : [sz.h, sz.w];
    list.forEach((s, i) => {
      const image = (sz.tablet && s.tabletImage) || s.image;
      const dim = pngSize(image); const aspect = (sz.tablet && s.tabletImage ? null : s.aspect) || (dim ? dim[0] / dim[1] : undefined);
      jobs.push({ template: 'screenshot', out: R(`${base}/${sz.dir}/${sz.tag}-${String(i + 1).padStart(2, '0')}.png`), w, h,
        data: { ...s, image, aspect, lang, index: i, total: list.length, bridgeLeft: i > 0 ? list[i - 1].bridge : undefined } });
    });
  }
}
if (want('shots') && shots.length) {
  // a rebuild replaces the whole set: stale shots from an earlier plan must not stay mixed in
  for (const d of ['screenshots', 'screenshots-7inch', 'screenshots-10inch', 'locales']) fs.rmSync(R('play-store/' + d), { recursive: true, force: true });
  screenshotJobs(shots, 'play-store', brand.language || 'en-US');
  for (const [lang, loc] of Object.entries(plan.locales || {})) {
    const tr = loc.screenshots || [];
    if (tr.length && tr.length !== shots.length) console.warn(`⚠ locale ${lang}: ${tr.length} translated shots for ${shots.length} screenshots (missing ones keep the original text)`);
    const merged = shots.map((s, i) => {
      const t = tr[i] || {}; const m = { ...s };
      for (const k of TEXT_KEYS) if (t[k] !== undefined) m[k] = t[k];
      if (s.callout && t.callout?.label) m.callout = { ...s.callout, label: t.callout.label };
      return m;
    });
    screenshotJobs(merged, `play-store/locales/${lang}`, lang);
  }
}
// ---------- FEATURE GRAPHIC ----------
// plan.feature.template can point at the same key-art page as the splash (premium listings use the key art here)
if (want('feature') && plan.feature) {
  const ft = plan.feature.template;
  if (ft) { const kit = path.join(path.dirname(R(ft)), 'kit'); fs.mkdirSync(kit, { recursive: true }); for (const f of ['_base.css', '_base.js', 'scene.js']) fs.copyFileSync(path.join(here, '..', 'templates', f), path.join(kit, f)); }
  jobs.push({ template: ft || 'feature', out: R('play-store/feature-graphic-1024x500.png'), w: 1024, h: 500, data: { ...plan.feature, feature: true, lang: brand.language || 'en-US' } });
  // a localized feature graphic only when the locale translates its text (key art with just the logo stays shared)
  for (const [lang, loc] of Object.entries(plan.locales || {})) if (loc.feature)
    jobs.push({ template: ft || 'feature', out: R(`play-store/locales/${lang}/feature-graphic-1024x500.png`), w: 1024, h: 500, data: { ...plan.feature, ...loc.feature, feature: true, lang } });
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
  jobs.push({ template: tpl, out: R('splash/splash-1080x1920.png'), w: 1080, h: 1920, data: sp });
  jobs.push({ template: tpl, out: R('splash/splash-1920x1080.png'), w: 1920, h: 1080, data: sp });
  jobs.push({ template: tpl, out: R('splash/splash-2732x2732.png'), w: 2732, h: 2732, data: sp });
}
if (jobs.length) run(jobs);

// ---------- STORE LISTING EXPERIMENTS (A/B variants) ----------
// plan.variants = { "B": { "hypothesis": "...", "order": [3,1,2,4], "screenshots": [{ "headline": ... }],
//                          "style": {...}, "colors": {...}, "icon": "icon/concepts/X.svg", "feature": {...} } }
// Each variant renders only what it changes into play-store/experiments/<name>/ (Play Console > Store listing experiments).
if ((want('shots') || want('variants')) && plan.variants) {
  fs.rmSync(R('play-store/experiments'), { recursive: true, force: true });
  for (const [name, v] of Object.entries(plan.variants)) {
    const base = `play-store/experiments/${name}`, vjobs = [];
    const vbrand = { ...brand, colors: { ...brand.colors, ...(v.colors || {}) }, style: { ...brand.style, ...(v.style || {}) } };
    const changesShots = v.order || v.screenshots || v.style || v.colors;
    if (changesShots && shots.length) {
      const order = (v.order || shots.map((_, i) => i + 1)).map(n => n - 1).filter(i => shots[i]);
      const list = order.map((i, k) => { const t = (v.screenshots || [])[k] || {}; const m = { ...shots[i] }; for (const key of TEXT_KEYS) if (t[key] !== undefined) m[key] = t[key]; if (m.callout && t.callout?.label) m.callout = { ...m.callout, label: t.callout.label }; return m; });
      list.forEach((s, k) => { const dim = pngSize(s.image);
        vjobs.push({ template: 'screenshot', out: R(`${base}/screenshots/phone-${String(k + 1).padStart(2, '0')}.png`), w: portrait ? 1080 : 1920, h: portrait ? 1920 : 1080,
          data: { ...s, aspect: s.aspect || (dim ? dim[0] / dim[1] : undefined), lang: brand.language || 'en-US', index: k, total: list.length, bridgeLeft: k > 0 ? list[k - 1].bridge : undefined } }); });
    }
    if (v.icon) vjobs.push({ template: v.icon, out: R(`${base}/icon-512.png`), w: 512, h: 512 });
    if (v.feature || (plan.feature && (v.style || v.colors))) {
      const f = { ...plan.feature, ...(v.feature || {}) };
      vjobs.push({ template: f.template || 'feature', out: R(`${base}/feature-graphic-1024x500.png`), w: 1024, h: 500, data: { ...f, feature: true } });
    }
    if (vjobs.length) run(vjobs, vbrand);
    const parts = [changesShots && 'screenshots', v.icon && 'app icon', (v.feature || (plan.feature && (v.style || v.colors))) && 'feature graphic'].filter(Boolean);
    fs.mkdirSync(R(base), { recursive: true });
    fs.writeFileSync(R(`${base}/experiment.md`), `# Store listing experiment: variant ${name}

**Hypothesis:** ${v.hypothesis || '(write what this variant tests and why it might win)'}

**Changes vs. the current listing:** ${parts.join(', ') || 'text only'}${v.order ? ` (screenshot order ${v.order.join(', ')})` : ''}.

Play Console > Grow users > Store listing experiments > Create experiment (default graphics):
- Target metric: retained first-time installers; audience 50% (or less to limit risk); run at least 7 days and until Play shows a confident result.
- Variant ${name}: upload ${parts.length ? parts.map(p => ({ screenshots: '`screenshots/`', 'app icon': '`icon-512.png`', 'feature graphic': '`feature-graphic-1024x500.png`' })[p]).join(', ') + ' from this folder' : 'the text below'}.
- Test one idea at a time (icon OR screenshots OR text), otherwise you can't tell what made the difference.
`);
  }
}
// optional @capacitor/assets splash sources = the 2732 key art (light and dark)
if (capAssets && want('splash') && exists('splash/splash-2732x2732.png')) for (const n of ['splash', 'splash-dark']) fs.copyFileSync(R('splash/splash-2732x2732.png'), R(`capacitor-assets/${n}.png`));
execFileSync('python3', [path.join(here, 'finalize.py'), dir], { stdio: 'inherit' });
// store listing text: limits + Play metadata policy, and play-store/store-listing.md (paste-ready)
if (exists('listing.json')) { try { execFileSync('node', [path.join(here, 'listing.mjs'), '--dir', dir], { stdio: 'inherit' }); } catch { /* errors already printed */ } }

function run(list, brandOverride) {
  const jf = R('.jobs.tmp.json'); // temp, removed below: a rebuild must not leave scratch behind
  fs.writeFileSync(jf, JSON.stringify(list, null, 2));
  if (exists('icon/icon-1024.png')) brand.iconPng = 'icon/icon-1024.png';
  const bf = R('.brand.resolved.json'); // lives in store-assets/ so relative paths resolve there
  fs.writeFileSync(bf, JSON.stringify(brandOverride || brand, null, 2));
  try { execFileSync('node', [path.join(here, 'render.mjs'), jf, '--brand', bf], { stdio: 'inherit' }); }
  finally { fs.rmSync(bf, { force: true }); fs.rmSync(jf, { force: true }); }
}
