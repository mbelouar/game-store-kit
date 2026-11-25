#!/usr/bin/env node
// Check the Google Play store listing text (store-assets/listing.json) and the text inside preview assets
// (screenshot captions, chips, callout labels from plan.json) against Play's limits and metadata policy,
// then write play-store/store-listing.md, ready to paste into Play Console.
// Usage: node listing.mjs [--dir store-assets]          exit code 1 when there are errors
//
// listing.json: { "language": "en-US", "title": "...", "short": "...", "full": "...", "releaseNotes": "...",
//                 "category": "Action", "tags": ["Runner", "Dinosaur"], "contactEmail": "", "website": "" }
import fs from 'node:fs';
import path from 'node:path';
import { args, outDir } from './lib.mjs';

const a = args();
const dir = path.resolve(a.dir || outDir());
const R = p => path.join(dir, p);
if (!fs.existsSync(R('listing.json'))) { console.error('No listing.json in ' + dir); process.exit(1); }
const L = JSON.parse(fs.readFileSync(R('listing.json'), 'utf8'));
const plan = fs.existsSync(R('plan.json')) ? JSON.parse(fs.readFileSync(R('plan.json'), 'utf8')) : {};
const brand = fs.existsSync(R('brand.json')) ? JSON.parse(fs.readFileSync(R('brand.json'), 'utf8')) : {};
// Metadata policy terms (title / icon / developer name: not allowed; preview assets + descriptions: avoid)
// title (and icon/developer name): strict, any of these words is a policy problem
const RANKING_STRICT = /(#\s?1\b|\bno\.?\s?1\b|number one|\bbest\b|\btop\b|\bpopular\b|of the year|best of play|award|editor'?s'? choice|\bwinner\b|trending|\bhit\b)/i;
const PROMO_STRICT = /(\bfree\b|\bsale\b|discount|% ?off|\bcheap\b|\bdeal\b|limited time|download now|install now|\bbonus\b|\bnew\b|\bhot\b|\bpromo\b|\$\d|€\d|£\d|\bprice\b)/i;
// descriptions and preview-asset text: only real claims ("your best distance" and "a new level" are fine)
const RANKING_SOFT = /(#\s?1\b|\bno\.?\s?1\b|number one|\bthe best\b|\bbest (game|app|runner|puzzle|rpg|shooter|racing|game ever|mobile)|\btop[- ]?(rated|\d+|game|app|charts?)\b|\bmost popular\b|of the year|best of play|award[- ]winning|editor'?s'? choice)/i;
const PROMO_SOFT = /(\bsale\b|discount|% ?off|\bcheap\b|limited time|download now|install now|\$\d|€\d|£\d)/i;
const BUZZ_ASSET = /(\bfree\b|\bbest\b|#\s?1\b|\bsale\b|discount|download now)/i;   // Play: keep "free"/"best" out of preview assets
// common translations of the same terms (fr, es, pt, de, it, tr, ar)
const RANKING_STRICT_I18N = /(meilleur|mejor|melhor|beste[rns]?\b|migliore|en iyi|numéro 1|número 1|nummer 1|numero 1|الأفضل|أفضل|رقم 1|populaire|popular|beliebt|popolare)/i;
const PROMO_STRICT_I18N = /(gratuit|gratis|grátis|kostenlos|ücretsiz|مجان|مجاني|nouveau|nuevo|novo\b|neu\b|nuovo|yeni|جديد|promo|soldes|rebajas|oferta|angebot|offerta|indirim|تخفيض|خصم)/i;
const RANKING_SOFT_I18N = /(le meilleur jeu|el mejor juego|o melhor jogo|das beste spiel|il miglior gioco|en iyi oyun|أفضل لعبة|numéro 1|número 1|nummer 1|numero 1|رقم 1)/i;
const PROMO_SOFT_I18N = /(télécharge[rz]? maintenant|descarga ahora|baixe agora|jetzt herunterladen|scarica ora|hemen indir|حمّل الآن|حمل الآن|soldes|rebajas|angebot|offerta|indirim|تخفيض)/i;
const BUZZ_ASSET_I18N = /(gratuit|gratis|grátis|kostenlos|ücretsiz|مجان|مجاني|meilleur|mejor|melhor|beste[rns]?\b|migliore|en iyi|الأفضل|أفضل)/i;
const PROGRAMS = /(google play|play pass|play points|editor'?s'? choice|teacher approved)/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const REPEAT_SPECIAL = /([!?*#$%&@~^+=|_.\-])\1{1,}/;
const brandWords = new Set(String(brand.name || L.title || '').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w.toUpperCase()));
let errors = [], warnings = [];

// mode: 'title' (errors) | 'text' (descriptions: warnings) | 'asset' (screenshot / feature graphic text: warnings)
function scan(text, where, mode) {
  if (!text) return;
  const push = (m) => (mode === 'title' ? errors : warnings).push(`${where}: ${m}`);
  let m;
  const [rank, promo, rankI, promoI] = mode === 'title' ? [RANKING_STRICT, PROMO_STRICT, RANKING_STRICT_I18N, PROMO_STRICT_I18N] : [RANKING_SOFT, PROMO_SOFT, RANKING_SOFT_I18N, PROMO_SOFT_I18N];
  if ((m = text.match(rank) || text.match(rankI))) push(`ranking/award wording "${m[0]}" (Play metadata policy)`);
  if ((m = text.match(promo) || text.match(promoI))) push(`price/promotional wording "${m[0]}"`);
  if (mode === 'asset' && (m = text.match(BUZZ_ASSET) || text.match(BUZZ_ASSET_I18N)) && !(text.match(rank) || text.match(promo) || text.match(rankI) || text.match(promoI))) push(`buzzword "${m[0]}" (Play asks to keep it out of preview assets)`);
  if ((m = text.match(PROGRAMS))) push(`refers to a Google Play program/brand "${m[0]}"`);
  if (mode === 'title') {
    if (EMOJI.test(text)) push('emoji (not allowed in the title)');
    if (REPEAT_SPECIAL.test(text)) push('repeated special characters');
    const caps = text.split(/[^A-Za-z]+/).filter(w => w.length >= 4 && w === w.toUpperCase() && !brandWords.has(w));
    if (caps.length) push(`ALL CAPS word(s) ${caps.slice(0, 3).join(', ')} (allowed only as part of a brand name)`);
  }
}

// Google Play limits (characters)
const LIMITS = { title: 30, short: 80, full: 4000, releaseNotes: 500 };
const TEXT_KEYS = ['headline', 'sub', 'chips', 'badge'];

// Check one language: listing text + the text inside its preview assets, then write its paste-ready store-listing.md
function checkLanguage(Lx, shots, feature, outRel, graphicsHint) {
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = Lx[k] || '';
    if (!v && k !== 'releaseNotes') errors.push(`${k} is empty`);
    if ([...v].length > max) errors.push(`${k}: ${[...v].length}/${max} characters`);
  }
  scan(Lx.title, 'title', 'title');
  scan(Lx.short, 'short description', 'text');
  scan(Lx.full, 'full description', 'text');
  scan(Lx.releaseNotes, 'release notes', 'text');
  if (Lx.full) {
    const words = Lx.full.toLowerCase().match(/[\p{L}']{4,}/gu) || [];
    const counts = words.reduce((m, w) => (m[w] = (m[w] || 0) + 1, m), {});
    const stop = new Set(['your', 'with', 'from', 'that', 'this', 'they', 'them', 'have', 'into', 'more', 'each', 'every', 'their', 'will', 'what', 'when', 'than', 'then', 'like', 'just', 'over', 'game', 'pour', 'avec', 'dans', 'sont', 'votre', 'para', 'como', 'with', 'und', 'mit', 'oder']);
    for (const [w, c] of Object.entries(counts)) if (!stop.has(w) && c >= 8 && c / words.length > 0.025) warnings.push(`full description repeats "${w}" ${c} times (keyword stuffing is against Play policy)`);
    if (/"[^"]{10,}"\s*[-–—]\s*\w+/.test(Lx.full) || /\b(5 stars|five stars)\b|★★★★★/i.test(Lx.full)) warnings.push('full description looks like it contains testimonials or ratings: only attributed quotes are allowed');
    if (/https?:\/\//i.test(Lx.full)) warnings.push('full description contains a URL: put links in the website field instead');
    if (!/[.!?؟。！？]/.test(Lx.full.slice(0, 167))) warnings.push('the first 167 characters (shown before "more") should be a complete hook sentence');
  }
  for (const [i, s] of shots.entries()) {
    const texts = [s.headline, s.sub, s.badge, ...(s.chips || []).map(c => typeof c === 'string' ? c : c.text), s.callout?.label].filter(Boolean).map(t => t.replace(/\*/g, ''));
    for (const t of texts) scan(t, `screenshot ${i + 1} text "${t}"`, 'asset');
  }
  if (feature?.sub) scan(feature.sub, 'feature graphic text', 'asset');
  const out = R(outRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `# ${Lx.title} — Google Play store listing (${Lx.language})

Paste each block into Play Console > Grow users > Store presence > ${Lx.main ? 'Main store listing' : `Main store listing > Manage translations > ${Lx.language}`}.

## App name (${[...(Lx.title || '')].length}/30)
${Lx.title || ''}

## Short description (${[...(Lx.short || '')].length}/80)
${Lx.short || ''}

## Full description (${[...(Lx.full || '')].length}/4000)
${Lx.full || ''}
${Lx.releaseNotes ? `\n## Release notes (${[...Lx.releaseNotes].length}/500)\n${Lx.releaseNotes}\n` : ''}${Lx.main && Lx.category ? `\n## Category\nGame > ${Lx.category}\n` : ''}${Lx.main && (Lx.tags || []).length ? `\n## Tags (pick up to 5 in Play Console)\n${Lx.tags.join(', ')}\n` : ''}
## Graphics
${graphicsHint}
`);
  return out;
}

// default language
const hasTablets = d => fs.existsSync(R(d + '/screenshots-7inch'));
const results = [];
const report = (label, out) => {
  results.push({ label, errors, warnings, out });
  errors = []; warnings = [];
};
report(L.language || 'en-US', checkLanguage({ ...L, language: L.language || 'en-US', main: true }, plan.screenshots || [], plan.feature, 'play-store/store-listing.md',
  `- App icon: \`icon-512.png\`\n- Feature graphic: \`feature-graphic-1024x500.png\`\n- Phone screenshots: \`screenshots/\` (upload in order)${hasTablets('play-store') ? '\n- 7-inch tablet screenshots: `screenshots-7inch/`\n- 10-inch tablet screenshots: `screenshots-10inch/`' : ''}`));

// translations: listing.json "locales": { "fr-FR": { title, short, full, releaseNotes } }, screenshot texts from plan.locales
const langs = new Set([...Object.keys(L.locales || {}), ...Object.keys(plan.locales || {})]);
for (const lang of langs) {
  const Lx = { ...(L.locales || {})[lang], language: lang };
  const tr = (plan.locales || {})[lang] || {};
  const shots = (plan.screenshots || []).map((s, i) => { const t = (tr.screenshots || [])[i] || {}; const m = { ...s }; for (const k of TEXT_KEYS) if (t[k] !== undefined) m[k] = t[k]; if (s.callout && t.callout?.label) m.callout = { ...s.callout, label: t.callout.label }; return m; });
  if (!(L.locales || {})[lang]) warnings.push(`no listing text for ${lang} in listing.json "locales": Play will show the default language's text there`);
  const base = `play-store/locales/${lang}`;
  report(lang, checkLanguage(Lx, shots, tr.feature ? { ...plan.feature, ...tr.feature } : plan.feature, base + '/store-listing.md',
    `- Phone screenshots: \`screenshots/\` (in this folder; upload them as this language's graphics)${hasTablets(base) ? '\n- Tablet screenshots: `screenshots-7inch/`, `screenshots-10inch/`' : ''}${fs.existsSync(R(base + '/feature-graphic-1024x500.png')) ? '\n- Feature graphic: `feature-graphic-1024x500.png`' : '\n- Feature graphic and icon: same as the default language'}`));
}

// A/B text variants: listing.json "variants": { "B": { "short": "...", "full": "..." } } -> appended to experiments/<name>/experiment.md
for (const [name, v] of Object.entries(L.variants || {})) {
  for (const [k, max] of Object.entries({ short: 80, full: 4000 })) if (v[k] && [...v[k]].length > max) errors.push(`${k}: ${[...v[k]].length}/${max} characters`);
  scan(v.short, 'short description', 'text'); scan(v.full, 'full description', 'text');
  const f = R(`play-store/experiments/${name}/experiment.md`); fs.mkdirSync(path.dirname(f), { recursive: true });
  const prev = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\n## Variant text[\s\S]*$/, '') : `# Store listing experiment: variant ${name}\n\nPlay Console > Grow users > Store listing experiments > Create experiment (default language).\n`;
  fs.writeFileSync(f, prev + `\n## Variant text\n${v.short ? `\n### Short description (${[...v.short].length}/80)\n${v.short}\n` : ''}${v.full ? `\n### Full description (${[...v.full].length}/4000)\n${v.full}\n` : ''}`);
  report(`variant ${name}`, f);
}

let totalErr = 0;
for (const r of results) {
  if (results.length > 1) console.log(`\n[${r.label}]`);
  for (const e of r.errors) console.log('✗ ' + e);
  for (const w of r.warnings) console.log('⚠ ' + w);
  if (!r.errors.length && !r.warnings.length) console.log('Listing text OK ✓');
  console.log('Wrote ' + r.out);
  totalErr += r.errors.length;
}
console.log(totalErr ? `\n${totalErr} error(s): fix listing.json before publishing.` : '\nNo errors.');
process.exit(totalErr ? 1 : 0);
