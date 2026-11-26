#!/usr/bin/env node
// Build an installable Android APK of a Unity project for emulator capture, from a COPY of the project.
// The real project is never opened (Unity creates a multi-GB Library/ and, with another editor version, upgrades files).
//
//   node unity-build.mjs <project> --list                     show Unity editors and the project's own build methods
//   node unity-build.mjs <project> [--method Ns.Class.Method] [--editor 6000.x] [--out store-assets/work/build/game.apk]
//                                  [--work /tmp/gsk-unity/<name>] [--fresh]
// Without --method, a built-in builder makes a release APK (IL2CPP, ARM64, no .aab, no Development watermark).
// Prefer the project's own build method when it has guards (ads test mode, signing...): see --list.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { args } from './lib.mjs';

const a = args();
const project = path.resolve(a._[0] || '.');
const read = p => { try { return fs.readFileSync(path.join(project, p), 'utf8'); } catch { return ''; } };
if (!fs.existsSync(path.join(project, 'ProjectSettings/ProjectSettings.asset'))) { console.error('Not a Unity project: ' + project); process.exit(1); }
const need = (read('ProjectSettings/ProjectVersion.txt').match(/m_EditorVersion:\s*(\S+)/) || [])[1];
const HUB = process.platform === 'darwin' ? '/Applications/Unity/Hub/Editor' : process.platform === 'win32' ? 'C:/Program Files/Unity/Hub/Editor' : path.join(os.homedir(), 'Unity/Hub/Editor');
const exe = v => process.platform === 'darwin' ? path.join(HUB, v, 'Unity.app/Contents/MacOS/Unity') : process.platform === 'win32' ? path.join(HUB, v, 'Editor/Unity.exe') : path.join(HUB, v, 'Editor/Unity');
const cmp = (x, y) => x.localeCompare(y, undefined, { numeric: true });
const editors = (() => { try { return fs.readdirSync(HUB).filter(v => fs.existsSync(exe(v))).sort(cmp); } catch { return []; } })();
const hasAndroid = v => fs.existsSync(process.platform === 'darwin' ? path.join(HUB, v, 'PlaybackEngines/AndroidPlayer') : path.join(HUB, v, 'Editor/Data/PlaybackEngines/AndroidPlayer'));

// project build methods: public static void methods in Editor code that call BuildPipeline.BuildPlayer (directly or via a helper)
function buildMethods() {
  const out = [];
  const walk = d => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!['Library', 'Temp', 'Packages', 'GSK'].includes(e.name)) walk(f); } else if (e.name.endsWith('.cs')) {
    const src = fs.readFileSync(f, 'utf8'); if (!/BuildPipeline\.BuildPlayer/.test(src)) continue;
    const ns = (src.match(/namespace\s+([\w.]+)/) || [])[1], cls = (src.match(/(?:static\s+)?class\s+(\w+)/) || [])[1];
    for (const m of src.matchAll(/(\[MenuItem\("([^"]+)"[^\]]*\)\]\s*)?public\s+static\s+void\s+(\w+)\s*\(\s*\)/g)) {
      const name = m[3], menu = m[2] || '';
      if (/build|apk|aab|android|release/i.test(name + menu)) out.push({ method: [ns, cls, name].filter(Boolean).join('.'), menu, file: path.relative(project, f), apk: /apk/i.test(name + menu), dev: /develop/i.test(name + menu), aab: /aab|bundle|production/i.test(name + menu) });
    }
  } } };
  walk(path.join(project, 'Assets'));
  return out;
}

if (a.list) {
  console.log(`Project needs Unity ${need || '?'}`);
  console.log('Installed editors: ' + (editors.map(v => `${v}${v === need ? ' (exact)' : ''}${hasAndroid(v) ? ' +Android' : ' (no Android module)'}`).join(', ') || 'none'));
  const ms = buildMethods();
  console.log(ms.length ? 'Project build methods (prefer an APK, non-development one for screenshots):' : 'No project build methods found: the built-in builder will be used.');
  for (const m of ms) console.log(`  ${m.method}${m.menu ? `  [menu: ${m.menu}]` : ''}  ${[m.apk && 'APK', m.aab && 'AAB (not installable)', m.dev && 'development (adds a watermark)'].filter(Boolean).join(', ')}  (${m.file})`);
  process.exit(0);
}

// choose the editor: exact version, else the newest with Android support (the copy will be upgraded)
let ver = a.editor || (editors.includes(need) ? need : editors.filter(hasAndroid).pop());
if (!ver) { console.error('No Unity editor with Android Build Support installed. Install one in Unity Hub (Installs > Add modules > Android Build Support).'); process.exit(1); }
if (!hasAndroid(ver)) { console.error(`Unity ${ver} has no Android Build Support module. Unity Hub > Installs > ${ver} > Add modules.`); process.exit(1); }
if (ver !== need) console.log(`⚠ Project needs ${need}, building with ${ver}: the COPY is upgraded. Compile errors from API changes may appear; fix them in the copy only (or install ${need}).`);

