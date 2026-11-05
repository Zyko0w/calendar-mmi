import {
  TYPES, ALARMS, MONTHS, MSHORT, WD, WDS, pad, key, fromKey, addDays, wdIdx, sow, today0, toMin, fmtMin, at, dayDiff,
  isoWeek, semester, rel, niceDate, uid, alarmsOf, alarmsLabel, toggleAlarm, defaultAlarms, MAX_ALARMS, clamp, snap, isPoint, occurrences, findOcc as findOccIn, layoutDay,
  nextOccurrence, upcomingDeadlines, upcomingAlarms, parseQuick, validateEvent, createSync, makeDemo,
} from './core.js';

const $ = (s) => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem('mmical:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mmical:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const TAURI = window.__TAURI__ || null;

/* ---------- Icônes ---------- */
const P = {
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', menu: '<path d="M4 6h16M4 12h16M4 18h10"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
};
const ic = (n, s = 18, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HSTART = 7, HEND = 23, H = 56;

/* ---------- Synchronisation ---------- */
const storage = { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v), removeItem: (k) => localStorage.removeItem(k) };
const SYNC_LABEL = { local: 'Cet appareil', idle: 'Connecté', syncing: 'Synchro…', ok: 'Synchronisé', offline: 'Hors ligne', error: 'Erreur de synchro' };
const sync = createSync({
  storage,
  defaultApiUrl: window.AGENDA_CONFIG?.apiUrl || '',
  onChange: () => { if (booted) render(); },
  onStatus: (s, err) => { const el = $('#sync'); el.dataset.s = s; el.querySelector('span').textContent = SYNC_LABEL[s] || s; el.title = err || 'État de la synchronisation'; },
  onAuthLost: () => { toast('Ta session a expiré, reconnecte-toi.'); openLogin(); },
});
const list = () => sync.list();
const findOcc = (oid) => findOccIn(list(), oid);
let booted = false;

/* ---------- État d'affichage ---------- */
let view = ({ semaine: 'week', mois: 'month', agenda: 'agenda' })[location.hash.slice(1)] || LS.get('view', 'week');
let cursor = today0();
let miniCursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
let hidden = new Set(LS.get('hidden', []));
let muted = LS.get('muted', false);
let themePref = LS.get('theme', 'auto');
let fired = new Set(LS.get('fired', []));
let snoozes = LS.get('snoozes', []);
let lastPeriod = '', lastScroll = 0;
const occs = (from, to, all) => occurrences(list(), from, to, all ? null : hidden);

function save(ev) { return sync.save(ev); }
function removeEv(id) {
  const prev = sync.remove(id);
  if (!prev) return;
  toast(`« ${prev.title} » ${prev.source === 'hp' ? 'masqué' : 'supprimé'}`, 'Annuler', () => (prev.demo ? sync.seedDemo([prev]) : sync.save(prev)));
}

/* ---------- Rendu général ---------- */
const viewEl = $('#view');
const daysCount = () => (innerWidth < 760 ? 3 : 7);
function range() {
  if (view === 'week') { const n = daysCount(); const s = n === 7 ? sow(cursor) : new Date(cursor); return [s, addDays(s, n)]; }
  if (view === 'month') { const f = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const s = sow(f); return [s, addDays(s, 42)]; }
  return [new Date(cursor), addDays(cursor, 28)];
}
function render() {
  if (drag) return;
  if (view === 'week') renderWeek(); else if (view === 'month') renderMonth(); else renderAgenda();
  renderTitle(); renderMini(); renderDeadlines(); renderLayers(); renderNext(); renderHero();
  $('#banner').hidden = !sync.hasDemo();
  ['week', 'month', 'agenda'].forEach((v) => document.querySelector(`.seg [data-v="${v}"]`).setAttribute('aria-selected', v === view));
  posSeg();
}
function renderTitle() {
  const [s, e] = range(); const last = addDays(e, -1); const t = $('#ptitle');
  if (view === 'month') { t.innerHTML = `${MONTHS[cursor.getMonth()]} <span>${cursor.getFullYear()}</span>`; return; }
  if (view === 'agenda') { t.innerHTML = `Dès le ${s.getDate()} <span>${MSHORT[s.getMonth()]}</span>`; return; }
  if (s.getMonth() === last.getMonth()) t.innerHTML = `${MONTHS[s.getMonth()]} <span>${s.getFullYear()}</span>`;
  else t.innerHTML = `${MSHORT[s.getMonth()]} – ${MSHORT[last.getMonth()]} <span>${last.getFullYear()}</span>`;
}
function renderHero() {
  const t = today0();
  $('#heroN').textContent = pad(t.getDate());
  $('#heroWd').textContent = WD[wdIdx(t)];
  $('#heroMo').textContent = `${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
  $('#heroWk').textContent = `Semaine ${isoWeek(t)} · ${semester(t)}`;
}

/* ---------- Vue semaine ---------- */
function evHtml(o, i) {
  const ev = o.ev, cat = `var(--c-${ev.type})`;
  const sm = clamp(o.s, HSTART * 60, HEND * 60), top = (sm - HSTART * 60) / 60 * H;
  const lw = `--l:${o.lane / o.n};--w:${1 / o.n};--i:${i};--cat:${cat}`;
  const icons = `${ev.repeat === 'weekly' ? ic('repeat', 11) : ''}${alarmsOf(ev).length ? ic('bell', 11) : ''}`;
  const cls = `${ev.done ? ' done' : ''}${ev.source === 'hp' ? ' locked' : ''}`;
  const lbl = `${esc(ev.title)}, ${niceDate(o.date)} ${fmtMin(o.s)}`;
  const st = ` data-date="${o.date}" data-s="${o.s}" data-e="${o.e}"`;
  if (isPoint(o)) {
    return `<div class="ev pin${cls}${timeState(o)}" tabindex="0" role="button" aria-label="${lbl}" data-oid="${esc(o.oid)}"${st} style="${lw};top:${top - 12}px"><span class="ev-m">${fmtMin(o.s)}</span><span class="ev-t">${esc(ev.title)}</span></div>`;
  }
  const em = clamp(o.e, HSTART * 60 + 15, HEND * 60); const h = Math.max(22, (em - sm) / 60 * H - 2);
  const short = h < 44 ? ' short' : '';
  const meta = [ev.location ? esc(ev.location) : '', icons].filter(Boolean).join(' ');
  return `<div class="ev${short}${cls}${timeState(o)}" tabindex="0" role="button" aria-label="${lbl}" data-oid="${esc(o.oid)}"${st} style="${lw};top:${top + 1}px;height:${h}px"><span class="ev-time"><span class="tm">${fmtMin(o.s)}–${fmtMin(o.e)}</span></span><span class="ev-t">${esc(ev.title)}</span>${meta ? `<span class="ev-m">${meta}</span>` : ''}<span class="rsz" aria-hidden="true"></span></div>`;
}
/** « past » si l'événement est terminé, « live » s'il est en cours (aplat plein). */
function timeState(o) {
  const n = new Date(), tk = key(today0()), m = n.getHours() * 60 + n.getMinutes();
  if (o.date < tk) return ' past';
  if (o.date > tk) return '';
  if (isPoint(o)) return o.s <= m ? ' past' : '';
  if (o.e <= m) return ' past';
  return o.s <= m ? ' live' : '';
}
function markTimes() {
  document.querySelectorAll('#wkGrid .ev[data-s]').forEach((el) => {
    if (el.classList.contains('dragging')) return;
    const o = { date: el.dataset.date, s: +el.dataset.s, e: +el.dataset.e };
    const s = timeState(o).trim();
    el.classList.toggle('past', s === 'past'); el.classList.toggle('live', s === 'live');
  });
}
function renderWeek() {
  const n = daysCount(); const [start, end] = range(); const all = occs(start, end);
  const tk = key(today0());
  const pk = key(start) + n; const changed = pk !== lastPeriod;
  const prevScroll = $('#wkScroll')?.scrollTop;
  let head = '<div class="wk-head" id="wkHead"><div></div>', cols = '', hours = '';
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i), k = key(d); const dayO = layoutDay(all.filter((o) => o.date === k));
    const cls = [k === tk ? 'today' : '', wdIdx(d) >= 5 ? 'we' : '', k < tk ? 'past-day' : ''].join(' ');
    head += `<div class="dh ${k === tk ? 'today' : ''}"><span>${WDS[wdIdx(d)]}</span><b>${d.getDate()}</b>${dayO.length ? `<span class="cnt">${dayO.length}</span>` : ''}</div>`;
    cols += `<div class="col ${cls}" data-date="${k}">${dayO.map((o, j) => evHtml(o, j + i * 3)).join('')}${k === tk ? '<div class="now" id="nowLine"></div>' : ''}</div>`;
  }
  head += '</div>';
  for (let h = HSTART + 1; h < HEND; h++) hours += `<div class="hl" style="top:${(h - HSTART) * H}px">${pad(h)}:00</div>`;
  const showNow = key(start) <= tk && tk < key(end);
  viewEl.dataset.kind = 'week';
  viewEl.innerHTML = `<div class="card wk${changed ? ' enter' : ''}" style="--days:${n}">${head}<div class="wk-scroll" id="wkScroll"><div class="wk-grid" id="wkGrid" style="height:${(HEND - HSTART) * H}px"><div class="hours">${hours}${showNow ? '<div class="now-lbl" id="nowLbl"></div>' : ''}</div>${cols}</div></div></div>`;
  const sc = $('#wkScroll');
  $('#wkHead').style.setProperty('--sbw', (sc.offsetWidth - sc.clientWidth) + 'px');
  if (changed) {
    const nd = new Date(); const nowM = nd.getHours() * 60 + nd.getMinutes();
    sc.scrollTop = Math.max(0, showNow ? (nowM - HSTART * 60) / 60 * H - 220 : (8 - HSTART) * H - 8);
  } else sc.scrollTop = prevScroll ?? lastScroll;
  sc.addEventListener('scroll', () => { lastScroll = sc.scrollTop; }, { passive: true });
  lastPeriod = pk;
  updateNow();
  const g = $('#wkGrid');
  g.addEventListener('pointerdown', gDown); g.addEventListener('pointermove', gMove);
  g.addEventListener('pointerup', gUp); g.addEventListener('pointercancel', () => { if (drag) { drag.ghost?.remove(); drag = null; render(); } });
}
function updateNow() {
  const l = $('#nowLine'), lb = $('#nowLbl'); if (!l || !lb) return;
  const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
  const vis = m >= HSTART * 60 && m <= HEND * 60; l.style.display = lb.style.display = vis ? '' : 'none';
  const top = (m - HSTART * 60) / 60 * H; l.style.top = top + 'px'; lb.style.top = top + 'px'; lb.textContent = fmtMin(m);
  markTimes();
}

/* ---------- Glisser-déposer ---------- */
let drag = null;
function colMin(col, y) { const r = col.getBoundingClientRect(); return snap((y - r.top) / H * 60 + HSTART * 60); }
function gDown(e) {
  if (e.button !== 0) return;
  const col = e.target.closest('.col'); if (!col) return;
  const evEl = e.target.closest('.ev'); const touch = e.pointerType === 'touch';
  if (evEl) {
    const o = findOcc(evEl.dataset.oid); if (!o) return;
    const locked = o.ev.source === 'hp';
    drag = { mode: e.target.closest('.rsz') && !touch && !locked ? 'resize' : 'pending', el: evEl, o, x0: e.clientX, y0: e.clientY, touch, locked };
  } else {
    if (touch) { drag = { mode: 'tap', col, y: e.clientY, x0: e.clientX, y0: e.clientY, touch }; return; }
    const m = clamp(colMin(col, e.clientY), HSTART * 60, HEND * 60 - 15);
    drag = { mode: 'create', col, date: col.dataset.date, a: m, b: m, moved: false, x0: e.clientX, y0: e.clientY };
  }
  if (!touch) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } e.preventDefault(); }
}
function gMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, far = Math.hypot(dx, dy) > 5;
  if (drag.touch) { if (far) drag.cancel = true; return; }
  if (drag.mode === 'create') {
    if (far) drag.moved = true; if (!drag.moved) return;
    drag.b = clamp(colMin(drag.col, e.clientY), HSTART * 60, HEND * 60);
    if (!drag.ghost) { drag.ghost = document.createElement('div'); drag.ghost.className = 'ghost'; drag.col.append(drag.ghost); }
    const a = Math.min(drag.a, drag.b); let b = Math.max(drag.a, drag.b); if (b - a < 15) b = a + 15;
    drag.ghost.style.top = (a - HSTART * 60) / 60 * H + 'px'; drag.ghost.style.height = (b - a) / 60 * H + 'px';
    drag.ghost.textContent = `${fmtMin(a)} – ${fmtMin(b)}`;
    return;
  }
  if (drag.mode === 'pending' && far && !drag.locked) { drag.mode = 'move'; drag.el.classList.add('dragging'); drag.el.style.left = '2px'; drag.el.style.width = 'calc(100% - 4px)'; }
  if (drag.mode === 'pending' && far && drag.locked) drag.cancel = true;
  if (drag.mode === 'move') {
    const o = drag.o, dur = o.e - o.s;
    const ns = clamp(snap(o.s + dy / H * 60), HSTART * 60, HEND * 60 - Math.max(dur, 15));
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.col');
    if (under && under !== drag.el.parentElement) under.append(drag.el);
    drag.ns = ns; drag.nd = drag.el.parentElement.dataset.date;
    const top = (ns - HSTART * 60) / 60 * H;
    drag.el.style.top = (isPoint(o) ? top - 13 : top + 1) + 'px';
    const tm = drag.el.querySelector('.tm') || drag.el.querySelector('.ev-m');
    if (tm) tm.textContent = isPoint(o) ? fmtMin(ns) : `${fmtMin(ns)}–${fmtMin(ns + dur)}`;
  }
  if (drag.mode === 'resize') {
    const o = drag.o; const ne = clamp(snap(o.e + dy / H * 60), o.s + 15, HEND * 60); drag.ne = ne;
    drag.el.style.height = Math.max(22, (ne - o.s) / 60 * H - 2) + 'px';
    const tm = drag.el.querySelector('.tm'); if (tm) tm.textContent = `${fmtMin(o.s)}–${fmtMin(ne)}`;
  }
}
function gUp() {
  const d = drag; drag = null; if (!d) return;
  if (d.mode === 'tap') { if (!d.cancel) { const a = clamp(Math.floor(colMin(d.col, d.y) / 30) * 30, HSTART * 60, HEND * 60 - 60); openEditor(null, { date: d.col.dataset.date, s: a, e: a + 60 }); } return; }
  if (d.mode === 'create') {
    let a = Math.min(d.a, d.b), b = Math.max(d.a, d.b);
    if (!d.moved) { a = clamp(Math.floor(d.a / 30) * 30, HSTART * 60, HEND * 60 - 60); b = a + 60; }
    if (b - a < 15) b = a + 15;
    d.ghost?.remove();
    openEditor(null, { date: d.date, s: a, e: b }); return;
  }
  if (d.mode === 'pending') { if (!d.cancel) openEditor(d.o.ev, null, d.o.date); return; }
  if (d.mode === 'move') {
    const o = d.o; if (d.ns == null) { render(); return; }
    const dur = o.e - o.s, shift = dayDiff(o.date, d.nd);
    if (shift === 0 && d.ns === o.s) { render(); return; }
    const before = { ...o.ev };
    const ev = { ...o.ev, date: o.ev.repeat === 'weekly' ? key(addDays(fromKey(o.ev.date), shift)) : d.nd, start: fmtMin(d.ns), end: fmtMin(d.ns + dur) };
    save(ev);
    toast(`Déplacé ${ev.repeat === 'weekly' ? '(toute la série) ' : ''}au ${niceDate(d.nd)} à ${ev.start}`, 'Annuler', () => save(before));
    return;
  }
  if (d.mode === 'resize') {
    if (d.ne == null || d.ne === d.o.e) { render(); return; }
    const before = { ...d.o.ev }; const ev = save({ ...d.o.ev, end: fmtMin(d.ne) });
    toast(`Fin réglée à ${ev.end}`, 'Annuler', () => save(before));
  }
}

/* ---------- Vue mois ---------- */
function renderMonth() {
  const [start, end] = range(); const all = occs(start, end); const tk = key(today0()); const m = cursor.getMonth();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), k = key(d), dayO = all.filter((o) => o.date === k);
    const max = 3, shown = dayO.slice(0, max);
    cells += `<div class="cell ${d.getMonth() !== m ? 'out' : ''} ${k === tk ? 'today' : ''}" data-date="${k}">
      <button class="cell-n" data-goto="${k}" aria-label="Voir la semaine du ${d.getDate()} ${MONTHS[d.getMonth()]}">${d.getDate()}</button>
      ${shown.map((o) => `<button class="mchip ${isPoint(o) ? 'pinc' : ''}" data-oid="${esc(o.oid)}" style="--cat:var(--c-${o.ev.type})"><i></i><em>${fmtMin(o.s)}</em><span>${esc(o.ev.title)}</span></button>`).join('')}
      ${dayO.length > max ? `<span class="more">+${dayO.length - max} autre${dayO.length - max > 1 ? 's' : ''}</span>` : ''}
      <div class="dots">${dayO.slice(0, 5).map((o) => `<i style="--cat:var(--c-${o.ev.type})"></i>`).join('')}</div>
    </div>`;
  }
  viewEl.dataset.kind = 'month';
  viewEl.innerHTML = `<div class="card"><div class="mo-head">${WDS.map((w) => `<div>${w}</div>`).join('')}</div><div class="mo-grid">${cells}</div></div>`;
}

/* ---------- Vue agenda ---------- */
function renderAgenda() {
  const [start, end] = range(); const all = occs(start, end); const tk = key(today0()); const now = Date.now();
  const days = {}; all.forEach((o) => { (days[o.date] = days[o.date] || []).push(o); });
  const ks = Object.keys(days).sort();
  viewEl.dataset.kind = 'agenda';
  if (!ks.length) { viewEl.innerHTML = `<div class="card"><div class="ag-empty"><b>Rien de prévu sur 4 semaines</b>Ajoute un cours, une SAÉ ou un rendu avec le bouton Nouveau ou l'ajout rapide.</div></div>`; return; }
  viewEl.innerHTML = `<div class="card"><div class="ag">${ks.map((k) => {
    const d = fromKey(k);
    return `<div class="ag-day ${k === tk ? 'today' : ''}"><div class="ag-d"><b>${d.getDate()}</b><span>${k === tk ? "aujourd'hui" : WDS[wdIdx(d)] + ' ' + MSHORT[d.getMonth()]}</span></div><div class="ag-list">${days[k].map((o) => {
      const ev = o.ev, st = at(k, o.s).getTime(), en = at(k, o.e).getTime();
      let cd = '';
      if (!ev.done) { if (now < st && st - now < 7 * 864e5) cd = `dans ${rel(st - now)}`; else if (now >= st && now < en) cd = 'en cours'; } else cd = 'terminé';
      const cdc = cd === 'en cours' ? 'cd live' : 'cd';
      return `<button class="ag-row ${ev.done ? 'done' : ''}" data-oid="${esc(o.oid)}" style="--cat:var(--c-${ev.type})">
        <span class="ag-time"><b>${fmtMin(o.s)}</b>${isPoint(o) ? ' limite' : ' – ' + fmtMin(o.e)}</span>
        <span style="min-width:0"><div class="ag-t">${esc(ev.title)}</div><div class="ag-sub"><span>${TYPES[ev.type].label}${ev.source === 'hp' ? ', Hyperplanning' : ''}</span>${ev.location ? `<span>${ic('pin', 12)}${esc(ev.location)}</span>` : ''}${ev.repeat === 'weekly' ? `<span>${ic('repeat', 12)}hebdo</span>` : ''}${alarmsOf(ev).length ? `<span>${ic('bell', 12)}${alarmsLabel(ev)}</span>` : ''}</div></span>
        ${cd ? `<span class="${cdc}">${cd}</span>` : '<span></span>'}
      </button>`;
    }).join('')}</div></div>`;
  }).join('')}</div></div>`;
}

/* ---------- Rail ---------- */
function renderMini() {
  const f = miniCursor, start = sow(f), tk = key(today0());
  const [rs, re] = range(); const rsk = key(rs), rek = key(re);
  const has = new Set(occs(start, addDays(start, 42)).map((o) => o.date));
  $('#miniTitle').textContent = `${MONTHS[f.getMonth()]} ${f.getFullYear()}`;
  $('#miniTitle').style.textTransform = 'capitalize';
  let h = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((w) => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), k = key(d);
    const c = [d.getMonth() !== f.getMonth() ? 'out' : '', k === tk ? 'today' : '', k >= rsk && k < rek && view !== 'month' ? 'inr' : '', has.has(k) ? 'has' : ''].join(' ');
    h += `<button class="mini-d ${c}" data-mini="${k}" aria-label="${d.getDate()} ${MONTHS[d.getMonth()]}">${d.getDate()}</button>`;
  }
  $('#mini').innerHTML = h;
}
function renderDeadlines() {
  const now = Date.now();
  const dl = upcomingDeadlines(list(), 45, now).slice(0, 5);
  $('#dlCount').textContent = dl.length ? `${dl.length} à venir` : '';
  if (!dl.length) { $('#dl').innerHTML = '<p class="empty-s">Aucun rendu dans les 45 prochains jours.</p>'; return; }
  $('#dl').innerHTML = dl.map((o) => {
    const rem = at(o.date, o.s).getTime() - now;
    const d = Math.floor(rem / 864e5), hh = Math.max(0, Math.floor(rem / 36e5));
    const j = d >= 1 ? `J-${d}` : `${hh} h`;
    return `<li class="${rem < 864e5 ? 'urgent' : ''}" style="--cat:var(--c-${o.ev.type})">
      <button class="dl-t" data-oid="${esc(o.oid)}"><span>${esc(o.ev.title)}</span><div class="dl-s">${niceDate(o.date)} à ${fmtMin(o.s)}</div></button>
      <span class="dl-j" title="Dans ${rel(rem)}">${j}</span>
      ${o.ev.type === 'rendu' ? `<button class="chk" data-done="${esc(o.ev.id)}" aria-label="Marquer « ${esc(o.ev.title)} » comme rendu">${ic('check', 13, 3)}</button>` : '<span></span>'}
    </li>`;
  }).join('');
}
function renderLayers() {
  const [s, e] = range(); const cnt = {}; occs(s, e, true).forEach((o) => { cnt[o.ev.type] = (cnt[o.ev.type] || 0) + 1; });
  $('#layers').innerHTML = Object.entries(TYPES).map(([k, t]) => `<button class="layer" data-layer="${k}" aria-pressed="${!hidden.has(k)}" style="--cat:var(--c-${k})"><i></i>${t.label}${cnt[k] ? ` <span style="color:var(--muted)">${cnt[k]}</span>` : ''}</button>`).join('');
}
function renderNext() {
  const now = Date.now(); const o = nextOccurrence(list(), hidden, now); const el = $('#next');
  if (!o) { el.style.setProperty('--cat', 'var(--muted)'); el.innerHTML = `<span class="next-k">Prochain</span><span class="next-cd">Rien de prévu</span><span class="next-meta">Les 3 prochaines semaines sont libres.</span>`; el.dataset.oid = ''; return; }
  const st = at(o.date, o.s).getTime(), en = at(o.date, o.e).getTime(), ev = o.ev;
  el.dataset.oid = o.oid; el.style.setProperty('--cat', `var(--c-${ev.type})`);
  const ongoing = !isPoint(o) && now >= st;
  const cd = ongoing ? `Fin dans ${rel(en - now)}` : (isPoint(o) ? `Rendu dans ${rel(st - now)}` : `Dans ${rel(st - now)}`);
  el.innerHTML = `<span class="next-k">${ongoing ? 'En cours' : 'Prochain'}, ${TYPES[ev.type].label.toLowerCase()}</span>
    <span class="next-cd">${cd}</span><span class="next-t">${esc(ev.title)}</span>
    <span class="next-meta"><span>${ic('clock', 13)}${niceDate(o.date)} ${fmtMin(o.s)}${isPoint(o) ? '' : '–' + fmtMin(o.e)}</span>${ev.location ? `<span>${ic('pin', 13)}${esc(ev.location)}</span>` : ''}</span>
    ${ongoing ? `<span class="prog"><i style="width:${clamp((now - st) / (en - st) * 100, 0, 100)}%"></i></span>` : ''}`;
}

