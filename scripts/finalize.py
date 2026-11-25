#!/usr/bin/env python3
"""Flatten alpha where stores forbid it, validate Play Store / App Store specs, write preview.html.
Usage: finalize.py store-assets"""
import os, sys, glob, json, html
from PIL import Image

d = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "store-assets")
brand = json.load(open(os.path.join(d, "brand.json")))
bgc = brand.get("colors", {}).get("dark", "#000000")
problems, rows = [], []

def flatten(p):
    im = Image.open(p)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA"); bg = Image.new("RGB", im.size, bgc); bg.paste(im, mask=im.split()[3]); bg.save(p, optimize=True)

def check(p, w=None, h=None, max_kb=None, ratio=None, opaque=False):
    if not os.path.exists(p): return
    if opaque: flatten(p)
    im = Image.open(p); kb = os.path.getsize(p) / 1024; ok = True
    if w and im.size != (w, h): problems.append(f"{os.path.relpath(p, d)} is {im.size}, expected {w}x{h}"); ok = False
    if max_kb and kb > max_kb:
        if p.endswith(".png") and opaque:  # re-save as high quality JPEG next to it
            j = p[:-4] + ".jpg"; im.convert("RGB").save(j, quality=92, optimize=True); problems.append(f"{os.path.basename(p)} {kb:.0f}KB > {max_kb}KB, wrote {os.path.basename(j)}")
        else: problems.append(f"{os.path.relpath(p, d)} {kb:.0f}KB > {max_kb}KB"); ok = False
    if ratio:
        a, b = max(im.size), min(im.size)
        if a / b > ratio + 1e-6: problems.append(f"{os.path.basename(p)} aspect {a/b:.2f} > {ratio}"); ok = False
    rows.append((os.path.relpath(p, d), f"{im.size[0]}x{im.size[1]}", f"{kb:.0f} KB", im.mode, "✓" if ok else "✗"))

check(os.path.join(d, "play-store/icon-512.png"), 512, 512, 1024)
check(os.path.join(d, "play-store/feature-graphic-1024x500.png"), 1024, 500, 15 * 1024, opaque=True)
shots = sorted(glob.glob(os.path.join(d, "play-store/screenshots/*.png")))
for p in shots: check(p, max_kb=8 * 1024, ratio=2.0, opaque=True)
phone = [p for p in shots if "phone" in os.path.basename(p)]
if phone and not 2 <= len(phone) <= 8: problems.append(f"Play Store needs 2-8 phone screenshots (have {len(phone)}); 4+ at 1080px for game promotion")
for p in sorted(glob.glob(os.path.join(d, "splash/*.png"))): check(p, opaque=True)
# @capacitor/assets sources (Capacitor games): icons >= 1024, splash >= 2732, opaque except the foreground layer
CA = os.path.join(d, "capacitor-assets")
if os.path.isdir(CA):
    for n in ("icon-only", "icon-background"): check(os.path.join(CA, n + ".png"), 1024, 1024, opaque=True)
    check(os.path.join(CA, "icon-foreground.png"), 1024, 1024)
    for n in ("splash", "splash-dark"): check(os.path.join(CA, n + ".png"), 2732, 2732, opaque=True)
    for n in ("icon-only", "icon-foreground", "icon-background", "splash", "splash-dark"):
        if not os.path.exists(os.path.join(CA, n + ".png")): problems.append(f"capacitor-assets/{n}.png missing")
# Image Asset / Unity icon layers
for n in ("foreground", "background"): check(os.path.join(d, "android-icon", n + ".png"), 1024, 1024, opaque=(n == "background"))

# preview page
def tile(p, cls=""):
    r = os.path.relpath(p, d); return f'<figure class="{cls}"><img src="{html.escape(r)}"><figcaption>{html.escape(r)}</figcaption></figure>'
sec = lambda title, items, cls="": f"<h2>{title}</h2><div class='row {cls}'>{''.join(items)}</div>" if items else ""
icons = [p for p in [os.path.join(d, "play-store/icon-512.png")] if os.path.exists(p)]
layers = sorted(glob.glob(os.path.join(d, "capacitor-assets/*.png")) + glob.glob(os.path.join(d, "android-icon/*.png")))
page = f"""<!doctype html><meta charset=utf-8><title>{html.escape(brand.get('name','Game'))} — store assets</title>
<style>body{{background:#0d0d10;color:#eee;font:14px -apple-system,system-ui,sans-serif;padding:32px}}h1{{font-size:28px}}h2{{margin:36px 0 12px;font-size:16px;letter-spacing:.08em;text-transform:uppercase;color:#aaa}}
.row{{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}}figure{{margin:0}}figure img{{display:block;max-height:560px;max-width:100%;border-radius:10px;box-shadow:0 8px 30px #0008}}
.icons img{{height:160px;border-radius:22%}}.small img{{height:110px}}figcaption{{font-size:11px;color:#888;margin-top:6px}}table{{border-collapse:collapse;margin-top:12px}}td{{padding:3px 12px;border-bottom:1px solid #222;font-size:12px}}.warn{{color:#fb7}}</style>
<h1>{html.escape(brand.get('name','Game'))}</h1><div>{html.escape(brand.get('tagline',''))}</div>
{sec('Icon', [tile(p) for p in icons], 'icons')}
{sec('Feature graphic', [tile(os.path.join(d,'play-store/feature-graphic-1024x500.png'))] if os.path.exists(os.path.join(d,'play-store/feature-graphic-1024x500.png')) else [])}
{sec('Phone screenshots', [tile(p) for p in phone])}
{sec('Tablet screenshots', [tile(p) for p in shots if 'tablet' in os.path.basename(p)])}
{sec('Splash', [tile(p) for p in sorted(glob.glob(os.path.join(d,'splash/*.png')))])}
{sec('Icon layers and splash sources', [tile(p) for p in layers], 'small')}
<h2>Spec check</h2>{''.join(f"<div class=warn>⚠ {html.escape(x)}</div>" for x in problems) or '<div>All checks passed ✓</div>'}
<table>{''.join('<tr>'+''.join(f'<td>{html.escape(c)}</td>' for c in r)+'</tr>' for r in rows)}</table>"""
open(os.path.join(d, "preview.html"), "w").write(page)
print("\n".join("  ".join(r) for r in rows))
print("\nPROBLEMS:\n- " + "\n- ".join(problems) if problems else "\nAll spec checks passed ✓")
print("Preview:", os.path.join(d, "preview.html"))
