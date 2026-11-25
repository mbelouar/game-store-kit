---
name: game-store-kit
description: Play a Capacitor or Unity Android game and produce a premium, fully consistent Google Play kit: full-bleed captioned screenshots, a key-art feature graphic and splash, the 512 app icon and launcher-icon layers. Use when the user runs /game-store-kit or asks for Play Store screenshots, store graphics, an app icon or splash, or to make their game's store listing look premium. Supports Capacitor (web games wrapped for Android) and Unity games, Google Play only.
---

# Game Store Kit

**Scope:** Capacitor games (web games wrapped with Capacitor) and Unity games, Android, **Google Play only**. If `detect.mjs` reports `unsupported`, tell the user and stop.

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
4. **The skill never modifies the project.** Read the game's files, but never edit, create or delete anything outside `store-assets/`: no copying icons into `android/res`, no `.gitignore` edits, no `npm run build` into `dist/`, no `cap sync`, no Gradle or Unity builds into the project's own folders. If a build is needed to play the game, build a **copy** into `store-assets/work/build/` (Capacitor: `npx vite build --outDir "$PROJECT/store-assets/work/build/web" --emptyOutDir`; Unity: a batch-mode build with its output path under `work/build/`, only with the user's OK). If a build cannot avoid writing into the project (e.g. Android Gradle), ask the user first and say exactly what it will touch.
5. The folder must be **self-contained and movable**: the user moves `store-assets/` out of the project afterwards. All paths inside it are relative to it, and the last step (`pack.mjs`) leaves only what's needed.

Final contents of `store-assets/` (after pack): **only what's needed to publish on Google Play**:
```
play-store/
  icon-512.png                   Play Console > Store listing > App icon
  feature-graphic-1024x500.png   Play Console > Store listing > Feature graphic
  screenshots/phone-01..08.png   Play Console > Store listing > Phone screenshots (in order)
android-icon/
  foreground.png  background.png 1024px: Android Studio > app > res > New > Image Asset
                                 (Foreground layer: Path = foreground.png, Background layer: Path = background.png)
splash/
  splash-1080x1920.png  splash-1920x1080.png  splash-2732x2732.png   designed key-art splash
```
During a run, everything else (brand.json, plan.json, icon sources, frames, Android/splash renders, preview.html, `work/`) lives in `store-assets/` and is deleted by pack. `pack.mjs --full` keeps it all, only if the user asks to keep sources for later rebuilds.

**Golden rule — one brand bible.** `store-assets/brand.json` is the single source of truth (palette, fonts, style, captions). Every template reads it, so icon, splash, feature graphic and screenshots share the same colors, type, background system and grain. If `brand.json` already exists (a `--full` pack), **reuse it unchanged** unless the user asks for a new look. Otherwise derive it again from the game with the same rules (logo colors, mascot, genre font), which gives the same look.

## 0. Setup (first run only)

```bash
[ -d ~/.claude/skills/game-store-kit/scripts/node_modules ] || (cd ~/.claude/skills/game-store-kit/scripts && npm i --silent)
```
Needs Google Chrome (used headless), Node 18+, Python 3 with Pillow (`pip3 install pillow`). Android capture uses `adb`/`emulator` from `~/Library/Android/sdk`.

## 1. Understand the game (don't skip)

1. `node ~/.claude/skills/game-store-kit/scripts/detect.mjs "$PROJECT"` → engine, name, orientation, package id, web build, APKs, art and fonts.
2. Read the README, the main scene/game loop, input handling and menus. Write down: **controls**, **how to start a run**, **what an exciting moment looks like** (combo, boss, big explosion, level up, full board, near-win), **what progression exists** (levels, upgrades, characters, worlds), and anything you should avoid capturing (debug overlays, dev menus, ads).
3. Look at the hero art (Read the images detect listed): character, key objects, existing logo, fonts. **Beware template placeholders**: Capacitor starter icons and splashes (the blue Capacitor "X") and Unity's default icon are not the game's brand. Ignore them.
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
  "style": { "corner": 0.06, "grain": 0.07, "upper": true, "blurShot": true,
             "device": "bleed", "floaters": 4 },
  "logo": null,
  "items": ["brand/items/coin.png", "brand/items/gem.png", "brand/items/powerup.png"]
}
```
Rules:
- `primary` = the game's dominant saturated hue, `dark` = a deep shade of it (never pure #000), `accent` = the hottest highlight in the game (used for highlighted words, glow, badges), `secondary` = a supporting hue for background blobs. Check contrast: light text on primary/dark must be readable.
- Fonts are Google Fonts family names (or `displayFile`/`bodyFile` paths to the game's own font files, relative to `store-assets/`). Pick a display face that matches the genre: chunky rounded (Lilita One, Luckiest Guy, Titan One, Baloo 2) for casual; condensed/techy (Bebas Neue, Russo One, Orbitron, Chakra Petch) for action/sci-fi; serif display (Cinzel, Cormorant) for fantasy/RPG; pixel (Press Start 2P, Silkscreen) only for pixel-art games. If the game ships a font, prefer it.
- `logo`: path to a transparent wordmark PNG if the game has one; otherwise titles are set in the display font. **If the logo is drawn in the DOM (SVG/HTML title), grab it for real**:
  `GSK_PROJECT="$PROJECT" node ~/.claude/skills/game-store-kit/scripts/grab.mjs --root <webBuild> --selector ".logo svg" --play <play.mjs> --out "$PROJECT"/store-assets/brand/logo.png`
- **Real character art:** if characters are drawn in code (canvas), render them yourself at high resolution on transparent canvases through `page.evaluate` (call the game's own draw function with a big scale, trim, save as data URL) into `store-assets/brand/sprites/`. Use them for the icon and `decor`.
- Cartoon games with outlined type: set `style.textStroke` (the outline color, usually the game's ink color) and `style.strokeWidth` (≈0.012). If the icon uses a sunburst, set `style.burst` (`{"opacity":0.1,"glow":0.6}`) so the splash, feature graphic and screenshots echo it. `style.headline` (default 0.115 × width) is the one headline size for the whole set.
- `style.device`: **`"bleed"` (default)**: full-bleed gameplay, the style top games use and Google recommends (no device imagery). Other values: `"phone"`, a modern unbranded phone mockup (iPhone-18-like; `deviceFinish`: `black` | `silver` | `desert` | `brand`); Google discourages device frames, which can limit featuring. `"none"`: rounded cards. Use `phone` only if the user asks for it, e.g. for social posts.
- `items`: real collectibles/power-ups/enemies from the game as transparent PNGs (`brand/items/`). They float around the phone at different depths, decorate chips, and bridge between screenshots. **Get them from the game's own draw code**: if the code lives in a closure, make an *instrumented copy* of the web build in `store-assets/work/build/web` (inject `window.__gsk = { drawItem, drawEnemy, ... }` before the closure ends) and render each item at high scale on a transparent canvas, then trim. Never edit the real project build.
- `palette.py` prints `dominant` (often muddy) and `vivid` colors (characters, logo, FX). Brand colors usually come from `vivid` plus the logo.

## 3. Play the game and capture

Aim for **60–200 frames** from real play across different moments. capture-web defaults to a modern phone screen (402×874 @3x = 1206×2622, 19.5:9; landscape 2622×1206), so frames fill the phone mockup exactly.

**Capacitor games** (and Unity games that have a WebGL build): play the web build in headless Chrome.
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

**Unity games** (APK/AAB): use the build the developer already made (`apk` from detect), write a `store-assets/work/plan.txt` of real moves (`tap X Y`, `swipe ...`, `hold X Y MS`, `wait MS`, `shot TAG`), then:
```bash
GSK_PROJECT="$PROJECT" bash ~/.claude/skills/game-store-kit/scripts/capture-android.sh --package <id> --apk <apk> --plan "$PROJECT"/store-assets/work/plan.txt --out "$PROJECT"/store-assets/work/raw --duration 120
```
It boots the emulator if needed and enables demo mode (9:41, full battery, no notifications). For tricky games you can also drive the emulator interactively: take `adb exec-out screencap -p` shots, look at them, decide the next move.

**Unity project without any build:** ask the developer to build an APK (File > Build Settings > Android > Build). Building it yourself needs Unity in batch mode, and only with their OK, with the output inside `store-assets/work/build/`.

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
    { "image": "work/raw/frame-0031.png", "headline": "Outrun the *T-Rex*", "chips": ["Tap to jump", "Swipe to duck"],
      "focus": { "x": 0.28, "y": 0.62 }, "at": { "x": 0.48, "y": 0.8 }, "zoom": 1.32,
      "bridge": { "src": "brand/items/egg-blue.png", "y": 58, "size": 12 } },
    { "image": "work/raw/frame-0004-nest.png", "headline": "Hatch *6* dinos & 12 hats", "startAt": 0.21, "cropTop": 0.44, "zoom": 1.12, "floaterCount": 0 },
    { "image": "work/raw/frame-0054.png", "headline": "Dodge the *Lava Worm*", "chips": [{ "icon": "brand/items/egg.png", "text": "Volcano Valley" }] },
    { "image": "work/raw/frame-0124.png", "headline": "Grab *power-ups*",
      "chips": [{ "icon": "brand/items/pu-shield.png", "text": "Shield" }, { "icon": "brand/items/pu-magnet.png", "text": "Magnet" }],
      "callout": { "fx": 0.25, "fy": 0.465, "zoom": 3.2, "x": 76, "y": 62, "size": 34, "label": "Shield!" } }
  ],
  "feature": { "template": "work/splash-art.html" },
  "splash": { "template": "work/splash-art.html" }
}
```
Paths are relative to `store-assets/`.

