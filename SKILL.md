---
name: game-store-kit
description: Play the game in the current folder and produce a premium, fully consistent store kit — Google Play screenshots, feature graphic, app icon (Play 512, Android adaptive + mipmaps, iOS 1024) and splash screens. Use when the user runs /game-store-kit, or asks for "store assets", "Play Store screenshots", "app icon and splash", "store listing graphics" or "make my game look premium" for a game project (web/Phaser/Pixi/Three, Flutter, Unity, Godot, Android, React Native/Expo).
---

# Game Store Kit

Run inside a game's folder. You **play the game for real**, capture the best moments, and turn them into a store kit that looks like one art director made every piece.

Scripts live in `~/.claude/skills/game-store-kit/scripts`.

## Output location — hard rule

**Every generated file goes into `<PROJECT>/store-assets/`**, where `<PROJECT>` is the game project the user is working in (the session's working directory; if that is a subfolder, its nearest parent with `.git` / `package.json` / `pubspec.yaml` / `project.godot` / `ProjectSettings` / Gradle settings).

1. At the very start, resolve it once and keep it for the whole run:
   ```bash
   PROJECT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; export GSK_PROJECT="$PROJECT"; mkdir -p "$PROJECT/store-assets"; echo "$PROJECT/store-assets"
   ```
   Tell the user this path in one line before starting. Prefix every script call with `GSK_PROJECT="$PROJECT"` (shell state does not persist between commands) and use absolute paths under `$PROJECT/store-assets` for every file you write.
2. Never write outputs to the home folder, `/tmp`, the scratchpad, the skill's own folder, or any other project. If you `cd` (e.g. into a build dir), outputs still go to `$PROJECT/store-assets`.
3. **Logo work too:** when using the `logo-generator` skill, put its concepts, showcase page and PNG exports in `$PROJECT/store-assets/icon/concepts/` — not in a `logos/` folder or anywhere else.
4. **The skill never modifies the project.** Read the game's files, but never edit, create or delete anything outside `store-assets/`: no copying icons into `android/res`, no `.gitignore` edits, no `npm run build` into `dist/`, no `cap sync`, no Gradle/Flutter/Unity/Godot builds into the project's own folders. If a build is needed to play the game, build a **copy** into `store-assets/work/build/` (e.g. `npx vite build --outDir "$PROJECT/store-assets/work/build/web" --emptyOutDir`, `flutter build web --output ...`, a Godot export path under `work/build/`). If a build cannot avoid writing into the project (e.g. Android Gradle), ask the user first and say exactly what it will touch.
5. The folder must be **self-contained and movable**: the user moves `store-assets/` out of the project afterwards. All paths inside it are relative to it, and the last step (`pack.mjs`) leaves only what's needed.

Final layout of `store-assets/` (after pack):
```
README.md  preview.html  brand.json  plan.json
play-store/   icon-512.png  feature-graphic-1024x500.png  screenshots/
android/res/  launcher icons + adaptive layers + Android 12 splash icon (ready to copy, not copied)
ios/          AppIcon-1024.png
splash/       portrait, landscape, 2732² splash
icon/         icon.svg fg.svg bg.svg mono.svg + concepts/
brand/        logo + character sprites from the game
source/       frames/ (only the frames used) + scripts/ (play script)
```
During a run, `work/` holds scratch (raw captures, contact sheet, temp builds); pack deletes it.

**Golden rule — one brand bible.** `store-assets/brand.json` is the single source of truth (palette, fonts, style, captions). Every template reads it, so icon, splash, feature graphic and screenshots share the same colors, type, background system and grain. If `brand.json` already exists, **reuse it unchanged** unless the user asks for a new look — that is what keeps the game consistent across runs.

## 0. Setup (first run only)

```bash
[ -d ~/.claude/skills/game-store-kit/scripts/node_modules ] || (cd ~/.claude/skills/game-store-kit/scripts && npm i --silent)
```
Needs Google Chrome (used headless), Node 18+, Python 3 with Pillow (`pip3 install pillow`). Android capture uses `adb`/`emulator` from `~/Library/Android/sdk`.

## 1. Understand the game (don't skip)

1. `node ~/.claude/skills/game-store-kit/scripts/detect.mjs "$PROJECT"` → engine, name, orientation, package id, web build, APKs, art and fonts.
2. Read the README, the main scene/game loop, input handling and menus. Write down: **controls**, **how to start a run**, **what an exciting moment looks like** (combo, boss, big explosion, level up, full board, near-win), **what progression exists** (levels, upgrades, characters, worlds), and anything you should avoid capturing (debug overlays, dev menus, ads).
3. Look at the hero art (Read the images detect listed): character, key objects, existing logo, fonts. **Beware template placeholders**: Capacitor/Flutter/Android starter icons and splashes (e.g. the blue Capacitor "X") are not the game's brand. Ignore them.
4. **Verify orientation** from detect *and* the first captured frame. If the game is letterboxed (capture-web aborts with `⚠ ORIENTATION`), switch `--landscape` on or off. Never build a kit from letterboxed frames.
5. **Find the hooks you'll drive it with.** Look for: an existing demo/attract-mode AI (e.g. `ai()`, `autoplay`, `bot`), debug flags (`?debug`, `window.__debug`), save keys in localStorage, start functions (`startGame(mode, opts)`), and menu actions (`data-act`, button ids). If the game code is wrapped in a closure/IIFE, globals won't be reachable from `page.evaluate`: use the debug hook (`--query debug`) or click its own UI buttons.

## 2. Brand bible → `store-assets/brand.json`

If missing, create it. Pull colors from the game itself, not your imagination:
`python3 ~/.claude/skills/game-store-kit/scripts/palette.py <3-6 key art files or early frames>`

```json
{
  "name": "Neon Drift",
  "tagline": "One thumb. Endless speed.",
  "genre": "arcade racer", "mood": "electric, fast, night-city",
  "orientation": "portrait",
  "colors": { "primary": "#5b21ff", "secondary": "#ff2d95", "accent": "#ffe14d", "dark": "#0a0620", "light": "#ffffff", "text": "#ffffff" },
  "fonts": { "display": "Lilita One", "body": "Nunito" },
  "style": { "corner": 0.06, "grain": 0.07, "upper": true, "blurShot": true },
  "logo": null
}
```
Rules:
- `primary` = the game's dominant saturated hue, `dark` = a deep shade of it (never pure #000), `accent` = the hottest highlight in the game (used for highlighted words, glow, badges), `secondary` = a supporting hue for background blobs. Check contrast: light text on primary/dark must be readable.
- Fonts are Google Fonts family names (or `displayFile`/`bodyFile` paths to the game's own font files, relative to `store-assets/`). Pick a display face that matches the genre: chunky rounded (Lilita One, Luckiest Guy, Titan One, Baloo 2) for casual; condensed/techy (Bebas Neue, Russo One, Orbitron, Chakra Petch) for action/sci-fi; serif display (Cinzel, Cormorant) for fantasy/RPG; pixel (Press Start 2P, Silkscreen) only for pixel-art games. If the game ships a font, prefer it.
- `logo`: path to a transparent wordmark PNG if the game has one; otherwise titles are set in the display font. **If the logo is drawn in the DOM (SVG/HTML title), grab it for real**:
  `GSK_PROJECT="$PROJECT" node ~/.claude/skills/game-store-kit/scripts/grab.mjs --root <webBuild> --selector ".logo svg" --play <play.mjs> --out "$PROJECT"/store-assets/brand/logo.png`
- **Real character art:** if characters are drawn in code (canvas), render them yourself at high resolution on transparent canvases through `page.evaluate` (call the game's own draw function with a big scale, trim, save as data URL) into `store-assets/brand/sprites/`. Use them for the icon and `decor`.
- Cartoon games with outlined type: set `style.textStroke` (the outline color, usually the game's ink color) and `style.strokeWidth` (≈0.012). If the icon uses a sunburst, set `style.burst` (`{"opacity":0.1,"glow":0.6}`) so the splash, feature graphic and screenshots echo it. `style.headline` (default 0.115 × width) is the one headline size for the whole set.
- `palette.py` prints `dominant` (often muddy) and `vivid` colors (characters, logo, FX). Brand colors usually come from `vivid` plus the logo.

## 3. Play the game and capture

Aim for **60–200 frames** from real play across different moments. Capture at final resolution: portrait 1080×1920, landscape 1920×1080.

**Web builds** (web games, or Flutter/Godot/Unity web export — build one if needed, see `buildHints` from detect):
1. Write `store-assets/work/play.mjs` tailored to THIS game from what you learned in step 1:
```js
export async function before({ page }) {                // before load: seed a save so the tutorial is skipped and content is unlocked
  await page.addInitScript(() => localStorage.setItem('<saveKey>', JSON.stringify({ tutorialDone: true /* ... */ })));
}
export async function setup({ page, sleep, shot }) {    // get past title / tutorial; shot('home'), shot('map') of progression screens
  await page.mouse.click(270, 700); await sleep(1500);
}
export default async function step({ page, t, i, sleep, w, h, shot }) {
  // real strategy: dodge, aim, jump on rhythm, merge matching tiles... not random mashing
  // you can call page.evaluate() to read game state (score, enemies) and react to it,
  // or to make the scene more spectacular (spawn more enemies, unlock a later level, give power-ups)
  // call await shot('boss') at peak moments to force a capture
  // return 'stop' to end early (e.g. after the last planned session)
}
```
Best strategy when the game has its own AI: drive it from a `setInterval` in the page (`G.ai(dt)`), keep the run alive (top up lives), and play **one short session per world/era/mode/boss/character** (about 15s each) so the frames cover everything. Turn sound off in the seeded save.
2. Run it (portrait default; add `--landscape` for landscape games; `--url` for a dev server; `--query debug` to append `?debug`; `--selector canvas` to crop to the game canvas):
```bash
GSK_PROJECT="$PROJECT" node ~/.claude/skills/game-store-kit/scripts/capture-web.mjs --root <webBuildDir> --play "$PROJECT"/store-assets/work/play.mjs --out "$PROJECT"/store-assets/work/raw --duration 120 --interval 1200
```
3. If the frames show the game didn't start, died instantly or is stuck on a menu: fix `play.mjs` and re-run. Check `raw/_console.log` for errors. Several short sessions (different levels/modes) beat one long one.

**Android builds** (native, Unity/Flutter/RN APKs): build or find the APK, write a `store-assets/work/plan.txt` of real moves (`tap X Y`, `swipe ...`, `hold X Y MS`, `wait MS`, `shot TAG`), then:
```bash
GSK_PROJECT="$PROJECT" bash ~/.claude/skills/game-store-kit/scripts/capture-android.sh --package <id> --apk <apk> --plan "$PROJECT"/store-assets/work/plan.txt --out "$PROJECT"/store-assets/work/raw --duration 120
```
It boots the emulator if needed and enables demo mode (9:41, full battery, no notifications). For tricky games you can also drive the emulator interactively: take `adb exec-out screencap -p` shots, look at them, decide the next move.

**Unity/Godot editor-only projects:** build to Web if a Web export exists, else Android; ask the user only if neither build works.

## 4. Choose the hero moments

```bash
python3 ~/.claude/skills/game-store-kit/scripts/pick.py "$PROJECT"/store-assets/work/raw --top 16 --out "$PROJECT"/store-assets/work
```
Read `store-assets/work/contact-sheet.png` (and the full-size candidates you like). The picker favours variety (different scenes or colors), but always check: if one world dominates, build a strip of frames sampled across the whole capture and choose by eye. Choose **5–8 frames** that tell the story in order:
1. The hook — the most spectacular, readable gameplay moment (this is screenshot #1; it decides the install).
2. The core loop clearly visible.
3. Variety — a different level/world/biome/enemy.
4. Progression — upgrades, characters, collection, map.
5. Peak intensity — boss, combo, chaos.
6. (optional) Reward/social/modes.
Reject: transitions, half-loaded scenes, pause/debug/ad overlays, game-over screens, near-duplicates, tiny unreadable HUD-only frames. If no frame is good enough for a slot, go back and play more for it.

## 5. Icon (be creative — use the `logo-generator` skill)

Invoke the **logo-generator** skill for its exploration method (6+ genuinely different concepts, a showcase page, design rationale) but apply these **game-icon rules**, which override its minimal corporate-logo defaults:
- Subject comes from the game: the hero character's face/silhouette, the signature object or power-up, or the core mechanic as a symbol. Never generic clip-art. **If the game has a mascot, compose the icon from its real rendered sprite** (embed the PNG as a data URI `<image>` in the SVG). Use logo-generator-style vector symbols only for games without a character.
- Background must **contrast with the subject** (green dino → warm orange/yellow sunburst, not green on green). Keep the subject's whole head inside the frame, and keep tiny extras (meteors, sparkles) out of the corners: masks cut them off.
- One focal element, big: fills ~70–80% of the square; bold silhouette that reads at 48px; 2–4 colors from `brand.json`; rich lighting (gradients, rim light, soft inner shadow, glow) is welcome — game icons are richer than corporate logos.
- **No text** (at most a single letter if the brand is a letter). No thin strokes.
- Full-bleed square, **no rounded corners, no transparency** (stores mask it). viewBox `0 0 1024 1024`.
- Make 3+ concepts, render each at 1024 and 48px, look at them side by side, pick the strongest yourself (state why), and keep the others in `store-assets/icon/concepts/` so the user can switch later.
- If the user has a Gemini key and wants a painterly/3D icon, the **nanobanana** skill can render one using the chosen SVG + a real game frame as reference; still export the final as the files below.

Write the final as:
- `store-assets/icon/icon.svg` — full icon (background + subject).
- `store-assets/icon/bg.svg` — background only (viewBox 0 0 108 108 or 1024, full-bleed).
- `store-assets/icon/fg.svg` — subject only on transparent, **kept inside the centre 66/108 (61%) circle** for adaptive-icon safe zone; also used as the Android 12 splash icon.
- `store-assets/icon/mono.svg` (optional) — single-color silhouette for Android 13 themed icons.

## 6. Plan the kit → `store-assets/plan.json`

```json
{
  "screenshots": [
    { "image": "work/raw/frame-0042.png", "headline": "Drift through a *neon* city", "sub": "One-thumb controls" },
    { "image": "work/raw/frame-0077.png", "headline": "Chain *insane* combos", "badge": "NEW" },
    { "image": "work/raw/frame-0103.png", "headline": "Beat the *boss*", "crop": "50% 35%",
      "decor": [{ "src": "../assets/sprites/coin.png", "x": 88, "y": 30, "size": 14, "rot": 12 }] }
  ],
  "feature": { "image": "work/raw/frame-0042.png", "sub": "One thumb. Endless speed." },
  "splash": { "foot": "Loading" },
  "tablet": false
}
```
Paths are relative to `store-assets/`.
Caption craft (this is most of the "premium" feeling):
- 2–5 words, verb-first, benefit/emotion, not features ("Outsmart 100 bosses", not "Boss levels included"). Highlight ONE word with `*word*`. Same voice and tense across the set. No exclamation marks, no ALL-CAPS in the source (style handles case).
- Screenshot #1 headline = the game's core promise.
- `layout` is automatic (portrait alternates `top` / `tilt`, with the frame bleeding off the bottom; landscape uses `split`). `bottom` exists but crops the HUD off the top, so use it only with a reason.
- Hyphenated words ("T-Rex") never break across lines.
- `decor`: 0–2 real sprites from the game (transparent PNGs) popping out of the frame on at most half the shots — consistent size and drop shadow. Never invent art the game doesn't have. `size` is a % of the short side; keep decor away from the headline; add `"land": {x,y,size}` to override the position in landscape renders (splash 1920×1080).
- Splash: `"noIcon": true` shows the logo (scaled by `logoScale`, default 0.78) with an optional hero sprite as decor; `image` tints the background with a gameplay frame.
- `crop` (CSS object-position) to center the action when the frame isn't the screen's aspect.

## 7. Build everything

```bash
GSK_PROJECT="$PROJECT" node ~/.claude/skills/game-store-kit/scripts/build.mjs            # or --only icons,shots,feature,splash
```
Produces:
```
store-assets/
  play-store/icon-512.png  feature-graphic-1024x500.png  screenshots/phone-01..08.png (tablet-* if enabled)
  android/res/mipmap-*/ic_launcher{,_round,_foreground,_background,_monochrome}.png
  android/res/mipmap-anydpi-v26/ic_launcher.xml   android/res/drawable-nodpi/splash_icon.png
  ios/AppIcon-1024.png
  splash/splash-1080x1920.png  splash-1920x1080.png  splash-2732x2732.png
  preview.html            (gallery + spec check)
```
It flattens alpha where stores forbid it and validates Play specs (icon 512² ≤1MB; feature 1024×500; 2–8 screenshots, aspect ≤2:1, ≤8MB).

## 8. Art-direct your own output (mandatory)

Read every rendered PNG. Fix and rebuild until all are true:
- [ ] Headlines fully visible, not overlapping the game frame or HUD, same size rhythm across the set.
- [ ] The set reads as one panorama: same background system, colors, type, corner radius, shadows.
- [ ] Screenshot #1 is the strongest image; no two consecutive shots feel the same.
- [ ] Game frames are sharp (no upscaled blur) and show real gameplay.
- [ ] Icon reads at 48px; matches splash and feature graphic colors.
- [ ] Feature graphic: title/logo readable at thumbnail size, nothing important in the outer 10% edges.
- [ ] Splash: centered, calm, on-brand; no text other than name/logo.
- [ ] Spec check in `preview.html` passes.

Tweak `brand.json` (colors/style) or `plan.json` (captions/frames/crops/layout), never hand-edit PNGs.

## 9. Pack and hand off

```bash
GSK_PROJECT="$PROJECT" node ~/.claude/skills/game-store-kit/scripts/pack.mjs
```
Keeps only the needed outputs (used frames move to `source/frames/`, `plan.json` is rewritten to match), deletes `work/`, and writes `README.md` (what each file is and where to upload it). Then confirm nothing outside `store-assets/` changed:
```bash
find "$PROJECT" -newer "$PROJECT/store-assets/brand.json" -not -path "$PROJECT/store-assets/*" -not -path "*/node_modules/*" -type f | head
```
(Anything listed must be explained: it should be empty unless the user approved a build.)

Show `store-assets/preview.html`, list what was made, and say which icon concept you chose and why. Offer localized captions or another icon concept. Do **not** offer to copy files into the project. `README.md` tells the user where each file goes.