/* ---------- Navigation ---------- */
function setView(v) { view = v; LS.set('view', v); try { history.replaceState(null, '', '#' + ({ week: 'semaine', month: 'mois', agenda: 'agenda' })[v]); } catch { /* ignore */ } lastPeriod = ''; render(); }
function step(dir) {
  if (view === 'week') cursor = addDays(cursor, dir * daysCount());
  else if (view === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
  else cursor = addDays(cursor, dir * 7);
  miniCursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1); render();
}
function goToday() { cursor = today0(); miniCursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1); lastPeriod = ''; render(); }
function posSeg() { const b = document.querySelector('.seg [aria-selected="true"]'); const ind = $('#segInd'); if (!b) return; ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px)`; }

/* ---------- Éditeur ---------- */
let editing = null, editOccDate = null, alarmTouched = false, curAlarms = [];
const fT = $('#fTitle'), fD = $('#fDate'), fS = $('#fStart'), fE = $('#fEnd'), fL = $('#fLoc'), fA = $('#fAlarm'), fR = $('#fRepeat'), fU = $('#fUntil'), fN = $('#fNotes'), fDone = $('#fDone');
function renderAlarmChips() {
  fA.innerHTML = ALARMS.map(([v, l]) => {
    const on = v == null ? curAlarms.length === 0 : curAlarms.includes(v);
    return `<button type="button" class="achip" data-a="${v == null ? '' : v}" aria-pressed="${on}">${ic('check', 13, 3)}${l}</button>`;
  }).join('');
}
fA.addEventListener('click', (e) => {
  const b = e.target.closest('.achip'); if (!b) return;
  alarmTouched = true;
  if (b.dataset.a === '') curAlarms = [];
  else {
    const before = curAlarms.length;
    curAlarms = toggleAlarm(curAlarms, Number(b.dataset.a));
    if (curAlarms.length === before && !curAlarms.includes(Number(b.dataset.a))) toast(`${MAX_ALARMS} alarmes maximum par événement.`);
  }
  renderAlarmChips();
});
$('#fTypes').innerHTML = Object.entries(TYPES).map(([k, t]) => `<button type="button" class="tchip" role="radio" data-type="${k}" style="--cat:var(--c-${k})"><i></i>${t.label}</button>`).join('');
function setType(t) {
  editing.type = t;
  document.querySelectorAll('.tchip').forEach((b) => b.setAttribute('aria-checked', b.dataset.type === t));
  const point = t === 'rendu';
  $('#wrapEnd').style.display = point ? 'none' : '';
  $('#lblStart').textContent = point ? 'Heure limite' : 'Début';
  $('#wrapDone').hidden = !point;
  if (!alarmTouched) { curAlarms = defaultAlarms(t); renderAlarmChips(); }
}
function setRepeat(on) { fR.setAttribute('aria-checked', on); $('#wrapUntil').style.opacity = on ? 1 : 0.4; fU.disabled = !on; updRepHint(); }
function updRepHint() {
  const on = fR.getAttribute('aria-checked') === 'true'; const h = $('#repHint');
  if (!on || !fD.value) { h.hidden = true; return; }
  const d = fromKey(fD.value); h.hidden = false;
  h.textContent = `Chaque ${WD[wdIdx(d)]} à partir du ${d.getDate()} ${MONTHS[d.getMonth()]}${fU.value ? `, jusqu'au ${fromKey(fU.value).getDate()} ${MONTHS[fromKey(fU.value).getMonth()]}` : ''}.`;
}
function openEditor(ev, pre, occDate) {
  closeDrawer();
  alarmTouched = !!ev; editOccDate = occDate || null;
  if (ev) editing = { ...ev };
  else {
    const t = LS.get('lastType', 'cours');
    const nd = new Date();
    const d = pre || { date: key(cursor), s: Math.max(HSTART * 60, Math.ceil((nd.getHours() * 60 + nd.getMinutes()) / 30) * 30), e: 0 };
    if (!d.e) d.e = d.s + 60;
    editing = { id: uid(), title: '', type: t, date: d.date, start: fmtMin(Math.min(d.s, 23 * 60 + 45)), end: fmtMin(Math.min(d.e, 23 * 60 + 59)), location: '', notes: '', alarms: defaultAlarms(t), repeat: 'none', until: '', skip: [], isNew: true };
  }
  const hp = editing.source === 'hp';
  $('#shTitle').textContent = ev ? (hp ? 'Cours Hyperplanning' : ev.demo ? "Modifier l'exemple" : 'Modifier') : 'Nouvel événement';
  fT.value = editing.title; fD.value = editing.date; fS.value = editing.start; fE.value = editing.end || editing.start;
  fL.value = editing.location || ''; fN.value = editing.notes || '';
  fU.value = editing.until || key(addDays(fromKey(editing.date), 7 * 10));
  fDone.setAttribute('aria-checked', !!editing.done);
  setType(editing.type);
  curAlarms = alarmsOf(editing); renderAlarmChips();
  setRepeat(editing.repeat === 'weekly');
  [fT, fD, fS, fE, fL].forEach((x) => { x.disabled = hp; });
  fR.disabled = hp; $('#fTypes').classList.toggle('locked', hp);
  $('#hpNote').hidden = !hp; $('#hpInfo').textContent = editing.hpInfo || '';
  $('#delBtn').style.visibility = ev ? 'visible' : 'hidden';
  $('#delBtn').innerHTML = ic('trash', 16) + (hp ? 'Masquer' : 'Supprimer');
  $('#delc').classList.remove('on'); $('#fErr').textContent = '';
  const m = $('#modal'); m.classList.add('on'); m.setAttribute('aria-hidden', 'false');
  setTimeout(() => (hp ? fA.querySelector('.achip') : fT)?.focus({ preventScroll: true }), 60);
}
function closeEditor() { const m = $('#modal'); m.classList.remove('on'); m.setAttribute('aria-hidden', 'true'); editing = null; if (view === 'week') render(); }
$('#fTypes').addEventListener('click', (e) => { const b = e.target.closest('.tchip'); if (b && editing?.source !== 'hp') setType(b.dataset.type); });
fR.addEventListener('click', () => { if (!fR.disabled) setRepeat(fR.getAttribute('aria-checked') !== 'true'); });
fDone.addEventListener('click', () => fDone.setAttribute('aria-checked', fDone.getAttribute('aria-checked') !== 'true'));
fD.addEventListener('change', updRepHint); fU.addEventListener('change', updRepHint);
$('#form').addEventListener('submit', (e) => {
  e.preventDefault(); if (!editing) return;
  const point = editing.type === 'rendu';
  const rep = fR.getAttribute('aria-checked') === 'true';
  const ev = {
    ...editing, title: fT.value.trim(), date: fD.value, start: fS.value, end: point ? fS.value : (fE.value || fS.value),
    location: fL.value.trim(), notes: fN.value.trim(), alarms: [...curAlarms],
    repeat: rep ? 'weekly' : 'none', until: rep ? fU.value : '', done: point && fDone.getAttribute('aria-checked') === 'true',
  };
  const err = validateEvent(ev);
  if (err) { $('#fErr').textContent = err; return; }
  const isNew = ev.isNew; delete ev.isNew;
  LS.set('lastType', ev.type);
  editing = null; $('#modal').classList.remove('on'); $('#modal').setAttribute('aria-hidden', 'true');
  save(ev);
  toast(isNew ? `« ${ev.title} » ajouté ${niceDate(ev.date)}` : 'Modifications enregistrées');
});
$('#cancelBtn').onclick = closeEditor; $('#closeX').onclick = closeEditor;
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeEditor(); });
$('#delBtn').onclick = () => {
  if (!editing) return;
  if (editing.repeat === 'weekly' && editOccDate) { $('#delc').classList.add('on'); return; }
  const id = editing.id; closeEditor(); removeEv(id);
};
$('#delAll').onclick = () => { const id = editing.id; closeEditor(); removeEv(id); };
$('#delOne').onclick = () => {
  const ev = sync.get(editing.id); const k = editOccDate; closeEditor(); if (!ev) return;
  const before = { ...ev }; save({ ...ev, skip: [...(ev.skip || []), k] });
  toast(`Séance du ${niceDate(k)} supprimée`, 'Annuler', () => save(before));
};

/* ---------- Ajout rapide ---------- */
const qi = $('#quick'), qp = $('#qp');
function showQp() {
  const v = qi.value.trim(); if (!v) { qp.classList.remove('on'); return; }
  const p = parseQuick(v);
  qp.innerHTML = `<div class="qp-t">${esc(p.title)}</div><div class="qp-tags">
    <span class="tag cat" style="--cat:var(--c-${p.type})"><i></i>${TYPES[p.type].label}</span>
    <span class="tag">${ic('clock', 12)}${niceDate(p.date)} ${p.start}${p.end !== p.start ? '–' + p.end : ''}</span>
    ${p.location ? `<span class="tag">${ic('pin', 12)}${esc(p.location)}</span>` : ''}
    <span class="tag">${ic('bell', 12)}${alarmsLabel(p)}</span></div>
    <div class="qp-h"><kbd>Entrée</kbd> pour ajouter, <kbd>Maj</kbd> + <kbd>Entrée</kbd> pour ajuster les détails</div>`;
  qp.classList.add('on');
}
qi.addEventListener('input', showQp); qi.addEventListener('focus', showQp);
qi.addEventListener('blur', () => setTimeout(() => qp.classList.remove('on'), 150));
qi.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { qi.value = ''; qp.classList.remove('on'); qi.blur(); return; }
  if (e.key !== 'Enter' || !qi.value.trim()) return;
  e.preventDefault(); const p = parseQuick(qi.value); qi.value = ''; qp.classList.remove('on');
  if (e.shiftKey) {
    qi.blur(); openEditor(null, { date: p.date, s: toMin(p.start), e: toMin(p.end) });
    editing = { ...p, isNew: true }; fT.value = p.title; fL.value = p.location; alarmTouched = true; setType(p.type); curAlarms = alarmsOf(p); renderAlarmChips();
    return;
  }
  const ev = save(p); cursor = fromKey(p.date); lastPeriod = ''; render();
  toast(`« ${ev.title} » ajouté ${niceDate(ev.date)} à ${ev.start}`, 'Modifier', () => { const x = sync.get(ev.id); if (x) openEditor(x); });
});

/* ---------- Toasts ---------- */
function toast(msg, label, fn) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<span>${esc(msg)}</span>`;
  if (label) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); t.remove(); }; t.append(b); }
  $('#toasts').append(t); setTimeout(() => t.remove(), 5200);
  const all = $('#toasts').children; if (all.length > 3) all[0].remove();
}

