/* Journées de solidarité — éditions annuelles et heures de récupération */
'use strict';

const SOLIDARITE_LABEL = 'Journée de solidarité';
const SOLIDARITE_LABELS = 'Journées de solidarité';

function solidariteDefaultLabel(year) {
  return `${SOLIDARITE_LABEL} ${year}`;
}

function migrateSolidariteLabel(label) {
  return String(label || '')
    .replace(/^Pantecotes?\s/i, `${SOLIDARITE_LABEL} `);
}

function makePantecoteId() {
  return 'pt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizePantecote(raw) {
  if (!raw) return null;
  const year = parseInt(raw.year, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  const start = raw.start || null;
  const end = raw.end || raw.start || null;
  if (start && end && end < start) return null;
  const label = migrateSolidariteLabel(String(raw.label || solidariteDefaultLabel(year)).trim() || solidariteDefaultLabel(year));
  return {
    id: raw.id || makePantecoteId(),
    year,
    start,
    end: start ? end : null,
    label,
  };
}

function defaultPantecotes() {
  return [2025, 2026].map(year => normalizePantecote({
    id: `pt_default_${year}`,
    year,
    start: null,
    end: null,
    label: solidariteDefaultLabel(year),
  }));
}

function ensurePantecotes(state) {
  if (!state.pantecotes || !state.pantecotes.length) {
    state.pantecotes = defaultPantecotes();
  } else {
    state.pantecotes = state.pantecotes.map(normalizePantecote).filter(Boolean);
  }
  state.pantecotes.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  if (!state.pantecoteRecovery) state.pantecoteRecovery = {};
}

function getPantecotesSorted(state = STATE) {
  ensurePantecotes(state);
  return state.pantecotes;
}

function pantecoteHasDates(p) {
  return !!(p && p.start && p.end);
}

function pantecoteDateRange(p) {
  if (!pantecoteHasDates(p)) return [];
  const days = [];
  let d = fromISO(p.start);
  const last = fromISO(p.end);
  while (d <= last) {
    days.push(toISO(d));
    d = addDays(d, 1);
  }
  return days;
}

function parseHoursInput(raw) {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = parseFloat(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function getPantecoteRecovery(pantecoteId, emp, state = STATE) {
  ensurePantecotes(state);
  const bucket = state.pantecoteRecovery[pantecoteId] || {};
  const entry = bucket[emp] || {};
  return {
    work: Number.isFinite(entry.work) ? entry.work : 0,
    formation: Number.isFinite(entry.formation) ? entry.formation : 0,
    workedOverride: Number.isFinite(entry.workedOverride) ? entry.workedOverride : null,
  };
}

function setPantecoteRecovery(pantecoteId, emp, work, formation, state = STATE) {
  ensurePantecotes(state);
  if (!state.pantecoteRecovery[pantecoteId]) state.pantecoteRecovery[pantecoteId] = {};
  const entry = state.pantecoteRecovery[pantecoteId][emp] || {};
  const next = {
    work: work || 0,
    formation: formation || 0,
  };
  if (Object.prototype.hasOwnProperty.call(entry, 'workedOverride')) {
    next.workedOverride = entry.workedOverride;
  }
  state.pantecoteRecovery[pantecoteId][emp] = next;
}

function setPantecoteWorkedOverride(pantecoteId, emp, value, state = STATE) {
  ensurePantecotes(state);
  if (!state.pantecoteRecovery[pantecoteId]) state.pantecoteRecovery[pantecoteId] = {};
  if (!state.pantecoteRecovery[pantecoteId][emp]) {
    state.pantecoteRecovery[pantecoteId][emp] = { work: 0, formation: 0 };
  }
  const entry = state.pantecoteRecovery[pantecoteId][emp];
  if (value === null) delete entry.workedOverride;
  else entry.workedOverride = value;
}

function clearPantecoteWorkedOverride(pantecoteId, emp, state = STATE) {
  setPantecoteWorkedOverride(pantecoteId, emp, null, state);
}

function hasPantecoteWorkedOverride(pantecoteId, emp, state = STATE) {
  const bucket = (state.pantecoteRecovery || {})[pantecoteId] || {};
  const entry = bucket[emp];
  return !!(entry && Object.prototype.hasOwnProperty.call(entry, 'workedOverride')
    && Number.isFinite(entry.workedOverride));
}

function pantecoteRecoveryTotal(entry) {
  return Math.round(((entry.work || 0) + (entry.formation || 0)) * 100) / 100;
}

function computePantecoteHoursWorked(emp, pantecote, state = STATE) {
  if (!pantecoteHasDates(pantecote)) return null;
  let total = 0;
  const shifts = shiftsForHoursFilter(state);
  for (const iso of pantecoteDateRange(pantecote)) {
    for (const shift of shifts) {
      total += computePlanningShiftHours(emp, iso, shift, state);
    }
  }
  return Math.round(total * 100) / 100;
}

function getPantecoteHoursWorkedInfo(emp, pantecote, state = STATE) {
  const computed = computePantecoteHoursWorked(emp, pantecote, state);
  if (hasPantecoteWorkedOverride(pantecote.id, emp, state)) {
    const override = getPantecoteRecovery(pantecote.id, emp, state).workedOverride;
    return { hours: override, manual: true, computed };
  }
  return { hours: computed, manual: false, computed };
}

function getPantecoteHoursWorked(emp, pantecote, state = STATE) {
  return getPantecoteHoursWorkedInfo(emp, pantecote, state).hours;
}

function pantecoteRowTotals(emp, pantecotes, state = STATE) {
  let worked = 0;
  let recup = 0;
  let hasWorked = false;
  for (const p of pantecotes) {
    const w = getPantecoteHoursWorked(emp, p, state);
    if (w != null) {
      worked += w;
      hasWorked = true;
    }
    recup += pantecoteRecoveryTotal(getPantecoteRecovery(p.id, emp, state));
  }
  return {
    worked: hasWorked ? Math.round(worked * 100) / 100 : null,
    recup: Math.round(recup * 100) / 100,
  };
}

function pantecoteRecupIsShort(recup, worked) {
  if (worked == null || worked <= 0) return false;
  return recup < worked;
}

function pantecoteRowTotalTitle(emp, totals) {
  if (totals.worked == null || totals.worked <= 0) {
    return `${emp} — ${formatContractHours(totals.recup)} h récupérées`;
  }
  if (pantecoteRecupIsShort(totals.recup, totals.worked)) {
    const missing = Math.round((totals.worked - totals.recup) * 100) / 100;
    return `${emp} — récupération insuffisante : ${formatContractHours(totals.recup)} h / ${formatContractHours(totals.worked)} h travaillées (manque ${formatContractHours(missing)} h)`;
  }
  return `${emp} — récupération OK : ${formatContractHours(totals.recup)} h / ${formatContractHours(totals.worked)} h travaillées`;
}

function addPantecote(year, startIso, endIso, label, state = STATE) {
  const y = parseInt(year, 10);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) {
    return { ok: false, error: 'Année invalide.' };
  }
  if (state.pantecotes.some(p => p.year === y)) {
    return { ok: false, error: `Une ${SOLIDARITE_LABEL.toLowerCase()} ${y} existe déjà.` };
  }
  const entry = normalizePantecote({
    id: makePantecoteId(),
    year: y,
    start: startIso || null,
    end: endIso || startIso || null,
    label: label || solidariteDefaultLabel(y),
  });
  if (!entry) return { ok: false, error: 'Édition invalide.' };
  state.pantecotes.push(entry);
  state.pantecotes.sort((a, b) => a.year - b.year);
  return { ok: true, entry };
}

function updatePantecote(id, { start, end, label }, state = STATE) {
  const p = (state.pantecotes || []).find(x => x.id === id);
  if (!p) return { ok: false, error: 'Édition introuvable.' };
  if (start !== undefined) p.start = start || null;
  if (end !== undefined) p.end = end || p.start || null;
  if (label !== undefined) p.label = migrateSolidariteLabel(String(label || solidariteDefaultLabel(p.year)).trim() || solidariteDefaultLabel(p.year));
  if (p.start && p.end && p.end < p.start) {
    return { ok: false, error: 'La date de fin doit être postérieure ou égale au début.' };
  }
  if (!p.start) p.end = null;
  return { ok: true, entry: p };
}

function removePantecote(id, state = STATE) {
  const before = (state.pantecotes || []).length;
  state.pantecotes = (state.pantecotes || []).filter(p => p.id !== id);
  if (state.pantecoteRecovery) delete state.pantecoteRecovery[id];
  return state.pantecotes.length < before;
}

function cleanupPantecoteRecovery(state = STATE) {
  ensurePantecotes(state);
  const validIds = new Set(state.pantecotes.map(p => p.id));
  for (const id of Object.keys(state.pantecoteRecovery || {})) {
    if (!validIds.has(id)) delete state.pantecoteRecovery[id];
  }
  for (const id of validIds) {
    const bucket = state.pantecoteRecovery[id] || {};
    for (const emp of Object.keys(bucket)) {
      if (!(state.employees || []).includes(emp)) delete bucket[emp];
    }
  }
}
