#!/usr/bin/env node
// Detect the game's engine/platform, name, orientation hints and candidate art. Prints JSON.
// Usage: node detect.mjs [gameDir]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const has = p => fs.existsSync(path.join(root, p));
const read = p => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } };
const SKIP = new Set(['node_modules', '.git', 'store-assets', 'Library', 'Temp', 'build', 'Build', '.dart_tool', '.gradle', 'Pods', '.godot', 'obj', 'dist-ssr']);

function walk(dir, depth = 0, out = []) {
  if (depth > 6 || out.length > 4000) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, depth + 1, out); else out.push(f);
  }
  return out;
}
const files = walk(root);
const rel = f => path.relative(root, f);

const r = { root, engine: 'unknown', name: path.basename(root), orientation: 'unknown', packageId: null, webEntry: null, apk: [], buildHints: [], art: [], fonts: [], notes: [] };

const pkg = (() => { try { return JSON.parse(read('package.json')); } catch { return null; } })();
if (has('pubspec.yaml')) {
  r.engine = 'flutter';
  r.name = (read('pubspec.yaml').match(/^name:\s*(\S+)/m) || [])[1] || r.name;
  r.buildHints.push('flutter build web --release --output <store-assets>/work/build/web  (Flutter 3.22+; preferred for capture)', 'APK only if no web build: flutter build apk (writes build/ in the project: ask the user first)');
  if (has('build/web/index.html')) r.webEntry = 'build/web';
} else if (has('ProjectSettings/ProjectSettings.asset')) {
  r.engine = 'unity';
  const ps = read('ProjectSettings/ProjectSettings.asset');
  r.name = (ps.match(/productName:\s*(.+)/) || [])[1]?.trim() || r.name;
  r.packageId = (ps.match(/Android:\s*(\S+\.\S+)/) || [])[1] || null;
  const o = (ps.match(/defaultScreenOrientation:\s*(\d)/) || [])[1];
  if (o) r.orientation = ['portrait', 'portrait', 'landscape', 'landscape', 'auto'][+o] || 'unknown';
  r.buildHints.push('Unity: build WebGL (preferred) into <store-assets>/work/build/web via -batchmode/unity-cli; never into the project');
} else if (has('project.godot')) {
  r.engine = 'godot';
  const pg = read('project.godot');
  r.name = (pg.match(/config\/name="([^"]+)"/) || [])[1] || r.name;
  const w = +(pg.match(/window\/size\/viewport_width=(\d+)/) || [])[1], h = +(pg.match(/window\/size\/viewport_height=(\d+)/) || [])[1];
  if (w && h) r.orientation = h > w ? 'portrait' : 'landscape';
  r.buildHints.push('godot --headless --export-release "Web" <store-assets>/work/build/web/index.html  (needs a Web export preset)');
} else if (has('capacitor.config.json') || has('capacitor.config.ts') || has('config.xml') && /cordova/i.test(read('config.xml'))) {
  r.engine = 'capacitor(web)';
  const cc = (() => { try { return JSON.parse(read('capacitor.config.json')); } catch { return {}; } })();
  const ts = read('capacitor.config.ts');
  r.name = cc.appName || (ts.match(/appName:\s*['"]([^'"]+)/) || [])[1] || r.name;
  r.packageId = cc.appId || (ts.match(/appId:\s*['"]([^'"]+)/) || [])[1] || null;
  const wd = cc.webDir || (ts.match(/webDir:\s*['"]([^'"]+)/) || [])[1] || 'www';
  if (has(path.join(wd, 'index.html'))) r.webEntry = wd;
  r.buildHints.push('Web game wrapped with Capacitor: capture the existing web build (' + wd + '). If it is missing/stale, build a copy into <store-assets>/work/build/web (e.g. `npx vite build --outDir <abs store-assets>/work/build/web --emptyOutDir`); never run `npm run build` / `cap sync` / gradle in the project.');
} else if (has('android/app/build.gradle') || has('app/build.gradle') || has('android/app/build.gradle.kts') || has('app/build.gradle.kts')) {
  r.engine = pkg?.dependencies?.['react-native'] ? (pkg.dependencies.expo ? 'expo' : 'react-native') : 'android';
} else if (pkg?.dependencies?.expo) {
  r.engine = 'expo';
}
if (r.engine === 'unknown' || r.engine === 'expo' || r.engine === 'react-native') {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const webLibs = ['phaser', 'pixi.js', 'three', 'kaboom', 'kaplay', 'excalibur', 'babylonjs', '@babylonjs/core', 'melonjs', 'littlejsengine', 'p5'];
  const lib = webLibs.find(l => deps[l]);
  if (r.engine === 'unknown' && (lib || has('index.html') || pkg)) r.engine = 'web' + (lib ? ':' + lib : '');
  if (pkg?.name) r.name = pkg.displayName || pkg.name;
  if (pkg?.scripts) r.buildHints.push('npm scripts: ' + Object.keys(pkg.scripts).join(', ') + '  (do not run ones that write into the project; build copies into <store-assets>/work/build/)');
  for (const d of ['dist', 'build', 'public', 'docs', 'www', '.']) if (has(path.join(d, 'index.html'))) { r.webEntry = d; break; }
}

// Android package id + orientation from gradle / manifest / app.json
const gradle = read('android/app/build.gradle') + read('app/build.gradle') + read('android/app/build.gradle.kts') + read('app/build.gradle.kts');
r.packageId ||= (gradle.match(/applicationId\s*=?\s*["']([^"']+)/) || [])[1] || null;
const appJson = (() => { try { return JSON.parse(read('app.json')).expo; } catch { return null; } })();
if (appJson) { r.name = appJson.name || r.name; r.packageId ||= appJson.android?.package; if (appJson.orientation) r.orientation = appJson.orientation; }
for (const f of files.filter(f => f.endsWith('AndroidManifest.xml')).slice(0, 3)) {
  const m = fs.readFileSync(f, 'utf8').match(/screenOrientation="(\w+)"/);
  if (m && r.orientation === 'unknown') r.orientation = /land/i.test(m[1]) ? 'landscape' : /port/i.test(m[1]) ? 'portrait' : r.orientation;
}
// Web orientation hints
const src = files.filter(f => /\.(js|ts|mjs|html)$/.test(f) && !f.includes('.min.')).slice(0, 300).map(f => fs.readFileSync(f, 'utf8').slice(0, 200000)).join('\n');
if (r.orientation === 'unknown') {
  // a "please rotate" overlay shown in landscape means the game is portrait (and vice versa)
  if (/@media[^{]*orientation\s*:\s*landscape[^{]*\{[^}]*(rotate)/i.test(src)) r.orientation = 'portrait';
  else if (/@media[^{]*orientation\s*:\s*portrait[^{]*\{[^}]*(rotate)/i.test(src)) r.orientation = 'landscape';
}
if (r.orientation === 'unknown') {
  const code = src.replace(/@media[^{]*\{/g, ''); // media queries are not the game's orientation
  const m = code.match(/width\s*:\s*(\d{3,4})\s*,\s*\n?\s*height\s*:\s*(\d{3,4})/) || code.match(/\b(?:VW|GAME_W|WIDTH)\s*=\s*(\d{3,4})[\s\S]{0,80}?\b(?:VH|GAME_H|HEIGHT)\s*=\s*(\d{3,4})/);
  if (m) r.orientation = +m[2] > +m[1] ? 'portrait' : 'landscape';
  else if (/screen\.orientation\.lock\(\s*['"]portrait/i.test(code)) r.orientation = 'portrait';
  else if (/screen\.orientation\.lock\(\s*['"]landscape/i.test(code)) r.orientation = 'landscape';
}
if (r.orientation === 'unknown') r.notes.push('Orientation unknown: capture 5s in portrait, look at the frame, switch to --landscape if the game is letterboxed.');
const title = (read(path.join(r.webEntry || '.', 'index.html')).match(/<title>([^<]+)<\/title>/i) || [])[1];
if (title && r.engine.startsWith('web')) r.name = title.trim();
if (title && r.engine.startsWith('capacitor') && /^(app|capacitor-app)$/i.test(r.name)) r.name = title.trim();

r.apk = files.filter(f => f.endsWith('.apk') || f.endsWith('.aab')).map(rel).slice(0, 10);
const imgs = files.filter(f => /\.(png|jpe?g|webp|svg)$/i.test(f)).map(f => ({ f: rel(f), s: fs.statSync(f).size }));
const score = x => (/(icon|logo|title|splash|hero|player|char|boss|cover|key.?art)/i.test(x.f) ? 1e7 : 0) + x.s;
const placeholder = /(res\/(mipmap|drawable)[^/]*\/(ic_launcher|splash)|assets\/imgs\/logo\.png|AppIcon\.appiconset|favicon)/i;
if (r.engine.startsWith('capacitor') || r.engine === 'android') r.notes.push('Files under android/res (ic_launcher*, splash*) are often Capacitor/Android template placeholders: look before using them as brand reference.');
r.art = imgs.filter(x => !placeholder.test(x.f)).sort((a, b) => score(b) - score(a)).slice(0, 25).map(x => x.f);
r.fonts = files.filter(f => /\.(ttf|otf|woff2?)$/i.test(f)).map(rel).slice(0, 10);
if (has('store-assets/brand.json')) r.notes.push('store-assets/brand.json exists: REUSE it (consistency across runs).');
console.log(JSON.stringify(r, null, 2));
