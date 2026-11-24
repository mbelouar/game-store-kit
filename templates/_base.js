// Shared look for every template so all assets share ONE visual system.
// Reads window.BRAND (store-assets/brand.json) and window.JOB (per-asset data).
(function () {
  const B = window.BRAND || {}, J = window.JOB || {};
  const C = Object.assign({ primary: '#6d28d9', secondary: '#db2777', accent: '#facc15', dark: '#0b0720', light: '#ffffff', text: '#ffffff' }, B.colors || {});
  const F = Object.assign({ display: 'Lilita One', body: 'Nunito' }, B.fonts || {});
  const S = Object.assign({ corner: 0.06, grain: 0.07, glow: true, upper: true, blurShot: true }, B.style || {});
  const W = J.w, H = J.h, P = H > W; // portrait?
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(C)) root.setProperty('--' + k, v);
  root.setProperty('--display', `'${F.display}', 'Arial Black', sans-serif`);
  root.setProperty('--body', `'${F.body}', 'Helvetica Neue', Arial, sans-serif`);
  root.setProperty('--stroke', S.textStroke || 'transparent'); root.setProperty('--stroke-w', S.textStroke ? (S.strokeWidth || 0.012) * Math.min(W, H) + 'px' : '0px');
  root.setProperty('--W', W + 'px'); root.setProperty('--H', H + 'px');

  // Fonts: local files (brand.fonts.displayFile/bodyFile) or Google Fonts by family name.
  const fontJobs = [];
  const face = (fam, url) => { const ff = new FontFace(fam, `url(${url})`); document.fonts.add(ff); fontJobs.push(ff.load().catch(() => {})); };
  if (F.displayFile) face(F.display, F.displayFile);
  if (F.bodyFile) face(F.body, F.bodyFile);
  const g = [F.displayFile ? null : F.display, F.bodyFile ? null : F.body].filter(Boolean);
  // Google Fonts: ask for heavy weights; families that only ship one weight (Lilita One, Luckiest Guy...) reject
  // a multi-weight request with HTTP 400, so fall back to the plain family request.
  const gfont = (fam) => new Promise(res => {
    const add = (href, onfail) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = () => res(true); l.onerror = onfail; document.head.appendChild(l); };
    const base = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fam);
    add(base + ':wght@400;700;800;900&display=block', () => add(base + '&display=block', () => res(false)));
    setTimeout(() => res(false), 8000);
  }).then(() => document.fonts.load(`900 64px '${fam}'`).catch(() => {}));
  for (const fam of new Set(g)) fontJobs.push(gfont(fam));
  window.READY = Promise.all(fontJobs).then(() => document.fonts.ready).then(() => window.LAYOUT && window.LAYOUT());

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // "*word*" -> accent highlight, "\n" -> line break
  // never break inside hyphenated words ("T-Rex") or between a highlighted word and its punctuation
  const rich = s => esc(s).replace(/(\S*\w-\w\S*)/g, '<span style="white-space:nowrap">$1</span>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\\n|\n/g, '<br>');

  // Background shared by all assets. index shifts blobs so a screenshot SET reads as one panorama.
  function background(host, opts = {}) {
    const i = J.index || 0;
    const bg = el('div', 'bg');
    bg.appendChild(el('div', 'bg-base'));
    if (S.blurShot && (opts.shot || J.image)) { const b = el('img', 'bg-shot'); b.src = opts.shot || J.image; bg.appendChild(b); }
    const blobs = el('div', 'bg-blobs');
    const span = (J.total || 6) + 1;
    for (let k = 0; k < span * 2; k++) {
      const d = el('div', 'blob');
      const size = (P ? H : W) * (0.55 + ((k * 37) % 5) * 0.09);
      const x = (k * 0.62 - i) * W + W * 0.2;
      const y = H * (0.15 + ((k * 53) % 7) / 9);
      d.style.cssText = `width:${size}px;height:${size}px;left:${x - size / 2}px;top:${y - size / 2}px;background:radial-gradient(circle, ${k % 3 === 0 ? 'var(--secondary)' : k % 3 === 1 ? 'var(--primary)' : 'var(--accent)'} 0%, transparent 65%);opacity:${k % 3 === 2 ? 0.28 : 0.55}`;
      blobs.appendChild(d);
    }
    bg.appendChild(blobs);
    // diagonal light rays
    const rays = el('div', 'rays'); bg.appendChild(rays);
    // optional sunburst (style.burst) so backgrounds echo a sunburst icon; burstAt = focal point
    if (S.burst) {
      const at = opts.burstAt || J.burstAt || (P ? '50% 14%' : '30% 50%');
      const b = el('div', 'burst');
      b.style.background = `radial-gradient(circle at ${at}, color-mix(in oklab, var(--accent) ${Math.round((S.burst.glow ?? .55) * 100)}%, transparent) 0%, transparent ${P ? 38 : 45}%), repeating-conic-gradient(from 0deg at ${at}, rgba(255,255,255,${S.burst.opacity ?? .09}) 0deg 7deg, transparent 7deg 18deg)`;
      b.style.maskImage = b.style.webkitMaskImage = `radial-gradient(circle at ${at}, #000 0%, transparent ${P ? 70 : 75}%)`;
      bg.appendChild(b);
    }
    const grain = el('div', 'grain'); grain.style.opacity = S.grain; bg.appendChild(grain);
    bg.appendChild(el('div', 'vignette'));
    host.appendChild(bg);
  }

  function decor(host) {
    for (let d of J.decor || []) {
      if (!P && d.land) d = { ...d, ...d.land }; // optional landscape override {x,y,size,rot}
      const im = el('img', 'decor'); im.src = d.src;
      im.style.cssText = `left:${d.x}%;top:${d.y}%;width:${(d.size || 18) / 100 * Math.min(W, H)}px;transform:translate(-50%,-50%) rotate(${d.rot || 0}deg);${d.blur ? `filter:blur(${d.blur}px) drop-shadow(0 30px 40px rgba(0,0,0,.45))` : ''}`;
      host.appendChild(im);
    }
  }

  function fit(node, maxPx, minPx) { // biggest font size whose text box fits the allowed width/height
    const limit = parseFloat(node.style.maxHeight) || node.parentElement.clientHeight;
    node.style.maxHeight = 'none'; node.style.overflow = 'visible';
    const tooBig = () => {
      return node.offsetHeight > limit + 1 || node.scrollWidth > node.clientWidth + node.clientWidth * 0.01;
    };
    let s = maxPx; node.style.fontSize = s + 'px';
    while (s > minPx && tooBig()) { s -= 2; node.style.fontSize = s + 'px'; }
    return s;
  }

  window.KIT = { B, J, C, F, S, W, H, P, el, esc, rich, background, decor, fit };
})();