**Make every screenshot feel full and premium, never empty** (each one combines these):
- **Headline** (2–5 words) and optionally **chips**: 1–3 glass pills with a real item icon ("Volcano Valley", "3 giant bosses", "Shield · Magnet · Rocket"). Use them on about half the shots.
- **Full-bleed gameplay (default)**: the frame fills the whole canvas, zoomed (`zoom`, ~1.3 in portrait) so the characters are big. `focus` = the point of the action in the frame (0–1), `at` = where it lands on the canvas (0–1). The HUD is pushed off the top (`hudCrop`, default 0.13 of the frame) and the headline sits on calm sky over a soft gradient. Aim for action in the lower 2/3, little empty ground, nothing important under the caption.
- **Menu or UI screens** (collection, map, upgrades): set `startAt` (≈0.21, the image starts below the caption with a soft fade) + `cropTop` (start at a clean section such as a card header, never half a button) + `zoom` ≈1.1 centred, `floaterCount: 0`. Check that nothing is cut at the sides and there's no empty strip at the bottom.
- (`device: "phone"` only) the phone with the real frame, alternating straight and tilted, rising off the bottom edge.
- **Floating real items** from `brand.items`. In full-bleed they stay in the corners (one far item at the top, at most one blurred foreground item at the bottom) and **never cover the action**. In phone mode they surround the phone at three depths. Override per shot with `floaters: [...]` / `floaterCount`.
- **`callout`**: a zoom bubble on a small but exciting detail (a power-up, a combo counter, a rare item). `fx`/`fy` = focus point in the frame (0–1), `zoom` = how many bubble-widths the frame spans, `x`/`y` = bubble centre (% of canvas), `size` = % of the short side, `label` = short pill text. Use it on 1–2 shots.
- **`bridge`**: an item straddling the right edge (enemy, meteor, egg). It continues on the next screenshot, so the set reads as one panorama in the store carousel. Use it on every other shot.
- **`decor`**: a hero character popping out over the phone edge (0–1 per shot, at most 2 per set).
- Bokeh, sunburst and grain come from `brand.style`.

