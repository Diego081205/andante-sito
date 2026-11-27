// Costruisce il sito in dist/ a partire da template/index.html e dai contenuti in content/.
// I contenuti si modificano dal pannello /admin (Decap CMS). Nessuna dipendenza esterna.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'dist');
const C = (...p) => path.join(ROOT, 'content', ...p);
const readJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (fb !== undefined) return fb; throw new Error('File non valido: ' + p + ' — ' + e.message); } };
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 24);
const LANGS = ['it', 'en'];

// ---------- contenuti ----------
const imp = readJSON(C('impostazioni.json'), {});
const filtri = readJSON(C('filtri.json'), { luoghi: [], tipi: [], durate: [], livelli: [] });
const date = readJSON(C('date.json'), { partenze: [] });
const recensioni = readJSON(C('recensioni.json'), { voci: [] });
const faq = readJSON(C('faq.json'), { voci: [] });

const testi = { it: {}, en: {} };
for (const f of fs.readdirSync(C('testi')).filter(f => f.endsWith('.json')).sort()) {
  for (const v of readJSON(C('testi', f)).voci || []) {
    if (!v || !v.id) continue;
    testi.it[v.id] = v.it ?? '';
    testi.en[v.id] = (v.en ?? '') !== '' ? v.en : (v.it ?? '');
  }
}

const esperienze = fs.readdirSync(C('esperienze')).filter(f => f.endsWith('.json'))
  .map(f => { const e = readJSON(C('esperienze', f)); if (!e.id) e.id = slug(e.it && e.it.titolo) || path.basename(f, '.json'); e.id = slug(e.id) || e.id; return e; })
  .filter(e => e.visibile !== false)
  .sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0));
{ const seen = new Set(); for (const e of esperienze) { if (seen.has(e.id)) throw new Error('Due esperienze hanno lo stesso codice: ' + e.id); seen.add(e.id); } }