/* ---------- Alarmes ---------- */
let actx = null, soundTimer = null, ringing = null, titleTimer = null; const queue = []; const baseTitle = document.title;
function unlock() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* ignore */ } }
document.addEventListener('pointerdown', unlock, { passive: true }); document.addEventListener('keydown', unlock);
function chime() {
  if (muted) return; unlock(); if (!actx) return; const t = actx.currentTime;
  [[0, 880], [0.16, 1108.7], [0.32, 1318.5], [0.56, 1760]].forEach(([dt, f]) => {
    const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.22, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.42);
    o.connect(g); g.connect(actx.destination); o.start(t + dt); o.stop(t + dt + 0.45);
  });
}
async function nativeNotify(o, body) {
  if (!TAURI) return;
  try {
    const n = TAURI.notification;
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === 'granted';
    if (ok) n.sendNotification({ title: `${fmtMin(o.s)} ${o.ev.title}`, body });
    const w = TAURI.window.getCurrentWindow();
    await w.show(); await w.unminimize(); await w.setFocus();
  } catch (e) { console.warn('notification', e); }
}
function enqueue(o) { queue.push(o); if (!ringing) nextAlarm(); }
function nextAlarm() {
  const o = queue.shift(); if (!o) return; ringing = o;
  const st = at(o.date, o.s).getTime(), now = Date.now(), ev = o.ev;
  $('#alK').textContent = `Rappel, ${TYPES[ev.type]?.label.toLowerCase() || 'événement'}`;
  $('#alTime').textContent = fmtMin(o.s);
  $('#alT').textContent = ev.title;
  const when = st - now > 60000 ? `${ev.type === 'rendu' ? 'À rendre' : 'Commence'} dans ${rel(st - now)}` : (now - st > 60000 ? `A commencé il y a ${rel(now - st)}` : "C'est maintenant");
  const sub = [when, niceDate(o.date) !== "aujourd'hui" ? niceDate(o.date) : '', ev.location].filter(Boolean).join(', ');
  $('#alS').textContent = sub;
  const a = $('#alarm'); a.classList.add('on'); a.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#alStop').focus(), 50);
  nativeNotify(o, sub);
  chime(); clearInterval(soundTimer); let n = 0; soundTimer = setInterval(() => { chime(); if (++n > 40) stopSound(); }, 1500);
  let f = false; clearInterval(titleTimer); titleTimer = setInterval(() => { document.title = (f = !f) ? `⏰ ${ev.title}` : baseTitle; }, 1000);
}
function stopSound() { clearInterval(soundTimer); soundTimer = null; }
function dismiss() {
  stopSound(); clearInterval(titleTimer); document.title = baseTitle;
  const a = $('#alarm'); a.classList.remove('on'); a.setAttribute('aria-hidden', 'true'); ringing = null;
  setTimeout(nextAlarm, 400);
}
$('#alStop').onclick = dismiss;
$('#alSnz').onclick = () => {
  const o = ringing;
  if (o) { snoozes.push({ at: Date.now() + 5 * 60000, date: o.date, s: o.s, e: o.e, oid: o.oid, ev: { title: o.ev.title, type: o.ev.type, location: o.ev.location || '' } }); LS.set('snoozes', snoozes); toast('Rappel dans 5 minutes'); }
  dismiss();
};
function checkAlarms() {
  const now = Date.now();
  for (const a of upcomingAlarms(list(), 2, now)) {
    if (fired.has(a.key)) continue;
    if (now >= a.fireAt && now - a.fireAt < 10 * 60000) { fired.add(a.key); LS.set('fired', [...fired].slice(-400)); enqueue(a.occ); }
  }
  if (snoozes.length) { const due = snoozes.filter((s) => now >= s.at); if (due.length) { snoozes = snoozes.filter((s) => now < s.at); LS.set('snoozes', snoozes); due.forEach((s) => enqueue(s)); } }
}
$('#testAlarm').onclick = () => { unlock(); const n = new Date(), m = n.getHours() * 60 + n.getMinutes() + 10; enqueue({ date: key(today0()), s: Math.min(m, 23 * 60 + 59), e: Math.min(m + 60, 23 * 60 + 59), oid: 'test|x', ev: { title: "Test d'alarme : TD UX design", type: 'cours', location: 'Salle 108' } }); };