// copy the project (rsync keeps a previous copy's Library/ for faster rebuilds unless --fresh)
const work = path.resolve(a.work || path.join(os.tmpdir(), 'gsk-unity', path.basename(project).replace(/\W+/g, '-')));
const copy = path.join(work, 'project');
if (a.fresh) fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(copy, { recursive: true });
const rs = spawnSync('rsync', ['-a', '--delete', '--exclude', '.git', '--exclude', '/Library', '--exclude', '/Temp', '--exclude', '/Logs', '--exclude', '/UserSettings', '--exclude', '/obj', '--exclude', '/Builds', '--exclude', '/store-assets', '--exclude', '/Assets/Editor/GSK', project + '/', copy + '/'], { stdio: 'inherit' });
if (rs.status !== 0) { console.error('copy failed'); process.exit(1); }
const lfs = spawnSync('grep', ['-rIl', '-m1', '^version https://git-lfs', path.join(copy, 'Assets')], { encoding: 'utf8' }).stdout.trim();
if (lfs) { console.error('✗ Git LFS files are not downloaded (e.g. ' + path.relative(copy, lfs.split('\n')[0]) + '). Run: git lfs install && git lfs pull in the project.'); process.exit(1); }

// built-in builder (copy only)
fs.mkdirSync(path.join(copy, 'Assets/Editor/GSK'), { recursive: true });
fs.writeFileSync(path.join(copy, 'Assets/Editor/GSK/GSKBuild.cs'), `// game-store-kit: APK of a COPY of the project for emulator capture (never added to the real project)
using System; using System.Linq; using UnityEditor; using UnityEditor.Build; using UnityEditor.Build.Reporting; using UnityEngine;
public static class GSKBuild {
  public static void BuildApk() {
    var output = Environment.GetEnvironmentVariable("GSK_APK") ?? "Builds/gsk.apk";
    EditorUserBuildSettings.buildAppBundle = false; EditorUserBuildSettings.exportAsGoogleAndroidProject = false;
    PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
    PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
    var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
    var r = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = scenes, locationPathName = output, target = BuildTarget.Android, options = BuildOptions.None });
    Debug.Log("[GSK] result " + r.summary.result + " " + r.summary.totalSize + " bytes");
    EditorApplication.Exit(r.summary.result == BuildResult.Succeeded ? 0 : 1);
  }
}
`);
const method = a.method || 'GSKBuild.BuildApk';
const apkTmp = path.join(work, 'gsk.apk'); fs.rmSync(apkTmp, { force: true });
const log = path.join(work, 'build.log');
const t0 = Date.now();
console.log(`Building with Unity ${ver}, method ${method} (first import of a big project can take a while)...`);
const r = spawnSync(exe(ver), ['-batchmode', '-quit', '-projectPath', copy, '-buildTarget', 'Android', '-executeMethod', method, '-logFile', log], { env: { ...process.env, GSK_APK: apkTmp }, stdio: 'ignore' });
const L = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
const mins = ((Date.now() - t0) / 60000).toFixed(1);
// find the APK: ours, or the newest .apk the project's method wrote inside the copy
let apk = fs.existsSync(apkTmp) ? apkTmp : null;
if (!apk) { const found = spawnSync('find', [copy, '-name', '*.apk', '-newer', path.join(copy, 'ProjectSettings/ProjectSettings.asset'), '-not', '-path', '*/Library/*'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean); apk = found.sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs)[0] || null; }
if (r.status !== 0 || !apk) {
  const uniq = arr => [...new Set(arr)];
  const cs = uniq(L.match(/^Assets\/[^\n]*error CS\d+[^\n]*/gm) || []);
  const guards = uniq((L.match(/(BuildFailedException|InvalidOperationException): [^\n]+/g) || []));
  const gradle = uniq((L.match(/(What went wrong:[\s\S]{0,300}|> Task [^\n]* FAILED)/g) || []));
  console.error(`✗ Build failed after ${mins} min (log: ${log})`);
  if (cs.length) console.error('Compile errors (fix them in the COPY only, at ' + copy + '):\n  ' + cs.slice(0, 10).join('\n  '));
  if (guards.length) console.error('The project stopped the build:\n  ' + guards.slice(0, 5).join('\n  ') + '\n  -> run `--list` and use the project\'s own build method with --method');
  if (gradle.length) console.error('Gradle:\n  ' + gradle.slice(0, 4).join('\n  '));
  if (/License|licens/i.test(L) && /(No valid|not activated|license is not)/i.test(L)) console.error('Unity license problem: sign in to Unity Hub and activate a license.');
  process.exit(1);
}
const out = path.resolve(a.out || path.join(project, 'store-assets', 'work', 'build', 'game.apk'));
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.copyFileSync(apk, out);
console.log(`✓ ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB) in ${mins} min. Copy kept at ${copy} for faster rebuilds.`);
