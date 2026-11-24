# game-store-kit

A [Claude Code](https://claude.com/claude-code) skill that **plays your game** and turns the best moments into a premium, consistent store kit:

- **Google Play**: 512 icon, 1024×500 feature graphic, 2–8 captioned phone screenshots (optional tablet)
- **Android**: launcher icons for every density, adaptive icon layers (foreground, background, monochrome) and the Android 12 splash icon
- **iOS**: 1024 App Store icon
- **Splash screens**: portrait, landscape and 2732² universal
- `preview.html` gallery plus a Play Store spec check

Every asset reads one brand file (`brand.json`: palette, fonts, style), so the icon, splash, feature graphic and screenshots look like one art director made them. Later runs reuse it, so the look stays the same.

## How it works
1. **Understands the game**: detects the engine (web/Phaser/Pixi/Three, Capacitor, Flutter, Unity, Godot, Android, React Native/Expo), orientation, controls, bosses, worlds and progression.
2. **Plays it for real**: headless Chrome for web builds, or the Android emulator via adb. Claude writes a play script for your specific game, and uses the game's own demo AI or debug hooks when it has them.
3. **Picks hero moments**: scores the frames, drops duplicates and favours variety across worlds and modes.
4. **Takes real art from the game**: grabs your in-game logo and renders your characters at high resolution, then designs the icon around your mascot.
5. **Renders and checks everything** with HTML templates, reviews its own output and fixes problems.
6. **Packs** a clean, self-contained `store-assets/` folder with a README that says where each file is uploaded.

**It never modifies your project.** Everything goes into `<project>/store-assets/`, which you can move anywhere afterwards.

## Install
```bash
git clone https://github.com/mbelouar/game-store-kit ~/.claude/skills/game-store-kit
cd ~/.claude/skills/game-store-kit/scripts && npm i
```
Requirements: Google Chrome, Node 18+, Python 3 with Pillow (`pip3 install pillow`). For Android capture you also need the Android SDK (`adb`, `emulator`) with at least one AVD.

Optional: the [logo-generator](https://github.com/op7418/logo-generator-skill) skill, for broader icon exploration on games without a mascot.

## Use
Open Claude Code in your game's folder and run:
```
/game-store-kit
```
To regenerate after tweaking `brand.json` or `plan.json` (captions, frames, crops):
```bash
node ~/.claude/skills/game-store-kit/scripts/build.mjs --dir path/to/store-assets
```

## Scripts
| Script | What it does |
|---|---|
| `detect.mjs` | Engine, name, orientation, package id, web build, art |
| `capture-web.mjs` | Plays a web build in headless Chrome with a per-game `play.mjs`, capturing frames |
| `capture-android.sh` | Same on an emulator or device (demo-mode status bar) |
| `pick.py` | Scores frames, removes duplicates, picks for variety, makes a contact sheet |
| `palette.py` | Dominant and vivid colors from game art |
| `grab.mjs` | Captures a DOM element (such as the in-game logo) as a transparent PNG |
| `render.mjs` / `build.mjs` | Renders every asset at exact store sizes from `brand.json` and `plan.json` |
| `finalize.py` | Flattens transparency where stores require it, checks specs, writes `preview.html` |
| `pack.mjs` | Keeps only the needed outputs and writes the folder README |

## License
MIT
