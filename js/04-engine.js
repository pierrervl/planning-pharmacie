/* Moteur de calcul du planning */
'use strict';

const PLANNING_REST = 0;
const PLANNING_PRESENT = 1;
const PLANNING_SPECIAL = 2;
const PLANNING_SPECIAL_RED = 3;

function isPlanningSpecialVal(val) {
  return val === PLANNING_SPECIAL || val === PLANNING_SPECIAL_RED;
}

/* Trouve l'affectation active pour un salarié à une date donnée -------- */
function activeAssignment(empName, dateIso) {
  const list = STATE.affectations[empName] || [];
  // on cherche l'affectation telle que start <= date <= end (ou end null)
  // si plusieurs, on prend la plus récente (start le plus grand)
  let best = null;
  for (const a of list) {
    if (a.start > dateIso) continue;
    if (a.end && a.end < dateIso) continue;
    if (!best || a.start > best.start) best = a;
  }
  return best;
}

/* Valeur d'une semaine-type du pattern (7 jours) ----------------------- */
function ensurePatternWeek(empName, pname, state = STATE) {
  if (!state.patterns[empName]) state.patterns[empName] = {};
  if (!state.patterns[empName][pname]) {
    state.patterns[empName][pname] = makeEmptyPattern();
  } else {
    state.patterns[empName][pname] = normalizePatternWeek(state.patterns[empName][pname], state);
  }
  return state.patterns[empName][pname];
}

function getPatternWeekValue(empName, pname, dayIdx, shift, state = STATE) {
  const pat = ensurePatternWeek(empName, pname, state);
  const cell = pat[dayIdx];
  if (!cell) return null;
  return cell[shift];
}

function setPatternWeekValue(empName, pname, dayIdx, shift, value) {
  const pat = ensurePatternWeek(empName, pname);
  pat[dayIdx][shift] = value;
  if (!isPlanningSpecialVal(value)) {
    clearPatternCellSlot(empName, pname, dayIdx, shift);
  }
}

const PATTERN_SHIFT_DEFAULT_SLOTS = {
  matin: { start: '08:00', end: '12:30' },
  aprem: { start: '14:00', end: '19:30' },
};

const PATTERN_SHIFT_DEFAULT_SLOTS_SATURDAY = {
  matin: { start: '08:30', end: '12:30' },
  aprem: { start: '14:00', end: '18:30' },
};

const PATTERN_SATURDAY_DAY_IDX = 5;

function padTimePart(n) {
  return String(n).padStart(2, '0');
}

function normalizeTimeInput(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase().replace(/\s/g, '');
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return `${padTimePart(h)}:${padTimePart(min)}`;
  }
  m = /^(\d{1,2})h(\d{2})?$/.exec(s);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return `${padTimePart(h)}:${padTimePart(min)}`;
  }
  return null;
}

function formatPatternTime(timeStr) {
  const t = normalizeTimeInput(timeStr);
  if (!t) return '';
  const [h, m] = t.split(':');
  const hn = parseInt(h, 10);
  return m === '00' ? `${hn}h` : `${hn}h${m}`;
}

function timeToMinutes(timeStr) {
  const t = normalizeTimeInput(timeStr);
  if (!t) return null;
  const [h, m] = t.split(':').map(x => parseInt(x, 10));
  return h * 60 + m;
}