/* ---------- Thème ---------- */
const effDark = () => { const a = document.documentElement.getAttribute('data-theme'); return a ? a === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
function applyTheme() {
  const r = document.documentElement;
  if (themePref === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', themePref);
  $('#themeBtn').innerHTML = effDark() ? ic('sun', 18) : ic('moon', 18);
  document.querySelectorAll('#themeSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === themePref));
  if (TAURI) { try { TAURI.window.getCurrentWindow().setTheme(themePref === 'auto' ? null : themePref); } catch { /* ignore */ } }
}
function setTheme(p, x, y) {
  const go = () => { themePref = p; LS.set('theme', p); applyTheme(); };
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
  const tr = document.startViewTransition(go);
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  tr.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 620, easing: 'cubic-bezier(.7,0,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
}
$('#themeBtn').onclick = (e) => { const b = e.currentTarget.getBoundingClientRect(); setTheme(effDark() ? 'light' : 'dark', b.left + b.width / 2, b.top + b.height / 2); };
$('#themeSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const r = b.getBoundingClientRect(); setTheme(b.dataset.t, r.left + r.width / 2, r.top + r.height / 2); };
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ---------- Connexion ---------- */
let authMode = 'login';
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll('#authSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
  $('#aGo').textContent = m === 'login' ? 'Se connecter' : 'Créer mon compte';
  $('#aPwd').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#aErr').textContent = '';
}
function openLogin() {
  $('#aApi').value = sync.state.apiUrl || '';
  const l = $('#login'); l.classList.add('on'); l.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#aEmail').focus(), 60);
}
function closeLogin() { const l = $('#login'); l.classList.remove('on'); l.setAttribute('aria-hidden', 'true'); }
$('#authSeg').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) setAuthMode(b.dataset.m); };
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#aEmail').value.trim(), pwd = $('#aPwd').value;
  if (!email || !pwd) { $('#aErr').textContent = 'Renseigne ton e-mail et ton mot de passe.'; return; }
  if ($('#aApi').value.trim()) await sync.setApiUrl($('#aApi').value);
  const btn = $('#aGo'); btn.disabled = true; btn.textContent = 'Connexion…';
  try {
    sync.clearDemo();
    await sync.login(email, pwd, authMode === 'register');
    LS.set('skipLogin', false);
    closeLogin(); sync.start(30000);
    toast(authMode === 'register' ? 'Compte créé. Ajoute ton lien Hyperplanning dans les réglages.' : 'Connecté, tes événements sont synchronisés.');
    if (authMode === 'register') setTimeout(openSettings, 600);
  } catch (err) {
    $('#aErr').textContent = err.message;
  } finally { btn.disabled = false; setAuthMode(authMode); }
});
$('#aSkip').onclick = () => { LS.set('skipLogin', true); closeLogin(); if (!sync.hasLocalData()) sync.seedDemo(makeDemo()); };

