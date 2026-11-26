#!/usr/bin/env python3
"""Split a sprite sheet / atlas into separate sprites using the transparent gaps between them
(not a fixed grid, so sprites of different sizes come out whole).
Usage: slice.py SHEET.png OUT_DIR [--prefix name] [--min 0.002] [--gap 6]
  --min  ignore pieces smaller than this fraction of the sheet area (sparkles, stray pixels)
  --gap  pixels of transparency that still count as one sprite (joins shadows / detached parts)
Prints the saved files in reading order (top-to-bottom rows, then left-to-right)."""
import argparse, os, sys
from collections import deque
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("sheet"); ap.add_argument("out"); ap.add_argument("--prefix", default=None)
ap.add_argument("--min", type=float, default=0.002); ap.add_argument("--gap", type=int, default=6)
a = ap.parse_args()

im = Image.open(a.sheet).convert("RGBA")
W, H = im.size
k = max(1, round(max(W, H) / 700))                      # work on a small mask for speed
mask = im.getchannel("A").point(lambda v: 255 if v > 16 else 0)
small = mask.resize((max(1, W // k), max(1, H // k)), Image.NEAREST)
if a.gap > 0: small = small.filter(ImageFilter.MaxFilter(max(3, (a.gap // k) * 2 + 1)))
w, h = small.size; px = small.load(); seen = bytearray(w * h); boxes = []
for y in range(h):
    for x in range(w):
        if px[x, y] and not seen[y * w + x]:
            q = deque([(x, y)]); seen[y * w + x] = 1; x0 = x1 = x; y0 = y1 = y; n = 0
            while q:
                cx, cy = q.popleft(); n += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny] and not seen[ny * w + nx]:
                        seen[ny * w + nx] = 1; q.append((nx, ny))
            if n >= a.min * w * h: boxes.append((x0 * k, y0 * k, min(W, (x1 + 1) * k), min(H, (y1 + 1) * k)))
# reading order: group into rows by vertical overlap, then left to right
boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
rows = []
for b in boxes:
    if rows and b[1] < rows[-1][-1][3] - (rows[-1][-1][3] - rows[-1][-1][1]) * 0.35: rows[-1].append(b)
    else: rows.append([b])
ordered = [b for r in rows for b in sorted(r, key=lambda b: b[0])]
os.makedirs(a.out, exist_ok=True)
prefix = a.prefix or os.path.splitext(os.path.basename(a.sheet))[0]
for i, b in enumerate(ordered, 1):
    piece = im.crop(b); bb = piece.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    if bb: piece = piece.crop(bb)
    f = os.path.join(a.out, f"{prefix}-{i:02d}.png"); piece.save(f)
    print(f"{f}  {piece.size[0]}x{piece.size[1]}")
if not ordered: sys.exit("no sprites found (is the sheet transparent?)")