function minutesToTime(mins) {
  if (!Number.isFinite(mins) || mins < 0 || mins >= 24 * 60) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${padTimePart(h)}:${padTimePart(m)}`;
}

function hoursBetweenTimes(start, end) {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a == null || b == null || b <= a) return null;
  const mins = b - a;
  if (mins > 12 * 60) return null;
  return Math.round(mins * 100 / 60) / 100;
}

function ensurePatternShiftDefaults(state = STATE) {
  if (!state.patternShiftDefaults) {
    state.patternShiftDefaults = JSON.parse(JSON.stringify(PATTERN_SHIFT_DEFAULT_SLOTS));
    return state.patternShiftDefaults;
  }
  const d = state.patternShiftDefaults;
  if (typeof d.matin === 'number' || typeof d.aprem === 'number') {
    state.patternShiftDefaults = JSON.parse(JSON.stringify(PATTERN_SHIFT_DEFAULT_SLOTS));
    return state.patternShiftDefaults;
  }
  for (const shift of ['matin', 'aprem']) {
    if (!d[shift] || typeof d[shift] !== 'object') {
      d[shift] = { ...PATTERN_SHIFT_DEFAULT_SLOTS[shift] };
    } else {
      d[shift] = {
        start: normalizeTimeInput(d[shift].start) || PATTERN_SHIFT_DEFAULT_SLOTS[shift].start,
        end: normalizeTimeInput(d[shift].end) || PATTERN_SHIFT_DEFAULT_SLOTS[shift].end,
      };
    }
  }
  return state.patternShiftDefaults;
}

function ensurePatternShiftDefaultsSaturday(state = STATE) {
  if (!state.patternShiftDefaultsSaturday) {
    state.patternShiftDefaultsSaturday = JSON.parse(JSON.stringify(PATTERN_SHIFT_DEFAULT_SLOTS_SATURDAY));
    return state.patternShiftDefaultsSaturday;
  }
  const d = state.patternShiftDefaultsSaturday;
  if (typeof d.matin === 'number' || typeof d.aprem === 'number') {
    state.patternShiftDefaultsSaturday = JSON.parse(JSON.stringify(PATTERN_SHIFT_DEFAULT_SLOTS_SATURDAY));
    return state.patternShiftDefaultsSaturday;
  }
  for (const shift of ['matin', 'aprem']) {
    if (!d[shift] || typeof d[shift] !== 'object') {
      d[shift] = { ...PATTERN_SHIFT_DEFAULT_SLOTS_SATURDAY[shift] };
    } else {
      d[shift] = {
        start: normalizeTimeInput(d[shift].start) || PATTERN_SHIFT_DEFAULT_SLOTS_SATURDAY[shift].start,
        end: normalizeTimeInput(d[shift].end) || PATTERN_SHIFT_DEFAULT_SLOTS_SATURDAY[shift].end,
      };
    }
  }
  return state.patternShiftDefaultsSaturday;
}

function isPatternSaturday(dayIdx) {
  return dayIdx === PATTERN_SATURDAY_DAY_IDX;
}

function patternCellStartKey(shift) {
  return shift === 'matin' ? 'matinStart' : 'apremStart';
}

function patternCellEndKey(shift) {
  return shift === 'matin' ? 'matinEnd' : 'apremEnd';
}

function getPatternShiftDefaultSlot(shift, state = STATE, dayIdx = null) {
  if (isPatternSaturday(dayIdx)) {
    const d = ensurePatternShiftDefaultsSaturday(state);
    return { ...d[shift] };
  }
  const d = ensurePatternShiftDefaults(state);
  return { ...d[shift] };
}

function getPatternCellSlot(empName, pname, dayIdx, shift, state = STATE) {
  const pat = ensurePatternWeek(empName, pname, state);
  const cell = pat[dayIdx] || {};
  const def = getPatternShiftDefaultSlot(shift, state, dayIdx);
  const start = normalizeTimeInput(cell[patternCellStartKey(shift)]) || def.start;
  const end = normalizeTimeInput(cell[patternCellEndKey(shift)]) || def.end;
  return { start, end };
}

function getPatternCellHours(empName, pname, dayIdx, shift, state = STATE) {
  const slot = getPatternCellSlot(empName, pname, dayIdx, shift, state);
  return hoursBetweenTimes(slot.start, slot.end);
}

function clearPatternCellSlot(empName, pname, dayIdx, shift, state = STATE) {
  const pat = ensurePatternWeek(empName, pname, state);
  pat[dayIdx][patternCellStartKey(shift)] = null;
  pat[dayIdx][patternCellEndKey(shift)] = null;
}

function setPatternCellSlot(empName, pname, dayIdx, shift, start, end, state = STATE) {
  const s = normalizeTimeInput(start);
  const e = normalizeTimeInput(end);
  if (!s || !e || hoursBetweenTimes(s, e) == null) return false;
  const pat = ensurePatternWeek(empName, pname, state);
  const def = getPatternShiftDefaultSlot(shift, state, dayIdx);
  const sKey = patternCellStartKey(shift);
  const eKey = patternCellEndKey(shift);
  if (s === def.start && e === def.end) {
    pat[dayIdx][sKey] = null;
    pat[dayIdx][eKey] = null;
  } else {
    pat[dayIdx][sKey] = s;
    pat[dayIdx][eKey] = e;
  }
  return true;
}

function setPatternShiftDefaultSlot(shift, start, end, state = STATE, { saturday = false } = {}) {
  const s = normalizeTimeInput(start);
  const e = normalizeTimeInput(end);
  if (!s || !e || hoursBetweenTimes(s, e) == null) return false;
  if (saturday) {
    ensurePatternShiftDefaultsSaturday(state);
    state.patternShiftDefaultsSaturday[shift] = { start: s, end: e };
  } else {
    ensurePatternShiftDefaults(state);
    state.patternShiftDefaults[shift] = { start: s, end: e };
  }
  return true;
}

function patternCellDisplayClass(val) {
  if (val === PLANNING_SPECIAL_RED) return 'plein special-red';
  if (val === PLANNING_SPECIAL) return 'plein special';
  if (val === PLANNING_PRESENT) return 'plein';
  if (val === PLANNING_REST) return 'vide rest';
  return 'vide empty';
}

/* Ancrage calendaire du cycle S1…S3' (semaine contenant patternAnchorDate) */
function getPatternAnchorMonday(state = STATE) {
  const anchor = (state && state.patternAnchorDate) || INITIAL_DATA.patternAnchorDate;
  return mondayOf(fromISO(anchor));
}

function getPatternWeekIndexForMonday(mondayDate, state = STATE) {
  const anchorMon = getPatternAnchorMonday(state);
  const weeks = Math.floor(diffDays(toISO(anchorMon), toISO(mondayDate)) / 7);
  const n = PATTERN_CYCLE_WEEKS.length;
  return ((weeks % n) + n) % n;
}

function getPatternWeekNameForMonday(mondayDate, state = STATE) {
  return PATTERN_CYCLE_WEEKS[getPatternWeekIndexForMonday(mondayDate, state)];
}

function getPatternWeekNameForDate(dateIso, state = STATE) {
  return getPatternWeekNameForMonday(mondayOf(fromISO(dateIso)), state);
}

function getPatternAnchorSummary(state = STATE) {
  const anchorMon = getPatternAnchorMonday(state);
  return {
    anchorIso: toISO(anchorMon),
    anchorLabel: frFormat(anchorMon),
    isoWeek: getISOWeek(anchorMon),
    isoYear: getISOWeekYear(anchorMon),
  };
}

function setPatternAnchorFromISOWeek(isoYear, isoWeek, patternName, state = STATE) {
  const idx = PATTERN_CYCLE_WEEKS.indexOf(patternName);
  if (idx < 0) return { ok: false, error: 'Semaine de cycle invalide.' };
  if (!Number.isFinite(isoYear) || !Number.isFinite(isoWeek) || isoWeek < 1 || isoWeek > 53) {
    return { ok: false, error: 'Année ou semaine ISO invalide.' };
  }
  const weekMon = mondayOfISOWeek(isoYear, isoWeek);
  const anchorMon = addDays(weekMon, -7 * idx);
  state.patternAnchorDate = toISO(anchorMon);
  return { ok: true, ...getPatternAnchorSummary(state), refPattern: patternName, refIsoWeek: isoWeek, refIsoYear: isoYear };
}

function describePatternAnchorForISOWeek(isoYear, isoWeek, patternName) {
  const idx = PATTERN_CYCLE_WEEKS.indexOf(patternName);
  if (idx < 0 || isoWeek < 1 || isoWeek > 53) return null;
  const weekMon = mondayOfISOWeek(isoYear, isoWeek);
  const anchorMon = addDays(weekMon, -7 * idx);
  return {
    anchorLabel: frFormat(anchorMon),
    anchorIsoWeek: getISOWeek(anchorMon),
    anchorIsoYear: getISOWeekYear(anchorMon),
    refPattern: patternName,
    refIsoWeek: isoWeek,
    refIsoYear: isoYear,
  };
}

/* Valeur du pattern pour une date — alignée sur le calendrier (ancrage S1) */
function patternValueForDate(empName, dateIso, shift, assignStart, patternName, state = STATE) {
  const dayIdx = weekDayIndex(fromISO(dateIso));
  const pname = getPatternWeekNameForDate(dateIso, state);
  return getPatternWeekValue(empName, pname, dayIdx, shift, state);
}

/* Lecture / écriture du planning réel (indépendant du pattern) ---------- */
function ensurePlanningDay(empName, dateIso, state = STATE) {
  if (!state.planning[empName]) state.planning[empName] = {};
  if (!state.planning[empName][dateIso]) {
    state.planning[empName][dateIso] = { matin: null, aprem: null };
  }
  return state.planning[empName][dateIso];
}

function getPlanningValue(empName, dateIso, shift) {
  const day = (STATE.planning[empName] || {})[dateIso];
  if (!day) return null;
  return day[shift];
}

function setPlanningValue(empName, dateIso, shift, value, state = STATE) {
  if (typeof canEditPlanning === 'function' && !canEditPlanning()) return false;
  if (isAfterEmployeeContractEnd(empName, dateIso, state)) return false;
  const day = ensurePlanningDay(empName, dateIso, state);
  day[shift] = value;
  if (!isPlanningSpecialVal(value)) {
    clearPlanningCellSlot(empName, dateIso, shift, state);
  }
  return true;
}

function copyPatternSlotToPlanning(empName, dateIso, shift, state = STATE) {
  const dayIdx = weekDayIndex(fromISO(dateIso));
  const pname = getPatternWeekNameForDate(dateIso, state);
  const pat = ensurePatternWeek(empName, pname, state);
  const cell = pat[dayIdx] || {};
  const day = ensurePlanningDay(empName, dateIso, state);
  day[patternCellStartKey(shift)] = cell[patternCellStartKey(shift)] || null;
  day[patternCellEndKey(shift)] = cell[patternCellEndKey(shift)] || null;
}

function getPlanningCellSlot(empName, dateIso, shift, state = STATE) {
  const day = (state.planning[empName] || {})[dateIso];
  const sKey = patternCellStartKey(shift);
  const eKey = patternCellEndKey(shift);
  const start = day ? normalizeTimeInput(day[sKey]) : null;
  const end = day ? normalizeTimeInput(day[eKey]) : null;
  if (start && end) return { start, end };

  const dayIdx = weekDayIndex(fromISO(dateIso));
  const pname = getPatternWeekNameForDate(dateIso, state);
  return getPatternCellSlot(empName, pname, dayIdx, shift, state);
}

function getPlanningCellHours(empName, dateIso, shift, state = STATE) {
  const slot = getPlanningCellSlot(empName, dateIso, shift, state);
  return hoursBetweenTimes(slot.start, slot.end);
}

function clearPlanningCellSlot(empName, dateIso, shift, state = STATE) {
  const day = ensurePlanningDay(empName, dateIso, state);
  day[patternCellStartKey(shift)] = null;
  day[patternCellEndKey(shift)] = null;
}

function setPlanningCellSlot(empName, dateIso, shift, start, end, state = STATE) {
  const s = normalizeTimeInput(start);
  const e = normalizeTimeInput(end);
  if (!s || !e || hoursBetweenTimes(s, e) == null) return false;
  const day = ensurePlanningDay(empName, dateIso, state);
  const dayIdx = weekDayIndex(fromISO(dateIso));
  const pname = getPatternWeekNameForDate(dateIso, state);
  const patSlot = getPatternCellSlot(empName, pname, dayIdx, shift, state);
  const sKey = patternCellStartKey(shift);
  const eKey = patternCellEndKey(shift);
  if (s === patSlot.start && e === patSlot.end) {
    day[sKey] = null;
    day[eKey] = null;
  } else {
    day[sKey] = s;
    day[eKey] = e;
  }
  return true;
}

/* Import pattern → planning pour une semaine calendaire ---------------- */
function weekHasPlanningData(weekMondayIso, employees, state = STATE) {
  const weekMon = fromISO(weekMondayIso);
  for (let i = 0; i < 7; i++) {
    const iso = toISO(addDays(weekMon, i));
    for (const emp of employees) {
      const day = (state.planning[emp] || {})[iso];
      if (!day) continue;
      if (day.matin !== null && day.matin !== undefined) return true;
      if (day.aprem !== null && day.aprem !== undefined) return true;
    }
  }
  return false;
}

function periodHasPlanningData(startIso, endIso, employees, state = STATE) {
  let d = fromISO(startIso);
  const last = fromISO(endIso);
  while (d <= last) {
    const iso = toISO(d);
    for (const emp of employees) {
      const day = (state.planning[emp] || {})[iso];
      if (!day) continue;
      if (day.matin !== null && day.matin !== undefined) return true;
      if (day.aprem !== null && day.aprem !== undefined) return true;
    }
    d = addDays(d, 1);
  }
  return false;
}

function importPatternPeriod(startIso, endIso, employees, mode /* 'overwrite' | 'fillEmpty' */, state = STATE) {
  let updated = 0;
  let skipped = 0;
  let d = fromISO(startIso);
  const last = fromISO(endIso);
  while (d <= last) {
    const iso = toISO(d);
    for (const emp of employees) {
      if (isAfterEmployeeContractEnd(emp, iso, state)) {
        skipped += 2;
        continue;
      }
      for (const shift of ['matin', 'aprem']) {
        const patVal = patternValueForDate(emp, iso, shift, null, null, state);
        const day = (state.planning[emp] || {})[iso];
        const cur = day ? day[shift] : null;
        if (mode === 'fillEmpty' && cur !== null) {
          skipped++;
          continue;
        }
        if (setPlanningValue(emp, iso, shift, patVal, state)) {
          copyPatternSlotToPlanning(emp, iso, shift, state);
          updated++;
        }
      }
    }
    d = addDays(d, 1);
  }
  return { updated, skipped, startIso, endIso, dayCount: diffDays(startIso, endIso) + 1 };
}

function importPatternWeek(weekMondayIso, employees, mode /* 'overwrite' | 'fillEmpty' */) {
  const weekMon = fromISO(weekMondayIso);
  const endIso = toISO(addDays(weekMon, 6));
  const r = importPatternPeriod(weekMondayIso, endIso, employees, mode);
  return {
    ...r,
    pname: getPatternWeekNameForMonday(weekMon),
    isoWeek: getISOWeek(weekMon)
  };
}

/* Copie un pattern sur une période dans le planning (snapshot) ---------- */
function applyPatternToPeriod(empName, startIso, endIso, patternName, state = STATE) {
  const end = endIso || INITIAL_DATA.planningEnd;
  let d = fromISO(startIso);
  const last = fromISO(end);
  while (d <= last) {
    const iso = toISO(d);
    if (!isAfterEmployeeContractEnd(empName, iso, state)) {
      const day = ensurePlanningDay(empName, iso, state);
      day.matin = patternValueForDate(empName, iso, 'matin', startIso, patternName, state);
      day.aprem = patternValueForDate(empName, iso, 'aprem', startIso, patternName, state);
      copyPatternSlotToPlanning(empName, iso, 'matin', state);
      copyPatternSlotToPlanning(empName, iso, 'aprem', state);
    }
    d = addDays(d, 1);
  }
}

function cyclePlanningValue(cur) {
  if (cur === null || cur === undefined) return PLANNING_PRESENT;
  if (cur === PLANNING_PRESENT) return PLANNING_REST;
  if (isPlanningSpecialVal(cur)) return PLANNING_REST;
  return PLANNING_PRESENT;
}

function nextPlanningValueOnRightClick(cur) {
  if (cur === PLANNING_SPECIAL) return PLANNING_SPECIAL_RED;
  if (cur === PLANNING_SPECIAL_RED) return PLANNING_PRESENT;
  return PLANNING_SPECIAL;
}

function nextPlanningValueOnLeftClick(cur, e) {
  if (e.ctrlKey || e.metaKey) return nextPlanningValueOnRightClick(cur);
  return cyclePlanningValue(cur);
}

function isPlanningPresent(val) {
  return val === PLANNING_PRESENT || isPlanningSpecialVal(val);
}

/* Trouve un congé qui couvre cette date pour ce salarié ----------------- */
function congeForDate(empName, dateIso) {
  for (const c of STATE.conges) {
    if (c.emp === empName && c.start <= dateIso && dateIso <= c.end) return c;
  }
  return null;
}

/* Remet à repos (0) les présences sur une période pour un salarié -------- */
function clearPresenceForPeriod(empName, startIso, endIso, state = STATE) {
  let cleared = 0;
  let d = fromISO(startIso);
  const last = fromISO(endIso);
  while (d <= last) {
    const iso = toISO(d);
    const day = (state.planning[empName] || {})[iso];
    if (day) {
      for (const shift of ['matin', 'aprem']) {
        if (isPlanningPresent(day[shift])) {
          day[shift] = PLANNING_REST;
          cleared++;
        }
      }
    }
    d = addDays(d, 1);
  }
  return cleared;
}

/* Retire les présences (plein / spéciale) strictement après une date ----- */
function clearPresenceAfterDate(empName, endIso, state = STATE) {
  if (!endIso || !state.planning[empName]) return 0;
  let cleared = 0;
  const planning = state.planning[empName];
  for (const iso of Object.keys(planning)) {
    if (iso <= endIso) continue;
    const day = planning[iso];
    for (const shift of ['matin', 'aprem']) {
      if (isPlanningPresent(day[shift])) {
        day[shift] = null;
        cleared++;
      }
    }
    if (day.matin == null && day.aprem == null) delete planning[iso];
  }
  return cleared;
}

function enforceEmployeeContractEnd(empName, state = STATE) {
  const end = getEmployeeContractEndDate(empName, state);
  if (!end) return { cleared: 0, endDate: '' };
  return { cleared: clearPresenceAfterDate(empName, end, state), endDate: end };
}

function enforceAllContractEnds(state = STATE) {
  let cleared = 0;
  for (const emp of state.employees || []) {
    cleared += enforceEmployeeContractEnd(emp, state).cleared;
  }
  return cleared;
}

/* CALCUL FINAL d'une cellule :
   plein (présent) ou vide ; repos / congés = couleur de fond si vide
   status sert aux filtres : 'work' | 'rest' | 'empty' | 'CP' | …
   --------------------------------------------------------------------- */
function computeCell(empName, dateIso, shift) {
  const fLbl = getFerieLabel(dateIso);
  const gLbl = getGardeLabel(dateIso);
  const val = getPlanningValue(empName, dateIso, shift);
  const full = isPlanningPresent(val);
  const special = val === PLANNING_SPECIAL;
  const specialRed = val === PLANNING_SPECIAL_RED;
  const cg = full ? null : congeForDate(empName, dateIso);

  let status = 'empty';
  if (full) {
    status = 'work';
  } else if (cg) {
    status = cg.type;
  } else if (val === PLANNING_REST) {
    status = 'rest';
  }

  return {
    full,
    special,
    specialRed,
    status,
    label: '',
    ferie: !!fLbl,
    ferieLabel: fLbl ? shortFerieLabel(fLbl) : null,
    garde: !!gLbl,
    gardeLabel: gLbl ? shortGardeLabel(gLbl) : null,
    raw: val
  };
}

/* Classes CSS d'affichage (plein ou vide + variante couleur) ---------- */
function cellDisplayClass(c) {
  if (c.full) {
    if (c.specialRed) return 'plein special-red';
    if (c.special) return 'plein special';
    return 'plein';
  }
  return 'vide ' + statusClass(c.status);
}

function cellStatusLabel(c) {
  if (c.specialRed) return 'Présence spéciale rouge';
  if (c.special) return 'Présence spéciale orange';
  if (c.full) return 'Présent';
  if (c.status === 'rest') return 'Repos';
  if (c.status === 'empty') return 'Non défini';
  return c.status;
}

/* Agrégation des heures travaillées ------------------------------------- */
const AVG_WEEKS_PER_MONTH = 365.25 / 12 / 7;

function shiftsForHoursFilter(state = STATE) {
  const f = state.ui.filterShift;
  if (f === 'matin') return ['matin'];
  if (f === 'aprem') return ['aprem'];
  return ['matin', 'aprem'];
}

function computePlanningShiftHours(empName, dateIso, shift, state = STATE) {
  if (isAfterEmployeeContractEnd(empName, dateIso)) return 0;
  const c = computeCell(empName, dateIso, shift);
  if (!c.full) return 0;
  const h = getPlanningCellHours(empName, dateIso, shift, state);
  return h != null ? h : 0;
}

function computePlanningHoursForPeriod(empName, startIso, endIso, state = STATE) {
  let total = 0;
  const shifts = shiftsForHoursFilter(state);
  let d = fromISO(startIso);
  const last = fromISO(endIso);
  while (d <= last) {
    const iso = toISO(d);
    for (const shift of shifts) {
      total += computePlanningShiftHours(empName, iso, shift, state);
    }
    d = addDays(d, 1);
  }
  return Math.round(total * 100) / 100;
}

function computePatternShiftHours(empName, pname, dayIdx, shift, state = STATE) {
  const v = getPatternWeekValue(empName, pname, dayIdx, shift, state);
  if (!isPlanningPresent(v)) return 0;
  const h = getPatternCellHours(empName, pname, dayIdx, shift, state);
  return h != null ? h : 0;
}

function computePatternWeekHours(empName, pname, state = STATE) {
  let total = 0;
  const shifts = shiftsForHoursFilter(state);
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    for (const shift of shifts) {
      total += computePatternShiftHours(empName, pname, dayIdx, shift, state);
    }
  }
  return Math.round(total * 100) / 100;
}

function computePlanningDayHours(empName, dateIso, state = STATE) {
  let total = 0;
  for (const shift of ['matin', 'aprem']) {
    total += computePlanningShiftHours(empName, dateIso, shift, state);
  }
  return Math.round(total * 100) / 100;
}

function buildPlanningDayObservations(empName, dateIso, state = STATE) {
  const parts = [];
  for (const shift of ['matin', 'aprem']) {
    const h = computePlanningShiftHours(empName, dateIso, shift, state);
    if (h <= 0) continue;
    const slot = getPlanningCellSlot(empName, dateIso, shift, state);
    parts.push(`${formatPatternTime(slot.start)}-${formatPatternTime(slot.end)}`);
  }
  return parts.join(' / ');
}

function compareWeekHoursToPattern(empName, weekMonday, state = STATE) {
  const pname = getPatternWeekNameForMonday(weekMonday, state);
  const expected = computePatternWeekHours(empName, pname, state);
  const weekStart = toISO(weekMonday);
  const weekEnd = toISO(addDays(weekMonday, 6));
  const actual = computePlanningHoursForPeriod(empName, weekStart, weekEnd, state);
  const match = Math.round(actual * 100) === Math.round(expected * 100);
  return { actual, expected, pname, match };
}

function weekHoursPatternMismatchTitle(empName, isoWeek, cmp) {
  if (cmp.match) {
    return `${empName} — semaine ${isoWeek} (${cmp.pname}) — ${formatContractHours(cmp.actual)} h — conforme au pattern (${formatContractHours(cmp.expected)} h)`;
  }
  const diff = Math.round((cmp.actual - cmp.expected) * 100) / 100;
  const diffSign = diff > 0 ? '+' : '';
  return `${empName} — semaine ${isoWeek} (${cmp.pname}) — réalisé : ${formatContractHours(cmp.actual)} h · pattern : ${formatContractHours(cmp.expected)} h (${diffSign}${formatContractHours(diff)} h)`;
}

function computePatternCycleHours(empName, state = STATE) {
  let total = 0;
  for (const pname of PATTERN_CYCLE_WEEKS) {
    total += computePatternWeekHours(empName, pname, state);
  }
  return Math.round(total * 100) / 100;
}

function computePatternMonthlyHours(empName, state = STATE) {
  const weeklyAvg = computePatternCycleHours(empName, state) / PATTERN_CYCLE_WEEKS.length;
  return Math.round(weeklyAvg * AVG_WEEKS_PER_MONTH * 100) / 100;
}

function computePatternWeekMonthlyProjection(empName, pname, state = STATE) {
  return Math.round(computePatternWeekHours(empName, pname, state) * AVG_WEEKS_PER_MONTH * 100) / 100;
}

/* Codes CSS pour les types ---------------------------------------------- */
function statusClass(status) {
  switch (status) {
    case 'work': return 'work';
    case 'rest': return 'rest';
    case 'empty': return 'empty';
    default:
      return congeTypeCssClassForLabel(status);
  }
}