/* ---------- Réglages ---------- */
function fmtAgo(t) { if (!t) return 'jamais'; return 'il y a ' + rel(Date.now() - t); }
function renderSettings() {
  const u = sync.state.user;
  $('#setAccount').innerHTML = u
    ? `<div class="acct"><b>${esc(u.email)}</b><button type="button" class="btn-ghost" id="logoutBtn">Se déconnecter</button><button type="button" class="btn-del" id="delAcct">Supprimer mon compte</button></div>`
    : `<div class="acct"><b>Pas connecté : tes événements restent sur ce PC.</b><button type="button" class="btn-save" id="loginBtn">Se connecter</button></div>`;
  $('#setHpSec').style.opacity = u ? 1 : 0.5;
  ['#hpUrl', '#hpSave', '#hpSync', '#hpRemove'].forEach((s) => { $(s).disabled = !u; });
  $('#hpUrl').value = u?.hpUrl || '';
  $('#hpRemove').style.display = u?.hpUrl ? '' : 'none';
  $('#hpSync').style.display = u?.hpUrl ? '' : 'none';
  const st = $('#hpStatus');
  st.classList.toggle('bad', !!u?.hpError);
  st.textContent = !u ? 'Connecte-toi pour importer ton emploi du temps.' : u.hpError ? `Dernière tentative ${fmtAgo(u.hpLastSync)} : ${u.hpError}` : u.hpUrl ? `${u.hpCount || 0} cours importés, mis à jour ${fmtAgo(u.hpLastSync)}.` : 'Aucun lien enregistré.';
  $('#apiUrl').value = sync.state.apiUrl || '';
}
function openSettings() { closeDrawer(); renderSettings(); const s = $('#settings'); s.classList.add('on'); s.setAttribute('aria-hidden', 'false'); }
function closeSettings() { const s = $('#settings'); s.classList.remove('on'); s.setAttribute('aria-hidden', 'true'); }
$('#settingsBtn').onclick = openSettings; $('#setClose').onclick = closeSettings;
$('#settings').addEventListener('pointerdown', (e) => { if (e.target.id === 'settings') closeSettings(); });
$('#setAccount').addEventListener('click', async (e) => {
  if (e.target.id === 'loginBtn') { closeSettings(); openLogin(); }
  if (e.target.id === 'logoutBtn') { sync.stop(); await sync.logout(); renderSettings(); toast('Déconnecté. Les données de ce PC ont été effacées.'); }
  if (e.target.id === 'delAcct') {
    if (e.target.dataset.confirm !== '1') { e.target.dataset.confirm = '1'; e.target.textContent = 'Confirmer la suppression définitive'; return; }
    try { sync.stop(); await sync.deleteAccount(); renderSettings(); toast('Compte et événements supprimés.'); } catch (err) { toast(err.message); }
  }
});
async function hpAction(fn, okMsg) {
  const st = $('#hpStatus'); st.classList.remove('bad'); st.textContent = 'Import en cours…';
  try { const r = await fn(); renderSettings(); toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); } catch (err) { renderSettings(); st.classList.add('bad'); st.textContent = err.message; }
}
$('#hpSave').onclick = () => {
  const url = $('#hpUrl').value.trim();
  if (!url) { $('#hpStatus').textContent = "Colle le lien iCal copié depuis Hyperplanning."; $('#hpStatus').classList.add('bad'); return; }
  hpAction(() => sync.setHyperplanning(url), (r) => `${r.result?.count ?? 0} cours importés depuis Hyperplanning`);
};
$('#hpSync').onclick = () => hpAction(() => sync.syncHyperplanning(), (r) => (r.result?.skipped ? "Déjà à jour : l'emploi du temps vient d'être importé." : `Emploi du temps à jour (${r.result?.changed ?? 0} changement${(r.result?.changed ?? 0) > 1 ? 's' : ''})`));
$('#hpRemove').onclick = () => hpAction(() => sync.setHyperplanning(null), 'Lien Hyperplanning retiré, les cours importés sont masqués.');
$('#apiSave').onclick = async () => { await sync.setApiUrl($('#apiUrl').value); toast('Adresse du serveur enregistrée'); sync.sync(); };
$('#sync').onclick = () => { if (sync.isLoggedIn()) { sync.sync(); toast('Synchronisation lancée'); } else openSettings(); };

