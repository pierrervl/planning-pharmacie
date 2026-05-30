/* Jours de garde de la pharmacie (périodes ou jours isolés) */
'use strict';

function makeGardeId() {
  return 'gd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizeGarde(raw) {
  if (!raw) return null;
  const start = raw.start || raw.date;
  if (!start) return null;
  let end = raw.end || raw.date || start;
  if (end < start) end = start;
  const label = String(raw.label || 'Garde').trim() || 'Garde';
  return {
    id: raw.id || makeGardeId(),
    start,
    end,
    label,
  };
}

function ensureGardes(state) {
  if (!state.gardes) state.gardes = [];
  state.gardes = state.gardes.map(normalizeGarde).filter(Boolean);
  state.gardes.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function periodOverlapsYear(startIso, endIso, year) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return startIso <= yearEnd && endIso >= yearStart;
}

function gardePeriodDayCount(g) {
  return diffDays(g.start, g.end) + 1;
}

function gardesOnDate(dateIso, state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { gardes: [] };
  return (state.gardes || []).filter(g => g.start <= dateIso && dateIso <= g.end);
}

/* Renvoie le libellé du jour de garde ou null --------------------------- */
function getGardeLabel(dateIso, state) {
  const matches = gardesOnDate(dateIso, state);
  if (!matches.length) return null;
  return matches[0].label || 'Garde';
}

/* Version courte pour affichage en en-tête de colonne ------------------- */
function shortGardeLabel(label) {
  if (!label || label === 'Garde') return 'Garde';
  return label.length > 10 ? label.slice(0, 9) + '…' : label;
}

/* Périodes de garde chevauchant une année ------------------------------- */
function collectGardesForYear(year, state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { gardes: [] };
  return (state.gardes || [])
    .filter(g => periodOverlapsYear(g.start, g.end, year))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function addGardePeriod(startIso, endIso, label, state) {
  if (!state) state = STATE;
  if (!startIso || !endIso) return { ok: false, error: 'Dates requises.' };
  if (endIso < startIso) return { ok: false, error: 'La date de fin doit être postérieure ou égale au début.' };
  const entry = normalizeGarde({
    id: makeGardeId(),
    start: startIso,
    end: endIso,
    label: label || 'Garde',
  });
  if (!entry) return { ok: false, error: 'Période invalide.' };
  if (!state.gardes) state.gardes = [];
  const overlaps = state.gardes.filter(g => g.start <= entry.end && entry.start <= g.end);
  state.gardes.push(entry);
  state.gardes.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return { ok: true, entry, overlaps: overlaps.length, days: gardePeriodDayCount(entry) };
}

function removeGarde(id, state) {
  if (!state) state = STATE;
  const before = (state.gardes || []).length;
  state.gardes = (state.gardes || []).filter(g => g.id !== id);
  return state.gardes.length < before;
}