Caption craft:
- Verb-first, benefit or emotion, not features ("Outsmart 100 bosses", not "Boss levels included"). Highlight ONE word with `*word*`. Same voice across the set. Screenshot #1 headline = the game's core promise.
- Hyphenated words ("T-Rex") never break across lines.

**Splash and feature graphic = designed key art, never "logo on a gameplay frame".** Write `store-assets/work/splash-art.html`. It loads `kit/_base.css`, `kit/_base.js` and `kit/scene.js` (build copies them next to it) and composes a scene with `SCENE`:
`sky(stops)`, `glow(x,y,r,color)`, `rays(x,y,{count,opacity})`, `ridge({y,amp,color,kind:'hills'|'mountains'|'volcano'|'dunes',trees:'palm'|'pine'|'round',blur,highlight,glowColor})`, `comet(x1,y1,x2,y2,{head,width})`, `sprite(src,x,y,size,{rot,flip,glowColor,filter,blur})`, `speed(x,y,{angle,len})`, `particles('embers'|'sparkles'|'snow'|'leaves'|'fireflies',n,{area})`, `vignette()`, `grain()`.
Design process:
1. **Concept first.** Write one line: the game's dramatic promise as a single frozen moment (DinoDash: "Meteor incoming: Rexy leaps clear while the Giant T-Rex charges out of the jungle at dusk"). Think key art or a movie poster, not a menu screen.
2. **Story.** The hero mid-action (jump, swing, drift) + the threat or goal (boss, meteor, finish line) + a hint of reward (coins, gems).
3. **Depth.** At least 3 parallax layers (far range, mid silhouettes, near ground), lighter and hazier far, darker near. Atmospheric light from one dramatic source (meteor, sun, portal, lava). Darken secondary characters (`filter: 'brightness(.72)'`) so the hero pops.
4. **Palette** from the game's worlds, pushed toward dusk/neon drama, still reading as the same game.
5. **Logo** large at the top with a soft glow, part of the scene and not a sticker.
6. **One page, all sizes.** Use `o(portrait, landscape, square, feature)` values so 1080×1920, 1920×1080, 2732² and the 1024×500 feature graphic each get their own composition. Keep key elements away from the outer ~8% (crops and masks).
7. Render, look at all four, fix overlaps, empty areas and tangents, and repeat until it looks like a poster.

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
  splash/splash-1080x1920.png  splash-1920x1080.png  splash-2732x2732.png
  android-icon/foreground.png  background.png
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
- [ ] Every screenshot feels full: headline + big gameplay + chips, callout or bridge on alternating shots. No HUD under the caption, no big empty ground or sky band, no item covering the action, no character cut at an edge.
- [ ] Menu shots start at a clean section (no half buttons or headers under the fade), centred, no empty strip at the bottom.
- [ ] Bridges line up across neighbouring screenshots (same y and size).
- [ ] Splash and feature graphic are composed key art (concept, story, depth, light), not a logo on a frame; they work at every size.
- [ ] Spec check in `preview.html` passes.

Tweak `brand.json` (colors/style) or `plan.json` (captions/frames/crops/layout), never hand-edit PNGs.

## 9. Check, show, then pack

1. Confirm nothing outside `store-assets/` changed (must print nothing unless the user approved a build):
```bash
find "$PROJECT" -newer "$PROJECT/store-assets/brand.json" -not -path "$PROJECT/store-assets/*" -not -path "*/node_modules/*" -type f | head
```
2. Show the user the result (send the screenshots, feature graphic and icon, or open `preview.html`) and say which icon concept you chose and why. Make changes they ask for now, because sources are deleted next.
3. Pack. Only the Play Store files, the Image Asset sources and the splash remain:
```bash
GSK_PROJECT="$PROJECT" node ~/.claude/skills/game-store-kit/scripts/pack.mjs
```
4. Tell the user where each file goes (the table above). Do **not** copy anything into the project. The user adds the icon in Android Studio (Image Asset) and builds the AAB themselves.