/* ---------- Événements globaux ---------- */
$('#prev').innerHTML = ic('left'); $('#nextBtn').innerHTML = ic('right'); $('#miniPrev').innerHTML = ic('left', 16); $('#miniNext').innerHTML = ic('right', 16);
$('#menuBtn').innerHTML = ic('menu'); $('#closeX').innerHTML = ic('x'); $('#setClose').innerHTML = ic('x'); $('#settingsBtn').innerHTML = ic('gear', 16);
$('#newIc').innerHTML = ic('plus', 18, 2.4); $('#fab').innerHTML = ic('plus', 26, 2.4); $('#alBell').innerHTML = ic('bell', 30, 2);
$('#prev').onclick = () => step(-1); $('#nextBtn').onclick = () => step(1); $('#todayBtn').onclick = goToday;
$('#seg').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) setView(b.dataset.v); };
$('#newBtn').onclick = () => openEditor(null); $('#fab').onclick = () => openEditor(null);
$('#miniPrev').onclick = () => { miniCursor = new Date(miniCursor.getFullYear(), miniCursor.getMonth() - 1, 1); renderMini(); };
$('#miniNext').onclick = () => { miniCursor = new Date(miniCursor.getFullYear(), miniCursor.getMonth() + 1, 1); renderMini(); };
$('#mini').onclick = (e) => { const b = e.target.closest('[data-mini]'); if (!b) return; cursor = fromKey(b.dataset.mini); if (view === 'month') view = 'week'; lastPeriod = ''; closeDrawer(); render(); };
$('#layers').onclick = (e) => { const b = e.target.closest('[data-layer]'); if (!b) return; const k = b.dataset.layer; if (hidden.has(k)) hidden.delete(k); else hidden.add(k); LS.set('hidden', [...hidden]); render(); };
$('#dl').onclick = (e) => {
  const d = e.target.closest('[data-done]');
  if (d) { const ev = sync.get(d.dataset.done); if (ev) { const b = { ...ev }; save({ ...ev, done: true }); toast(`« ${ev.title} » marqué comme rendu`, 'Annuler', () => save(b)); } return; }
  const o = e.target.closest('[data-oid]'); if (o) { const oc = findOcc(o.dataset.oid); if (oc) openEditor(oc.ev, null, oc.date); }
};
$('#next').onclick = () => { const id = $('#next').dataset.oid; if (!id) return; const oc = findOcc(id); if (oc) openEditor(oc.ev, null, oc.date); };
$('#soundSw').onclick = () => { muted = !muted; LS.set('muted', muted); $('#soundSw').setAttribute('aria-checked', !muted); if (!muted) chime(); };
$('#soundSw').setAttribute('aria-checked', !muted);
$('#clearDemo').onclick = () => { const demos = sync.list().filter((e) => e.demo); sync.clearDemo(); lastPeriod = ''; toast('Exemples effacés', 'Annuler', () => sync.seedDemo(demos)); };
const closeDrawer = () => $('#app').classList.remove('open');
$('#menuBtn').onclick = () => $('#app').classList.add('open'); $('#sideScrim').onclick = closeDrawer;
viewEl.addEventListener('click', (e) => {
  if (viewEl.dataset.kind === 'week') return;
  const g = e.target.closest('[data-goto]'); if (g) { cursor = fromKey(g.dataset.goto); setView('week'); return; }
  const c = e.target.closest('[data-oid]'); if (c) { const oc = findOcc(c.dataset.oid); if (oc) openEditor(oc.ev, null, oc.date); return; }
  const cell = e.target.closest('.cell'); if (cell && innerWidth < 760) { cursor = fromKey(cell.dataset.date); setView('week'); }
});
viewEl.addEventListener('dblclick', (e) => { const cell = e.target.closest('.cell'); if (cell && !e.target.closest('[data-oid],[data-goto]')) openEditor(null, { date: cell.dataset.date, s: 540, e: 600 }); });
viewEl.addEventListener('keydown', (e) => { if (e.key !== 'Enter' || viewEl.dataset.kind !== 'week') return; const c = e.target.closest('[data-oid]'); if (c) { const oc = findOcc(c.dataset.oid); if (oc) openEditor(oc.ev, null, oc.date); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#alarm').classList.contains('on')) { dismiss(); return; }
    if (editing) { closeEditor(); return; }
    if ($('#settings').classList.contains('on')) { closeSettings(); return; }
    closeDrawer(); return;
  }
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || editing || ringing || e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('#login').classList.contains('on') || $('#settings').classList.contains('on')) return;
  const k = e.key.toLowerCase();
  if (k === 'n') { e.preventDefault(); openEditor(null); }
  else if (k === 't') goToday();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (k === '1') setView('week'); else if (k === '2') setView('month'); else if (k === '3') setView('agenda');
  else if (e.key === '/') { e.preventDefault(); qi.focus(); }
});
let lastDays = daysCount();
addEventListener('resize', () => { const d = daysCount(); if (d !== lastDays) { lastDays = d; lastPeriod = ''; render(); } else posSeg(); });
addEventListener('hashchange', () => { const v = ({ semaine: 'week', mois: 'month', agenda: 'agenda' })[location.hash.slice(1)]; if (v && v !== view) { view = v; lastPeriod = ''; render(); } });
addEventListener('online', () => sync.sync());
addEventListener('focus', () => sync.sync({ refreshHp: true }));

/* ---------- Horloge ---------- */
let tickN = 0, lastDay = key(today0());
setInterval(() => {
  tickN++;
  if (tickN % 5 === 0) checkAlarms();
  if (tickN % 20 === 0) {
    if (key(today0()) !== lastDay) { lastDay = key(today0()); render(); return; }
    updateNow(); renderNext(); if (tickN % 60 === 0) renderDeadlines();
  }
}, 1000);

/* ---------- Démarrage ---------- */
applyTheme();
await sync.init();
booted = true;
if (!sync.isLoggedIn() && !sync.hasLocalData() && LS.get('skipLogin', false)) sync.seedDemo(makeDemo());
render();
if (document.fonts?.ready) document.fonts.ready.then(posSeg);
setTimeout(checkAlarms, 1500);
if (sync.isLoggedIn()) sync.start(30000);
else if (!LS.get('skipLogin', false)) openLogin();
