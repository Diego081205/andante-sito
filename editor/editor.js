/* Andante — modifica del sito direttamente dalla pagina.
   Si attiva solo per chi ha fatto l'accesso (Netlify Identity).
   "Pubblica" salva i file in content/ su GitHub (tramite Git Gateway) e Netlify ricostruisce il sito. */
(function () {
  'use strict';
  if (window.__andanteEditor) return; window.__andanteEditor = true;

  var GW = '/.netlify/git/github';
  var SRC = null;              // contenuti originali (editor-src.json)
  var BLOBS = {};              // objectURL -> {path, sha}
  var HIDE = {}, DEL = {}, NEWX = {}, SHOW = {};
  var REVM = null, FAQN = null; // metadati recensioni (stelle) e numero FAQ
  var LASTSAVE = null, BUSY = false;
  var ID = window.netlifyIdentity;

  // ---------------------------------------------------------------- utilità
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function deesc(t) { return String(t == null ? '' : t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
  function slug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 20); }
  function dirty() { if (!DIRTY) { DIRTY = true; } bar(); }
  function toast(msg, ms) {
    var t = $('#etoast'); if (!t) { t = el('div', 'etoast'); t.id = 'etoast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(t._h);
    if (ms !== 0) t._h = setTimeout(function () { t.classList.remove('on'); }, ms || 3500);
  }
  function user() { try { return ID && ID.currentUser(); } catch (e) { return null; } }
  function token() { var u = user(); if (!u) return Promise.reject(new Error('Accesso scaduto: entra di nuovo.')); return u.jwt(); }
  function api(method, path, body) {
    return token().then(function (tk) {
      return fetch(GW + path, { method: method, headers: { 'Authorization': 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) throw new Error((j && (j.message || j.msg)) || ('errore ' + r.status));
        return j;
      });
    });
  }
  function srcFile(p) { return SRC && SRC.files[p] ? clone(SRC.files[p]) : null; }
  function pathOf(src) { return (BLOBS[src] && BLOBS[src].path) || src || ''; }

  // ---------------------------------------------------------------- stile
  var css = '.wacom{transition:opacity .2s}.editing .wacom{display:none}' +
    '.etools{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:6px;flex-wrap:wrap;z-index:3}' +
    '.etools button,.ebtn{border:0;border-radius:999px;padding:7px 11px;font:600 11px/1 inherit;letter-spacing:.04em;cursor:pointer;background:rgba(20,14,10,.78);color:#fff8ee}' +
    '.etools button.on{background:var(--rust,#b0562e)}.etools button.del{margin-left:auto}' +
    '.card.ehid{opacity:.45}.card.ehid .ci:after{content:"NASCOSTA";position:absolute;bottom:10px;left:10px;background:#000;color:#fff;font:700 11px/1 inherit;padding:6px 9px;border-radius:6px;letter-spacing:.1em}' +
    '.addcard{min-height:280px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;border:2px dashed var(--gold,#c9a36a);border-radius:18px;color:var(--gold,#c9a36a);cursor:pointer;font:600 14px/1.3 inherit;text-align:center;padding:20px;background:transparent}' +
    '.addcard b{font-size:34px;font-weight:300}' +
    '.edctl{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}.edctl .ebtn{background:var(--bg2,#2a211b);border:1px solid var(--line,#5a4a3e);color:var(--cream,#f3e9dc)}' +
    '.edhint{font-size:12px;opacity:.7;margin:6px 0 0}' +
    '.gi .cov{position:absolute;top:8px;left:8px}.gi{position:relative}' +
    '.etoast{position:fixed;left:50%;top:18px;transform:translate(-50%,-30px);opacity:0;z-index:600;background:#1d1611;color:#fff8ee;border:1px solid #5a4a3e;padding:12px 18px;border-radius:12px;font-size:14px;transition:.25s;max-width:90vw;text-align:center;pointer-events:none}.etoast.on{opacity:1;transform:translate(-50%,0)}' +
    '.emod{position:fixed;inset:0;z-index:550;background:rgba(10,7,5,.72);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:40px 14px}' +
    '.emod .ebox{background:var(--bg,#1d1611);color:var(--cream,#f3e9dc);border:1px solid var(--line,#5a4a3e);border-radius:18px;width:min(760px,100%);padding:22px}' +
    '.emod h3{margin:0 0 6px;font-size:22px}.emod p.sub{margin:0 0 16px;opacity:.75;font-size:14px}' +
    '.emod .erow{border:1px solid var(--line,#5a4a3e);border-radius:14px;padding:14px;margin:0 0 12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
    '.emod .erow label{display:flex;flex-direction:column;gap:4px;font-size:12px;opacity:.9}.emod .erow label.w{grid-column:1/-1}' +
    '.emod input,.emod select,.emod textarea{font:15px/1.4 inherit;padding:9px 10px;border-radius:9px;border:1px solid var(--line,#5a4a3e);background:var(--bg2,#2a211b);color:inherit;width:100%;box-sizing:border-box}' +
    '.emod textarea{min-height:84px;resize:vertical}.emod .rm{grid-column:1/-1;justify-self:end}' +
    '.emod .foot{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}' +
    '@media(max-width:600px){.emod .erow{grid-template-columns:1fr}}';
  var st = el('style'); st.textContent = css; document.head.appendChild(st);

  // ---------------------------------------------------------------- finestra generica per le liste
  function listModal(o) {
    var rows = clone(o.rows || []);
    var m = el('div', 'emod'), box = el('div', 'ebox'); m.appendChild(box);
    function draw() {
      box.innerHTML = '';
      box.appendChild(el('h3', '', o.title)); if (o.sub) box.appendChild(el('p', 'sub', o.sub));
      rows.forEach(function (r, i) {
        var row = el('div', 'erow');
        o.fields.forEach(function (f) {
          var lab = el('label', f.wide ? 'w' : ''), inp;
          lab.appendChild(document.createTextNode(f.label));
          if (f.type === 'textarea') inp = el('textarea');
          else if (f.type === 'select') { inp = el('select'); (typeof f.opts === 'function' ? f.opts() : f.opts).forEach(function (op) { var x = el('option', '', op[1]); x.value = op[0]; inp.appendChild(x); }); }
          else { inp = el('input'); inp.type = f.type || 'text'; if (f.min != null) inp.min = f.min; if (f.max != null) inp.max = f.max; }
          inp.value = r[f.k] == null ? '' : r[f.k];
          inp.oninput = inp.onchange = function () { r[f.k] = inp.value; };
          lab.appendChild(inp); row.appendChild(lab);
        });
        var rm = el('button', 'ebtn rm', 'Elimina'); rm.type = 'button';
        rm.onclick = function () { if (confirm('Eliminare questa voce?')) { rows.splice(i, 1); draw(); } };
        row.appendChild(rm); box.appendChild(row);
      });
      var foot = el('div', 'foot');
      var add = el('button', 'btn bg2', '＋ ' + (o.addLabel || 'Aggiungi')); add.type = 'button';
      add.onclick = function () { rows.push(clone(o.blank || {})); draw(); var all = $$('.erow', box); if (all.length) all[all.length - 1].scrollIntoView({ block: 'center' }); };
      var ko = el('button', 'btn bg2', 'Annulla'); ko.type = 'button'; ko.onclick = function () { m.remove(); };
      var ok = el('button', 'btn', 'Fatto'); ok.type = 'button';
      ok.onclick = function () { var err = o.check && o.check(rows); if (err) { alert(err); return; } m.remove(); o.done(rows); };
      foot.appendChild(add); foot.appendChild(ko); foot.appendChild(ok); box.appendChild(foot);
    }
    draw(); document.body.appendChild(m);
  }

  // ---------------------------------------------------------------- foto
  function resize(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2000, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('foto non leggibile')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { rej(new Error('formato non supportato (usa JPG o PNG)')); };
      img.src = url;
    });
  }
  function pickPhoto() {
    return new Promise(function (res) {
      var f = el('input'); f.type = 'file'; f.accept = 'image/*';
      f.onchange = function () { res(f.files[0] || null); }; f.click();
    });
  }
  function uploadPhoto(file) {
    toast('Carico la foto…', 0);
    var blob;
    return resize(file).then(function (b) {
      blob = b;
      return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.readAsDataURL(b); });
    }).then(function (b64) {
      return api('POST', '/git/blobs', { content: b64, encoding: 'base64' });
    }).then(function (j) {
      var name = (slug(file.name.replace(/\.[^.]+$/, '')) || 'foto') + '-' + Date.now().toString(36) + '.jpg';
      var url = URL.createObjectURL(blob);
      BLOBS[url] = { path: 'media/uploads/' + name, sha: j.sha };
      toast('Foto caricata. Ricordati di premere “Pubblica”.');
      return url;
    }, function (e) { toast(''); alert('Foto non caricata: ' + e.message); throw e; });
  }
  window.addPhoto = function () {
    var id = CUR;
    pickPhoto().then(function (f) { if (!f) return; return uploadPhoto(f).then(function (url) {
      ['it', 'en'].forEach(function (l) { var g = EXP[id][l].g; var i = g.findIndex(function (x) { return typeof x === 'string'; }); var o = { src: url, alt: i >= 0 ? g[i] : '' }; if (i >= 0) g[i] = o; else g.push(o); });
      dirty(); render(); applyFlt();
    }); });
  };

  // ---------------------------------------------------------------- card
  var CARD_SYNC = { g: 't', t: 'n', p: 'l', s: 's' };
  function syncFromCard(k, v) {
    var m = /^([a-z0-9]+)([gtps])$/.exec(k); if (!m || !EXP[m[1]]) return;
    EXP[m[1]][LANG][CARD_SYNC[m[2]]] = v;
  }
  function syncToCard(id, f, v) {
    var sfx = { t: 'g', n: 't', l: 'p', s: 's' }[f]; if (!sfx) return;
    T[LANG][id + sfx] = v;
    $$('[data-i18n="' + id + sfx + '"]').forEach(function (e) { if (!e.contains(document.activeElement)) e.textContent = v; });
  }
  function mkCard(id, multi) {
    var it = EXP[id][LANG];
    var c = el('div', 'card'); c.setAttribute('onclick', "openExp('" + id + "')");
    c.innerHTML = '<div class="ci ci-' + (multi ? 'multi' : 'day') + '"><span class="tag" data-i18n="' + id + 'g"></span><span class="ph"></span></div>' +
      '<div class="cb"><h3 data-i18n="' + id + 't"></h3><p data-i18n="' + id + 'p"></p><p class="nx" hidden></p>' +
      '<div class="cm"><span class="pz"><span data-i18n="pr"></span> <b data-ed="p_' + id + '"></b></span><span class="go"><span data-i18n="sc"></span> →</span></div></div>';
    $('[data-i18n="' + id + 'g"]', c).textContent = it.t; $('.ph', c).textContent = '[ Foto — ' + it.n + ' ]';
    $('[data-i18n="' + id + 't"]', c).textContent = it.n; $('[data-i18n="' + id + 'p"]', c).textContent = it.l;
    $('[data-i18n="pr"]', c).textContent = T[LANG].pr; $('[data-i18n="sc"]', c).textContent = T[LANG].sc;
    return c;
  }
  function rowOf(multi) { var rows = $$('#esp .row'); return rows[multi ? 1 : 0]; }
  function cardTools() {
    $$('#esp .card').forEach(function (c) {
      var id = cardKey(c); if (!id || $('.etools', c)) return;
      var t = el('div', 'etools');
      var soon = el('button', isSoon(id) ? 'on' : '', 'Coming soon'); soon.type = 'button';
      soon.onclick = function (e) { e.stopPropagation(); CFG.soon = CFG.soon || []; var i = CFG.soon.indexOf(id); if (i >= 0) CFG.soon.splice(i, 1); else CFG.soon.push(id); soon.classList.toggle('on', i < 0); dirty(); applyFlt(); };
      var hid = el('button', HIDE[id] ? 'on' : '', HIDE[id] ? 'Nascosta' : 'Nascondi'); hid.type = 'button';
      hid.onclick = function (e) { e.stopPropagation(); HIDE[id] = !HIDE[id]; hid.textContent = HIDE[id] ? 'Nascosta' : 'Nascondi'; hid.classList.toggle('on', HIDE[id]); c.classList.toggle('ehid', HIDE[id]); dirty(); };
      var del = el('button', 'del', 'Elimina'); del.type = 'button';
      del.onclick = function (e) { e.stopPropagation(); if (!confirm('Eliminare definitivamente “' + EXP[id].it.n + '”? Se vuoi solo toglierla dal sito per un po’, usa “Nascondi”.')) return; DEL[id] = true; delete NEWX[id]; c.remove(); dirty(); };
      t.appendChild(soon); t.appendChild(hid); t.appendChild(del); $('.ci', c).appendChild(t);
    });
    [0, 1].forEach(function (multi) {
      var row = rowOf(multi); if (!row || $('.addcard', row)) return;
      var a = el('button', 'addcard'); a.type = 'button'; a.innerHTML = '<b>＋</b>' + (multi ? 'Nuovo viaggio di più giorni' : 'Nuova esperienza');
      a.onclick = function () { newExp(!!multi, a); }; row.appendChild(a);
    });
  }
  function newExp(multi, before) {
    var title = prompt('Titolo della nuova esperienza (lo potrai cambiare dopo):'); if (!title || !title.trim()) return;
    title = title.trim();
    var base = slug(title) || 'esperienza', id = base, n = 2;
    while (EXP[id] || DEL[id] || (SRC && SRC.files['content/esperienze/' + id + '.json'])) id = base + (n++);
    var mk = function (l) {
      return { n: title, t: l === 'it' ? 'Maremma · Italia' : 'Maremma · Italy', h: '', l: l === 'it' ? 'Una frase breve che racconta l’esperienza.' : 'A short sentence about the experience.',
        x: [l === 'it' ? 'Scrivi qui la descrizione: come si svolge la giornata, cosa si vede, cosa è incluso.' : 'Write the description here.'],
        i: [[l === 'it' ? 'Prezzo' : 'Price', l === 'it' ? '€ — a persona' : '€ — per person'], [l === 'it' ? 'Durata' : 'Duration', l === 'it' ? '[ da completare ]' : '[ to be completed ]']],
        g: [], v: '', c: l === 'it' ? 'Richiedi disponibilità' : 'Request availability', f: [] };
    };
    EXP[id] = { it: mk('it'), en: mk('en') };
    ['it', 'en'].forEach(function (l) { var d = EXP[id][l]; T[l][id + 'g'] = d.t; T[l][id + 't'] = d.n; T[l][id + 'p'] = d.l; });
    ['xloc', 'xtype', 'xdur', 'xlev'].forEach(function (k) { CFG[k] = CFG[k] || {}; CFG[k][id] = []; });
    var ord = 0; $$('#esp .card').forEach(function () { ord += 10; });
    NEWX[id] = { gruppo: multi ? 'piu-giorni' : 'giornate', ordine: ord + 10 };
    var c = mkCard(id, multi); before.parentNode.insertBefore(c, before);
    dirty(); setEdit(true); cardTools(); fillForm(); fillGiftExp();
    setTimeout(function () { openExp(id); toast('Nuova esperienza creata: completa testi, foto e prezzo, poi premi “Pubblica”.', 6000); }, 150);
  }

  // ---------------------------------------------------------------- scheda esperienza
  var origMark = window.markDetail;
  window.markDetail = function () {
    origMark();
    var id = CUR, d = EXP[id][LANG];
    $$('.edctl').forEach(function (e) { e.remove(); });
    bindD($('#dTi'), function (t) { d.n = t; syncToCard(id, 'n', t); }, null);
    bindD($('#dT'), function (t) { d.t = t; syncToCard(id, 't', t); }, null);
    var dS = $('#dS'); if (dS) { dS.hidden = false; if (!d.s) dS.textContent = ''; dS.setAttribute('data-ph', 'Sottotitolo (facoltativo)'); bindD(dS, function (t) { d.s = t; syncToCard(id, 's', t); }, null); }
    bindD($('#dC'), function (t) { d.c = t; }, null);
    // il testo breve è anche quello della card
    var dl = $('#dL'); if (dl) { var f0 = dl._set; dl._set = function (t) { f0(t); syncToCard(id, 'l', t); }; }
    // paragrafi
    var cx = el('div', 'edctl');
    var ap = el('button', 'ebtn', '＋ Aggiungi paragrafo'); ap.type = 'button';
    ap.onclick = function () { ['it', 'en'].forEach(function (l) { EXP[id][l].x.push(l === 'it' ? 'Nuovo paragrafo: scrivi qui.' : 'New paragraph: write here.'); }); dirty(); render(); };
    cx.appendChild(ap); cx.appendChild(el('p', 'edhint', 'Per togliere un paragrafo, cancellane tutto il testo.'));
    var dX = $('#dX'); if (dX) dX.parentNode.insertBefore(cx, dX.nextSibling);
    // dettagli
    var ci = el('div', 'edctl');
    var ar = el('button', 'ebtn', '＋ Aggiungi riga'); ar.type = 'button';
    ar.onclick = function () { ['it', 'en'].forEach(function (l) { EXP[id][l].i.push(l === 'it' ? ['Voce', 'valore'] : ['Item', 'value']); }); dirty(); render(); };
    var pk = el('button', 'ebtn', 'Punti chiave sulla card'); pk.type = 'button';
    pk.onclick = function () { var v = prompt('Punti chiave mostrati sulla card, separati da virgola (es. 1 giorno, Tutti i livelli, Pranzo incluso). Lingua: ' + (LANG === 'it' ? 'italiano' : 'inglese'), (d.f || []).join(', ')); if (v === null) return; d.f = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean); dirty(); applyFlt(); };
    ci.appendChild(ar); ci.appendChild(pk); ci.appendChild(el('p', 'edhint', 'Per togliere una riga, cancella sia la voce sia il valore.'));
    var dI = $('#dI'); if (dI) dI.parentNode.insertBefore(ci, dI.nextSibling);
    // foto grande in cima
    var dH = $('#dH');
    if (dH && !$('.edctl', dH.parentNode)) {
      var ch = el('div', 'edctl');
      var hb = el('button', 'ebtn', 'Cambia foto grande'); hb.type = 'button';
      hb.onclick = function () { pickPhoto().then(function (f) { if (!f) return; return uploadPhoto(f).then(function (url) { ['it', 'en'].forEach(function (l) { EXP[id][l].hp = url; }); dirty(); render(); }); }); };
      ch.appendChild(hb); dH.parentNode.insertBefore(ch, dH.nextSibling);
    }
    // galleria: “Copertina” sposta la foto al primo posto (è quella della card)
    $$('#dG > div').forEach(function (c, i) {
      if (i === 0 || !$('img', c)) return;
      var b = el('button', 'ebtn cov', '★ Copertina'); b.type = 'button';
      b.onclick = function (ev) { ev.stopPropagation(); ['it', 'en'].forEach(function (l) { var g = EXP[id][l].g, o = g.splice(i, 1)[0]; g.unshift(o); }); dirty(); render(); applyFlt(); };
      c.appendChild(b);
    });
  };

  // ---------------------------------------------------------------- recensioni, FAQ, date
  function rebuildReviews(list) {
    var t = $('.rvt'); if (!t) return;
    t.innerHTML = '';
    list.forEach(function (r, i) {
      var n = i + 1, s = Math.max(1, Math.min(5, +r.stelle || 5));
      T.it['rq' + n] = r.testo_it || ''; T.en['rq' + n] = r.testo_en || r.testo_it || '';
      T.it['ra' + n] = r.autore_it || ''; T.en['ra' + n] = r.autore_en || r.autore_it || '';
      var f = el('figure', 'rc'); f.innerHTML = '<span class="rq">&ldquo;</span><span class="rs"></span><blockquote data-i18n="rq' + n + '"></blockquote><figcaption data-i18n="ra' + n + '"></figcaption>';
      $('.rs', f).textContent = '★★★★★'.slice(0, s); $('blockquote', f).textContent = T[LANG]['rq' + n]; $('figcaption', f).textContent = T[LANG]['ra' + n];
      t.appendChild(f);
    });
    var o = [].slice.call(t.children); for (var k = 0; k < 3; k++) o.forEach(function (c) { var x = c.cloneNode(true); x.classList.add('clone'); x.setAttribute('aria-hidden', 'true'); t.appendChild(x); });
    REVM = list.map(function (r) { return { stelle: +r.stelle || 5 }; });
  }
  function reviewsNow() {
    var n = REVM ? REVM.length : ((srcFile('content/recensioni.json') || { voci: [] }).voci || []).length, out = [];
    for (var i = 1; i <= n; i++) out.push({ testo_it: T.it['rq' + i] || '', testo_en: T.en['rq' + i] || '', autore_it: T.it['ra' + i] || '', autore_en: T.en['ra' + i] || '', stelle: REVM ? REVM[i - 1].stelle : (((srcFile('content/recensioni.json') || {}).voci || [])[i - 1] || {}).stelle || 5 });
    return out;
  }
  function editReviews() {
    listModal({ title: 'Recensioni', sub: 'Compaiono nella sezione “Dicono di noi”.', rows: reviewsNow(), addLabel: 'Aggiungi recensione',
      blank: { testo_it: '', testo_en: '', autore_it: '', autore_en: '', stelle: 5 },
      fields: [{ k: 'testo_it', label: 'Testo (italiano)', type: 'textarea', wide: true }, { k: 'testo_en', label: 'Testo (inglese, facoltativo)', type: 'textarea', wide: true },
        { k: 'autore_it', label: 'Nome (es. Giulia · maggio 2026)' }, { k: 'autore_en', label: 'Nome in inglese (facoltativo)' }, { k: 'stelle', label: 'Stelle', type: 'number', min: 1, max: 5 }],
      check: function (r) { return r.some(function (x) { return !String(x.testo_it).trim(); }) ? 'Ogni recensione deve avere il testo in italiano.' : null; },
      done: function (rows) { rebuildReviews(rows); dirty(); setEdit(true); cardTools(); } });
  }
  function faqNow() {
    var n = FAQN != null ? FAQN : ((srcFile('content/faq.json') || { voci: [] }).voci || []).length, out = [];
    for (var i = 1; i <= n; i++) out.push({ domanda_it: T.it['fq' + i] || '', risposta_it: T.it['fa' + i] || '', domanda_en: T.en['fq' + i] || '', risposta_en: T.en['fa' + i] || '' });
    return out;
  }
  function editFaq() {
    listModal({ title: 'Domande frequenti', rows: faqNow(), addLabel: 'Aggiungi domanda', blank: { domanda_it: '', risposta_it: '', domanda_en: '', risposta_en: '' },
      fields: [{ k: 'domanda_it', label: 'Domanda (italiano)', wide: true }, { k: 'risposta_it', label: 'Risposta (italiano)', type: 'textarea', wide: true },
        { k: 'domanda_en', label: 'Domanda (inglese, facoltativa)', wide: true }, { k: 'risposta_en', label: 'Risposta (inglese, facoltativa)', type: 'textarea', wide: true }],
      check: function (r) { return r.some(function (x) { return !String(x.domanda_it).trim(); }) ? 'Ogni domanda deve avere il testo in italiano.' : null; },
      done: function (rows) {
        var box = $('.faq'); if (!box) return; box.innerHTML = '';
        rows.forEach(function (q, i) {
          var n = i + 1; T.it['fq' + n] = q.domanda_it; T.it['fa' + n] = q.risposta_it; T.en['fq' + n] = q.domanda_en || q.domanda_it; T.en['fa' + n] = q.risposta_en || q.risposta_it;
          var d = el('details'); d.innerHTML = '<summary><span data-i18n="fq' + n + '"></span></summary><p data-i18n="fa' + n + '"></p>';
          $('span', d).textContent = T[LANG]['fq' + n]; $('p', d).textContent = T[LANG]['fa' + n]; box.appendChild(d);
        });
        FAQN = rows.length; dirty(); setEdit(true); cardTools();
      } });
  }
  function expOpts() { return Object.keys(EXP).filter(function (k) { return !DEL[k]; }).map(function (k) { return [k, EXP[k].it.n]; }); }
  function locOpts() { return [['', '—']].concat(Object.keys(CFG.locs || {}).map(function (k) { return [k, CFG.locs[k][0]]; })); }
  function editDates() {
    var rows = (CFG.dep || []).filter(function (x) { return EXP[x.e]; }).map(function (x) { return { e: x.e, d: x.d, d2: x.d2 || '', loc: x.loc || '' }; })
      .sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    listModal({ title: 'Date di partenza', sub: 'Compaiono in “Prossime partenze”, sulle card e nei moduli. Le date passate spariscono da sole.', rows: rows, addLabel: 'Aggiungi data',
      blank: { e: expOpts()[0] ? expOpts()[0][0] : '', d: '', d2: '', loc: '' },
      fields: [{ k: 'e', label: 'Esperienza', type: 'select', opts: expOpts, wide: true }, { k: 'd', label: 'Dal', type: 'date' }, { k: 'd2', label: 'Al (solo se dura più giorni)', type: 'date' }, { k: 'loc', label: 'Luogo (facoltativo)', type: 'select', opts: locOpts }],
      check: function (r) { for (var i = 0; i < r.length; i++) { if (!r[i].e || !r[i].d) return 'Ogni data deve avere esperienza e giorno di inizio.'; if (r[i].d2 && r[i].d2 < r[i].d) return 'La data di fine non può essere prima di quella di inizio.'; } return null; },
      done: function (r) {
        CFG.dep = r.map(function (x) { var o = { e: x.e, d: x.d }; if (x.d2 && x.d2 > x.d) o.d2 = x.d2; if (x.loc) o.loc = x.loc; return o; });
        dirty(); try { renderDeps(); fillDates(); applyFlt(); gDatUpd(); } catch (e) {}
      } });
  }
  function editContacts() {
    var imp = srcFile('content/impostazioni.json') || {};
    listModal({ title: 'Contatti', rows: [{ mail: CFG.mail, wa: CFG.wa, ta: CFG.ta || imp.tripadvisor || '' }], addLabel: '—',
      fields: [{ k: 'mail', label: 'Email', type: 'email', wide: true }, { k: 'wa', label: 'WhatsApp con prefisso, senza + (es. 393401234567)', wide: true }, { k: 'ta', label: 'Link pagina Tripadvisor', wide: true }],
      check: function (r) { return r.length !== 1 ? 'Lascia una sola riga di contatti.' : null; },
      done: function (r) { CFG.mail = String(r[0].mail || '').trim(); CFG.wa = String(r[0].wa || '').replace(/\D/g, ''); CFG.ta = String(r[0].ta || '').trim(); applyCFG(); dirty(); } });
    var b = $('.emod .foot .btn.bg2'); if (b) b.style.display = 'none';
  }
  function hiddenList() {
    var files = SRC ? Object.keys(SRC.files).filter(function (p) { return /^content\/esperienze\//.test(p) && SRC.files[p].visibile === false; }) : [];
    var m = el('div', 'emod'), box = el('div', 'ebox'); m.appendChild(box);
    box.appendChild(el('h3', '', 'Esperienze nascoste'));
    box.appendChild(el('p', 'sub', files.length ? 'Queste esperienze non si vedono sul sito. “Mostra di nuovo” le rimette online alla prossima pubblicazione.' : 'Non ci sono esperienze nascoste.'));
    files.forEach(function (p) {
      var o = SRC.files[p], row = el('div', 'erow'); row.appendChild(el('strong', '', (o.it && o.it.titolo) || o.id));
      var b = el('button', 'ebtn', SHOW[p] ? 'Verrà mostrata ✓' : 'Mostra di nuovo'); b.type = 'button';
      b.onclick = function () { SHOW[p] = !SHOW[p]; b.textContent = SHOW[p] ? 'Verrà mostrata ✓' : 'Mostra di nuovo'; dirty(); };
      row.appendChild(b); box.appendChild(row);
    });
    var foot = el('div', 'foot'), ok = el('button', 'btn', 'Chiudi'); ok.onclick = function () { m.remove(); }; foot.appendChild(ok); box.appendChild(foot);
    document.body.appendChild(m);
  }

  // ---------------------------------------------------------------- barra
  window.translatePending = function () { PEND = {}; return Promise.resolve(); };
  window.bar = function () {
    var b = $('#ebar'); if (!b) { b = el('div', 'ebar'); b.id = 'ebar'; document.body.appendChild(b); }
    if (!EU.can) { b.style.display = 'none'; return; }
    b.style.display = 'flex'; b.innerHTML = '';
    var btn = function (txt, cls, fn) { var x = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); x.type = 'button'; x.onclick = fn; b.appendChild(x); return x; };
    if (!EDIT) {
      btn('✎ Modifica sito', '', function () { setEdit(true); cardTools(); });
      btn('Esci', 'bg2', function () { ID.logout(); });
      return;
    }
    b.appendChild(el('span', 'et', BUSY ? 'Pubblicazione in corso…' : DIRTY ? 'Ci sono modifiche non pubblicate.' : 'Tocca un testo per cambiarlo. Per l’inglese passa a EN in alto.'));
    btn('Date', 'bg2', editDates); btn('Recensioni', 'bg2', editReviews); btn('FAQ', 'bg2', editFaq); btn('Contatti', 'bg2', editContacts);
    var nh = SRC ? Object.keys(SRC.files).filter(function (p) { return /^content\/esperienze\//.test(p) && SRC.files[p].visibile === false; }).length : 0;
    if (nh) btn('Nascoste (' + nh + ')', 'bg2', hiddenList);
    var s = btn(BUSY ? 'Pubblico…' : 'Pubblica', '', publish); s.disabled = !DIRTY || BUSY;
    btn('Esci', 'bg2', function () { if (!DIRTY || confirm('Uscire senza pubblicare? Le modifiche andranno perse.')) location.href = location.pathname; });
  };

  // ---------------------------------------------------------------- input: tiene allineate card e schede
  document.addEventListener('input', function (ev) {
    if (!EDIT) return; var e = ev.target.closest && ev.target.closest('[data-i18n]');
    if (e) syncFromCard(e.getAttribute('data-i18n'), e.textContent);
  });

  // ---------------------------------------------------------------- pubblicazione
  function emptyish(s) { return !String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim(); }
  function enVal(itv, env, orig) { return (env === itv && !orig) ? '' : env; }
  function buildFiles() {
    var out = {}, del = [];
    // testi
    Object.keys(SRC.files).filter(function (p) { return /^content\/testi\//.test(p); }).forEach(function (p) {
      var f = srcFile(p); (f.voci || []).forEach(function (v) {
        if (T.it[v.id] !== undefined) v.it = T.it[v.id];
        if (T.en[v.id] !== undefined) v.en = enVal(v.it, T.en[v.id], v.en);
      }); out[p] = f;
    });
    // esperienze
    var langs = ['it', 'en'];
    Object.keys(EXP).forEach(function (id) {
      if (DEL[id]) return;
      var p = 'content/esperienze/' + id + '.json', o = srcFile(p) || { id: id, ordine: (NEWX[id] || {}).ordine || 999, gruppo: (NEWX[id] || {}).gruppo || 'giornate', visibile: true, presto: false, prezzo: '', luoghi: [], tipi: [], durate: [], livelli: [], foto_copertina: '', posizione_copertina: '', galleria: [], video: [], it: {}, en: {} };
      var it = EXP[id].it, en = EXP[id].en;
      langs.forEach(function (l) {
        var d = EXP[id][l], O = o[l] || {}, I = EXP[id].it;
        var pick = function (v, iv, ov) { return l === 'en' ? enVal(iv, v, ov) : v; };
        var x = (d.x || []).filter(function (t) { return !emptyish(t); });
        var rows = (d.i || []).filter(function (r) { return !(emptyish(r[0]) && emptyish(r[1])); }).map(function (r) { return { voce: deesc(r[0]), valore: deesc(r[1]) }; });
        o[l] = Object.assign({}, O, {
          titolo: pick(d.n || '', I.n, O.titolo), sottotitolo: pick(d.s || '', I.s || '', O.sottotitolo), luogo: pick(d.t || '', I.t, O.luogo), intro: pick(d.l || '', I.l, O.intro),
          paragrafi: (l === 'en' && JSON.stringify(x) === JSON.stringify((I.x || []).filter(function (t) { return !emptyish(t); })) && !(O.paragrafi || []).length) ? [] : x,
          dettagli: (l === 'en' && JSON.stringify(d.i) === JSON.stringify(I.i) && !(O.dettagli || []).length) ? [] : rows,
          punti: (l === 'en' && JSON.stringify(d.f) === JSON.stringify(I.f) && !(O.punti || []).length) ? [] : (d.f || []),
          pulsante: pick(d.c || '', I.c, O.pulsante)
        });
      });
      var gi = (it.g || []).filter(function (g) { return g && typeof g === 'object'; }), ge = (en.g || []).filter(function (g) { return g && typeof g === 'object'; });
      var oldG = o.galleria || [];
      o.galleria = gi.map(function (g, i) {
        var prev = oldG.filter(function (x) { return x.foto === pathOf(g.src); })[0] || {};
        var r = { foto: pathOf(g.src), didascalia_it: g.alt || '', didascalia_en: (ge[i] && ge[i].alt !== g.alt ? ge[i].alt : prev.didascalia_en) || '' };
        if (g.pos || prev.posizione) r.posizione = g.pos || prev.posizione; return r;
      });
      if (it.hp && pathOf(it.hp) !== o.foto_copertina) o.foto_copertina = pathOf(it.hp);
      var pr = priceRow(id, 'it'), pv = pr ? deesc(pr[1]).replace(/\s*(a persona|per person).*$/i, '').trim() : '';
      o.prezzo = isPH(pv) ? '' : pv;
      o.presto = isSoon(id);
      o.visibile = !HIDE[id];
      out[p] = o;
    });
    Object.keys(DEL).forEach(function (id) { if (SRC.files['content/esperienze/' + id + '.json']) del.push('content/esperienze/' + id + '.json'); });
    Object.keys(SHOW).forEach(function (p) { if (SHOW[p]) { var o = srcFile(p); o.visibile = true; out[p] = o; } });
    // date (le date delle esperienze nascoste restano)
    var dOld = (srcFile('content/date.json') || { partenze: [] }).partenze || [];
    var keep = dOld.filter(function (x) { return !EXP[x.esperienza] && !DEL[x.esperienza]; });
    out['content/date.json'] = { partenze: (CFG.dep || []).filter(function (x) { return !DEL[x.e]; }).map(function (x) { return { esperienza: x.e, dal: x.d, al: x.d2 || '', luogo: x.loc || '' }; }).concat(keep) };
    // recensioni e FAQ
    var rv = srcFile('content/recensioni.json') || { voci: [] };
    rv.voci = reviewsNow().map(function (r, i) { var o = (rv.voci || [])[i] || {}; return Object.assign({}, o, r, { testo_en: enVal(r.testo_it, r.testo_en, o.testo_en), autore_en: enVal(r.autore_it, r.autore_en, o.autore_en) }); });
    out['content/recensioni.json'] = rv;
    var fq = srcFile('content/faq.json') || { voci: [] };
    fq.voci = faqNow().map(function (q, i) { var o = (fq.voci || [])[i] || {}; return Object.assign({}, o, q, { domanda_en: enVal(q.domanda_it, q.domanda_en, o.domanda_en), risposta_en: enVal(q.risposta_it, q.risposta_en, o.risposta_en) }); });
    out['content/faq.json'] = fq;
    // impostazioni
    var imp = srcFile('content/impostazioni.json') || {};
    imp.email = CFG.mail || ''; imp.whatsapp = CFG.wa || ''; imp.tripadvisor = CFG.ta || '';
    out['content/impostazioni.json'] = imp;
    // solo i file cambiati
    var changed = {};
    Object.keys(out).forEach(function (p) { var s = JSON.stringify(out[p], null, 2) + '\n'; if (!SRC.files[p] || JSON.stringify(SRC.files[p], null, 2) + '\n' !== s) changed[p] = s; });
    return { changed: changed, del: del, objs: out };
  }
  function usedBlobs(changed) {
    var all = Object.keys(changed).map(function (p) { return changed[p]; }).join('\n'), r = [];
    Object.keys(BLOBS).forEach(function (u) { if (all.indexOf(BLOBS[u].path) >= 0) r.push(BLOBS[u]); });
    return r;
  }
  function publish() {
    if (BUSY) return;
    if (!SRC) { alert('Sto ancora caricando i contenuti, riprova tra qualche secondo.'); return; }
    var res; try { res = buildFiles(); } catch (e) { alert('Non riesco a preparare le modifiche: ' + e.message); return; }
    var paths = Object.keys(res.changed);
    if (!paths.length && !res.del.length) { DIRTY = false; bar(); toast('Non ci sono modifiche da pubblicare.'); return; }
    BUSY = true; bar(); toast('Pubblico le modifiche…', 0);
    var head, baseTree;
    api('GET', '/git/refs/heads/main').then(function (r) {
      head = r.object.sha;
      if (SRC.commit && head !== SRC.commit && head !== LASTSAVE &&
        !confirm('Il sito è stato aggiornato da un’altra parte dopo che hai aperto questa pagina (per esempio da un’altra persona o dal pannello /admin). Se pubblichi ora potresti sovrascrivere quelle modifiche.\n\nPubblicare comunque? (Annulla = ricarico la pagina per prima)')) { location.reload(); throw new Error('stop'); }
      return api('GET', '/git/commits/' + head);
    }).then(function (c) {
      baseTree = c.tree.sha;
      var tree = paths.map(function (p) { return { path: p, mode: '100644', type: 'blob', content: res.changed[p] }; })
        .concat(usedBlobs(res.changed).map(function (b) { return { path: b.path, mode: '100644', type: 'blob', sha: b.sha }; }))
        .concat(res.del.map(function (p) { return { path: p, mode: '100644', type: 'blob', sha: null }; }));
      return api('POST', '/git/trees', { base_tree: baseTree, tree: tree });
    }).then(function (t) {
      var u = user(), who = (u && (u.user_metadata && u.user_metadata.full_name || u.email)) || 'sito';
      return api('POST', '/git/commits', { message: 'Modifiche dal sito (' + who + ')', tree: t.sha, parents: [head] });
    }).then(function (c) {
      return api('PATCH', '/git/refs/heads/main', { sha: c.sha }).then(function () { return c; });
    }).then(function (c) {
      LASTSAVE = c.sha; BUSY = false; DIRTY = false;
      Object.keys(res.objs).forEach(function (p) { SRC.files[p] = res.objs[p]; });
      res.del.forEach(function (p) { delete SRC.files[p]; });
      Object.keys(SHOW).forEach(function (p) { if (SHOW[p] && SRC.files[p]) SRC.files[p].visibile = true; }); SHOW = {};
      NEWX = {}; bar();
      toast('Pubblicato! Il sito online si aggiorna tra circa un minuto.', 7000);
    }).catch(function (e) {
      BUSY = false; bar();
      if (e && e.message === 'stop') return;
      toast(''); alert('Pubblicazione non riuscita: ' + ((e && e.message) || e) + '\nLe modifiche sono ancora qui: riprova tra poco.');
    });
  }

  // ---------------------------------------------------------------- avvio
  function loadSrc() {
    return fetch('/editor-src.json?ts=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { SRC = j; bar(); }, function () { toast('Non riesco a caricare i contenuti per la modifica: ricarica la pagina.', 8000); });
  }
  function on(u) {
    if (!u) { EU.can = false; if (EDIT) location.reload(); bar(); return; }
    EU.can = true; if (!SRC) loadSrc(); bar();
    if (/#accedi/.test(location.hash)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  }
  if (!ID) { toast('Accesso non disponibile: ricarica la pagina.'); return; }
  ID.on('login', function (u) { ID.close(); on(u); toast('Ciao! Premi “Modifica sito” per iniziare.'); });
  ID.on('logout', function () { on(null); });
  ID.on('init', function (u) { on(u); });
  var u0 = user(); if (u0) on(u0);
  else if (/#accedi/.test(location.hash)) setTimeout(function () { if (!user()) ID.open('login'); }, 300);
})();