// ---------- dati per la pagina ----------
const pick = (o, l) => (o && o[l]) || {};
const EXP = {};
const ED = { g10: 'Monteriggioni' };
const CFG = {
  wa: String(imp.whatsapp || '').replace(/\D/g, ''), mail: imp.email || '', about: imp.foto_chi_siamo || '', ta: imp.tripadvisor || '',
  hero: imp.video_copertina || '', heroPoster: imp.anteprima_video || '',
  locs: {}, types: {}, durs: {}, levs: {}, xloc: {}, xtype: {}, xdur: {}, xlev: {}, dep: [], soon: []
};
const opt = (list, into) => (list || []).forEach(o => { if (o && o.codice) into[o.codice] = [o.it || o.codice, o.en || o.it || o.codice]; });
opt(filtri.luoghi, CFG.locs); opt(filtri.tipi, CFG.types); opt(filtri.durate, CFG.durs); opt(filtri.livelli, CFG.levs);
// le esperienze speciali del filtro "tipo" (gift card / su misura) restano gestite dal sito
for (const e of esperienze) {
  const k = e.id;
  const gal = (e.galleria || []).filter(g => g && g.foto);
  EXP[k] = {};
  for (const l of LANGS) {
    const d = pick(e, l), it = pick(e, 'it');
    const val = (f) => (d[f] !== undefined && d[f] !== '' ? d[f] : it[f]);
    const o = {
      n: val('titolo') || '', t: val('luogo') || '', h: '', l: val('intro') || '',
      x: (d.paragrafi && d.paragrafi.length ? d.paragrafi : it.paragrafi || []).filter(Boolean),
      i: (d.dettagli && d.dettagli.length ? d.dettagli : it.dettagli || []).filter(r => r && (r.voce || r.valore)).map(r => [r.voce || '', r.valore || '']),
      g: gal.map(g => { const x = { src: g.foto, alt: (l === 'en' ? g.didascalia_en : g.didascalia_it) || g.didascalia_it || '' }; if (g.posizione) x.pos = g.posizione; return x; }),
      v: '', c: val('pulsante') || (l === 'it' ? 'Richiedi disponibilità' : 'Request availability'),
      f: (d.punti && d.punti.length ? d.punti : it.punti || []).filter(Boolean)
    };
    if (val('sottotitolo')) o.s = val('sottotitolo');
    if (val('nome_modulo')) o.fl = val('nome_modulo');
    if (e.foto_copertina) { o.hp = e.foto_copertina; if (e.posizione_copertina) o.hpos = e.posizione_copertina; }
    const vs = (e.video || []).filter(v => v && v.video).map(v => { const x = { src: v.video }; if (v.anteprima) x.poster = v.anteprima; if (v.largo) x.w = 1; return x; });
    if (vs.length) o.vs = vs;
    EXP[k][l] = o;
    // testi delle card
    testi[l][k + 'g'] = o.t; testi[l][k + 't'] = o.n; testi[l][k + 'p'] = o.l; if (o.s) testi[l][k + 's'] = o.s;
  }
  CFG.xloc[k] = e.luoghi || []; CFG.xtype[k] = e.tipi || []; CFG.xdur[k] = e.durate || []; CFG.xlev[k] = e.livelli || [];
  if (e.presto) CFG.soon.push(k);
  // il prezzo della card prende il posto della riga "Prezzo" della scheda solo se è diverso
  const prow = ((e.it && e.it.dettagli) || []).find(r => r && /prezzo|price/i.test(r.voce || ''));
  const pval = prow ? String(prow.valore || '').replace(/&amp;/g, '&').replace(/\s*(a persona|per person).*$/i, '').trim() : '';
  ED['p_' + k] = e.prezzo && e.prezzo !== pval ? e.prezzo : '€ —';
}
CFG.dep = (date.partenze || []).filter(d => d && d.esperienza && d.dal && EXP[d.esperienza]).map(d => {
  const x = { e: d.esperienza, d: String(d.dal).slice(0, 10) }; if (d.al && String(d.al).slice(0, 10) > x.d) x.d2 = String(d.al).slice(0, 10); if (d.luogo) x.loc = d.luogo; return x;
});

(recensioni.voci || []).forEach((r, i) => { const n = i + 1; testi.it['rq' + n] = r.testo_it || ''; testi.en['rq' + n] = r.testo_en || r.testo_it || ''; testi.it['ra' + n] = r.autore_it || ''; testi.en['ra' + n] = r.autore_en || r.autore_it || ''; });
(faq.voci || []).forEach((q, i) => { const n = i + 1; testi.it['fq' + n] = q.domanda_it || ''; testi.en['fq' + n] = q.domanda_en || q.domanda_it || ''; testi.it['fa' + n] = q.risposta_it || ''; testi.en['fa' + n] = q.risposta_en || q.risposta_it || ''; });

// ---------- HTML generato ----------
const card = e => {
  const k = e.id, it = EXP[k].it, multi = e.gruppo === 'piu-giorni';
  return `    <div class="card" onclick="openExp('${k}')">
      <div class="ci ci-${multi ? 'multi' : 'day'} ci-${k}"><span class="tag" data-i18n="${k}g">${esc(it.t)}</span><span class="ph">[ Foto — ${esc(it.n)} ]</span></div>
      <div class="cb"><h3 data-i18n="${k}t">${esc(it.n)}</h3>
${it.s ? `      <p class="csub" data-i18n="${k}s">${esc(it.s)}</p>\n` : ''}      <p data-i18n="${k}p">${esc(it.l)}</p>
      <p class="nx" hidden></p>
      <div class="cm"><span class="pz"><span data-i18n="pr">Da</span> <b data-ed="p_${k}">${esc(ED['p_' + k])}</b></span><span class="go"><span data-i18n="sc">Scopri</span> →</span></div></div>
    </div>`;
};
const cards = g => esperienze.filter(e => (e.gruppo === 'piu-giorni' ? 'piu-giorni' : 'giornate') === g).map(card).join('\n');
const reviews = (recensioni.voci || []).map((r, i) => {
  const n = i + 1, s = Math.max(1, Math.min(5, Number(r.stelle) || 5));
  return `    <figure class="rc"><span class="rq">&ldquo;</span><span class="rs" aria-label="${s} stelle su 5">${'★'.repeat(s)}</span><blockquote data-i18n="rq${n}">${esc(r.testo_it)}</blockquote><figcaption data-i18n="ra${n}">${esc(r.autore_it)}</figcaption></figure>`;
}).join('\n');
const faqs = (faq.voci || []).map((q, i) => `    <details><summary><span data-i18n="fq${i + 1}">${esc(q.domanda_it)}</span></summary><p data-i18n="fa${i + 1}">${esc(q.risposta_it)}</p></details>`).join('\n');

