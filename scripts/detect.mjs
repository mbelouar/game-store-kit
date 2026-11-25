#!/usr/bin/env node
// Detect a Capacitor or Unity game (Android / Google Play): name, package id, orientation, playable builds, art.
// Prints JSON. Usage: node detect.mjs [gameDir]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const has = p => fs.existsSync(path.join(root, p));
const read = p => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } };
const SKIP = new Set(['node_modules', '.git', 'store-assets', 'Library', 'Temp', 'Logs', 'obj', 'UserSettings', '.gradle', '.idea', '.vs']);

function walk(dir, depth = 0, out = []) {
  if (depth > 9 || out.length > 25000) return out;
  let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, depth + 1, out); else out.push(f);
  }
  return out;
}
if (!fs.existsSync(root)) { console.error('Folder not found: ' + root); process.exit(1); }
const files = walk(root);
const rel = f => path.relative(root, f);

const r = { root, engine: 'unsupported', name: path.basename(root), orientation: 'unknown', packageId: null,
  webEntry: null, apk: [], buildHints: [], art: [], fonts: [], notes: [] };

if (has('ProjectSettings/ProjectSettings.asset')) {
  // ------------------------------------------------------------------ Unity
  r.engine = 'unity';
  const ps = read('ProjectSettings/ProjectSettings.asset');
  r.unityVersion = (read('ProjectSettings/ProjectVersion.txt').match(/m_EditorVersion:\s*(\S+)/) || [])[1] || null;
  r.name = (ps.match(/productName:\s*(.+)/) || [])[1]?.trim() || r.name;
  r.packageId = (ps.match(/applicationIdentifier:[\s\S]*?Android:\s*(\S+)/) || [])[1] || null;
  const o = (ps.match(/defaultScreenOrientation:\s*(\d)/) || [])[1];   // 0 portrait, 1 upside down, 2/3 landscape, 4 auto
  if (o) r.orientation = ['portrait', 'portrait', 'landscape', 'landscape', 'auto'][+o] || 'unknown';
  if (r.orientation === 'auto') {   // auto-rotation: read which orientations the game actually allows
    const al = k => /^\s*1/.test((ps.match(new RegExp(`allowedAutorotateTo${k}:\\s*(\\d)`)) || [])[1] || '0');
    const por = al('Portrait') || al('PortraitUpsideDown'), lan = al('LandscapeRight') || al('LandscapeLeft');
    r.orientation = por && !lan ? 'portrait' : lan && !por ? 'landscape' : 'auto';
    if (r.orientation === 'auto') r.notes.push('Unity auto-rotation allows both portrait and landscape: capture a few frames in each and use the one the game is designed for (its UI/HUD will look right in it).');
  }
  // the editor version the project needs vs. the ones installed (opening with another version UPGRADES the project)
  const hubDirs = process.platform === 'darwin' ? ['/Applications/Unity/Hub/Editor'] : process.platform === 'win32' ? ['C:/Program Files/Unity/Hub/Editor'] : [path.join(process.env.HOME || '', 'Unity/Hub/Editor')];
  r.unityInstalled = hubDirs.flatMap(d => { try { return fs.readdirSync(d).filter(v => /^\d/.test(v)); } catch { return []; } });
  if (r.unityVersion && !r.unityInstalled.includes(r.unityVersion)) r.notes.push(`Unity ${r.unityVersion} is not installed (installed: ${r.unityInstalled.join(', ') || 'none'}). Opening or building with another version upgrades the project files: install the exact version in Unity Hub, or only build from a copy of the project.`);
  // Art already wired in Player Settings (icons, splash logos/backgrounds) is stored as GUIDs: resolve them to files.
  const metas = new Map();
  for (const f of files) if (f.endsWith('.meta') && /\.(png|jpe?g|psd|tga|tif|tiff|svg|exr)\.meta$/i.test(f)) {
    const g = (fs.readFileSync(f, 'utf8').match(/^guid:\s*([0-9a-f]{32})/m) || [])[1]; if (g) metas.set(g, rel(f.slice(0, -5)));
  }
  let key = ''; const used = new Map();
  for (const line of ps.split('\n')) {
    const k = line.match(/^\s*-?\s*(m_\w+|logo|m_Icon):/); if (k && !/fileID/.test(line.split(':')[0])) key = k[1];
    for (const m of line.matchAll(/guid:\s*([0-9a-f]{32})/g)) if (metas.has(m[1])) used.set(metas.get(m[1]), key.replace(/^m_/, ''));
  }
  r.unityArt = [...used].map(([p, usedAs]) => ({ path: p, usedAs }));
  if (r.unityArt.length) r.notes.push('Unity Player Settings already reference art (unityArt): look at these first; they are usually the real icon, logo and splash art.');
  // likely game art: whole-word matches, skipping fonts, editor tools and plugin folders
  const ART = /(^|[\s_\-.])(player|hero|char|character|enemy|boss|coins?|gems?|logo|title|icon|item|power|booster|chest|crown|star)([\s_\-.]|s?\.|$)/i;
  r.unitySprites = files.filter(f => { const p = rel(f); return /^Assets\//.test(p) && /\.(png|psd)$/i.test(f) && !/\/(Fonts?|Editor|Gizmos|Plugins|Constructor|ThirdParty|TextMesh Pro)\//i.test(p) && ART.test(path.basename(f)); }).map(rel).slice(0, 40);
  // Playable builds the developer already made (never build into the project without asking)
  const webgl = files.filter(f => /\.loader\.js$/.test(f) && /Build/.test(f)).map(f => path.dirname(path.dirname(f)));
  if (webgl.length) r.webEntry = rel(webgl[0]);
  r.buildHints.push(
    'Unity: use an APK/AAB or WebGL build the developer already made (apk/webEntry below).',
    'No build? Ask the developer to build one (File > Build Settings > Android > Build), or with their OK run Unity in batch mode with the output path inside store-assets/work/build/.');
} else if (has('capacitor.config.json') || has('capacitor.config.ts') || has('capacitor.config.js')) {
  // ------------------------------------------------------------------ Capacitor
  r.engine = 'capacitor';
  const cc = (() => { try { return JSON.parse(read('capacitor.config.json')); } catch { return {}; } })();
  const ts = read('capacitor.config.ts') + read('capacitor.config.js');
  r.name = cc.appName || (ts.match(/appName:\s*['"]([^'"]+)/) || [])[1] || r.name;
  r.packageId = cc.appId || (ts.match(/appId:\s*['"]([^'"]+)/) || [])[1] || null;
  const wd = cc.webDir || (ts.match(/webDir:\s*['"]([^'"]+)/) || [])[1] || 'www';
  if (has(path.join(wd, 'index.html'))) r.webEntry = wd;
  else r.notes.push(`Web build "${wd}/" not found: build a copy into store-assets/work/build/web (e.g. npx vite build --outDir <abs store-assets>/work/build/web --emptyOutDir).`);
  const pkg = (() => { try { return JSON.parse(read('package.json')); } catch { return {}; } })();
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  r.capacitorVersion = (deps['@capacitor/core'] || '').replace(/[\^~]/, '') || null;
  const lib = ['phaser', 'pixi.js', 'three', 'kaplay', 'kaboom', 'excalibur', '@babylonjs/core', 'babylonjs', 'melonjs', 'littlejsengine', 'p5'].find(l => deps[l]);
  if (lib) r.webEngine = lib;
  r.buildHints.push(`Capture the existing web build (${wd}/) in headless Chrome. Never run npm run build / cap sync / gradle in the project.`);
  const sp = cc.plugins?.SplashScreen;
  if (sp && sp.launchAutoHide === false) {
    const hides = files.filter(f => /\.(js|ts|html|mjs)$/.test(f) && !rel(f).startsWith('android')).slice(0, 400)
      .some(f => /SplashScreen\.hide|\.hide\(\)/.test(fs.readFileSync(f, 'utf8')));
    if (!hides) r.notes.push('capacitor.config: launchAutoHide is false but no SplashScreen.hide() call was found: the app may stay on the splash screen. Tell the user.');
  }
} else {
  r.notes.push('Not a Capacitor or Unity project. This skill supports Capacitor (web games wrapped for Android) and Unity games for Google Play only.');
}

// ------------------------------------------------------------------ shared: Android details
const gradle = read('android/app/build.gradle') + read('android/app/build.gradle.kts');
r.packageId ||= (gradle.match(/applicationId\s*=?\s*["']([^"']+)/) || [])[1] || null;
for (const f of files.filter(f => f.endsWith('AndroidManifest.xml')).slice(0, 4)) {
  const m = fs.readFileSync(f, 'utf8').match(/screenOrientation="(\w+)"/);
  if (m && r.orientation === 'unknown') r.orientation = /land/i.test(m[1]) ? 'landscape' : /port/i.test(m[1]) ? 'portrait' : r.orientation;
}
r.apk = files.filter(f => /\.(apk|aab)$/.test(f)).map(rel).slice(0, 10);

// ------------------------------------------------------------------ orientation hints for web (Capacitor) games
if (r.engine === 'capacitor' && r.orientation === 'unknown') {
  const src = files.filter(f => /\.(js|ts|mjs|html|css)$/.test(f) && !f.includes('.min.') && !rel(f).startsWith('android')).slice(0, 300)
    .map(f => fs.readFileSync(f, 'utf8').slice(0, 300000)).join('\n');
  // a "please rotate" overlay shown in landscape means the game is portrait (and vice versa)
  if (/@media[^{]*orientation\s*:\s*landscape[^{]*\{[^}]*rotate/i.test(src)) r.orientation = 'portrait';
  else if (/@media[^{]*orientation\s*:\s*portrait[^{]*\{[^}]*rotate/i.test(src)) r.orientation = 'landscape';
  if (r.orientation === 'unknown') {
    const code = src.replace(/@media[^{]*\{/g, '');
    const m = code.match(/width\s*:\s*(\d{3,4})\s*,\s*\n?\s*height\s*:\s*(\d{3,4})/) || code.match(/\b(?:VW|GAME_W|WIDTH)\s*=\s*(\d{3,4})[\s\S]{0,80}?\b(?:VH|GAME_H|HEIGHT)\s*=\s*(\d{3,4})/);
    if (m) r.orientation = +m[2] > +m[1] ? 'portrait' : 'landscape';
    else if (/screen\.orientation\.lock\(\s*['"]portrait/i.test(code)) r.orientation = 'portrait';
    else if (/screen\.orientation\.lock\(\s*['"]landscape/i.test(code)) r.orientation = 'landscape';
  }
}
if (r.orientation === 'unknown') r.notes.push('Orientation unknown: capture a few seconds, look at the frame, and switch --landscape if the game is letterboxed.');

// ------------------------------------------------------------------ Git LFS: art that was never downloaded is a tiny text pointer
if (/filter=lfs/.test(read('.gitattributes'))) {
  const sample = files.filter(f => /\.(png|jpe?g|psd|tga|wav|mp3|ogg|ttf|otf|fbx)$/i.test(f)).slice(0, 400);
  const ptr = sample.filter(f => { try { const fd = fs.openSync(f, 'r'), b = Buffer.alloc(40); fs.readSync(fd, b, 0, 40, 0); fs.closeSync(fd); return b.toString('utf8').startsWith('version https://git-lfs'); } catch { return false; } });
  r.lfsPointers = ptr.length;
  if (ptr.length) r.notes.push(`Git LFS assets are NOT downloaded: ${ptr.length} of ${sample.length} sampled art/audio files are LFS pointer files (e.g. ${rel(ptr[0])}). The art, sprites and fonts can't be used and Unity can't build until the user runs: git lfs install && git lfs pull (installing Git LFS first if needed). Ask the user; don't treat pointers as images.`);
}

// ------------------------------------------------------------------ art & fonts (template placeholders filtered out)
const placeholder = /(res\/(mipmap|drawable)[^/]*\/(ic_launcher|splash)|assets\/imgs\/logo\.png|favicon|UnityLogo|PackageCache)/i;
const imgs = files.filter(f => /\.(png|jpe?g|webp|svg)$/i.test(f) && !placeholder.test(rel(f)) && fs.statSync(f).size > 200).map(f => ({ f: rel(f), s: fs.statSync(f).size }));
const score = x => (/(icon|logo|title|splash|hero|player|char|boss|cover|key.?art|mascot)/i.test(x.f) ? 1e7 : 0) + x.s;
r.art = imgs.sort((a, b) => score(b) - score(a)).slice(0, 25).map(x => x.f);
r.fonts = files.filter(f => /\.(ttf|otf|woff2?)$/i.test(f)).map(rel).slice(0, 10);
if (has('android/app/src/main/res')) r.notes.push('android/res icons and splashes are usually template placeholders: look before using them as brand reference.');
if (has('store-assets/.kit/brand.json')) r.notes.push('store-assets/.kit exists: run pack.mjs --restore first and reuse brand.json (same look as the previous run).');
console.log(JSON.stringify(r, null, 2));