// ---------- assemblaggio ----------
let html = fs.readFileSync(path.join(ROOT, 'template', 'index.html'), 'utf8');
const mark = (name, content) => { const m = `<!--@${name}-->`; if (!html.includes(m)) throw new Error('Segnaposto mancante: ' + m); html = html.replace(m, () => content); };
mark('CARDS:giornate', cards('giornate'));
mark('CARDS:piu-giorni', cards('piu-giorni'));
mark('REVIEWS', reviews);
mark('FAQ', faqs);

// sostituisce il primo blocco /*@NOME*/ = {...} con i dati nuovi
const jsonEnd = (s, i) => { let depth = 0, str = null; for (; i < s.length; i++) { const ch = s[i]; if (str) { if (ch === '\\') i++; else if (ch === str) str = null; continue; } if (ch === '"' || ch === "'") str = ch; else if (ch === '{' || ch === '[') depth++; else if (ch === '}' || ch === ']') { depth--; if (!depth) return i + 1; } } throw new Error('JSON non chiuso'); };
const safe = o => JSON.stringify(o).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
const setBlock = (name, data) => {
  const i = html.indexOf(`/*@${name}*/`); if (i < 0) throw new Error('Blocco dati mancante: ' + name);
  let j = html.indexOf('=', i) + 1; while (/\s/.test(html[j])) j++;
  html = html.slice(0, j) + safe(data) + html.slice(jsonEnd(html, j));
};
const oldT = (() => { const i = html.indexOf('/*@T*/'); let j = html.indexOf('=', i) + 1; while (/\s/.test(html[j])) j++; return JSON.parse(html.slice(j, jsonEnd(html, j))); })();
for (const l of LANGS) testi[l] = Object.assign({}, oldT[l] || {}, testi[l]);
setBlock('T', testi); setBlock('EXP', EXP); setBlock('ED', ED); setBlock('CFG', CFG);

// ---------- output ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
for (const d of ['media', 'admin']) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(OUT, d), { recursive: true });
// modifica dal sito: script dell'editor e copia dei contenuti originali
const BUILD = (process.env.COMMIT_REF || String(Date.now())).slice(0, 12);
fs.writeFileSync(path.join(OUT, 'index.html'), html.replace('__BUILD__', BUILD));
if (fs.existsSync(path.join(ROOT, 'editor', 'editor.js'))) fs.copyFileSync(path.join(ROOT, 'editor', 'editor.js'), path.join(OUT, 'editor.js'));
const src = { commit: process.env.COMMIT_REF || '', files: {} };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.json')) src.files[path.relative(ROOT, p).split(path.sep).join('/')] = readJSON(p); });
walk(path.join(ROOT, 'content'));
fs.writeFileSync(path.join(OUT, 'editor-src.json'), JSON.stringify(src));
console.log(`Sito costruito: ${esperienze.length} esperienze, ${CFG.dep.length} date, ${(recensioni.voci || []).length} recensioni, ${(faq.voci || []).length} FAQ.`);
