/* Moteur de calcul du planning */
'use strict';

const PLANNING_REST = 0;
const PLANNING_PRESENT = 1;
const PLANNING_SPECIAL = 2;

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
    state.patterns[empName][pname] = normalizePatternWeek(state.patterns[empName][pname]);
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
}

function patternCellDisplayClass(val) {
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

function setPlanningValue(empName, dateIso, shift, value) {
  const day = ensurePlanningDay(empName, dateIso);
  day[shift] = value;
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

function importPatternPeriod(startIso, endIso, employees, mode /* 'overwrite' | 'fillEmpty' */) {
  let updated = 0;
  let skipped = 0;
  let d = fromISO(startIso);
  const last = fromISO(endIso);
  while (d <= last) {
    const iso = toISO(d);
    for (const emp of employees) {
      for (const shift of ['matin', 'aprem']) {
        const patVal = patternValueForDate(emp, iso, shift);
        const cur = getPlanningValue(emp, iso, shift);
        if (mode === 'fillEmpty' && cur !== null) {
          skipped++;
          continue;
        }
        setPlanningValue(emp, iso, shift, patVal);
        updated++;
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
    const day = ensurePlanningDay(empName, iso, state);
    day.matin = patternValueForDate(empName, iso, 'matin', startIso, patternName, state);
    day.aprem = patternValueForDate(empName, iso, 'aprem', startIso, patternName, state);
    d = addDays(d, 1);
  }
}

function cyclePlanningValue(cur) {
  if (cur === null || cur === undefined) return PLANNING_PRESENT;
  if (cur === PLANNING_PRESENT) return PLANNING_REST;
  if (cur === PLANNING_SPECIAL) return PLANNING_REST;
  return PLANNING_PRESENT;
}

function toggleSpecialPlanningValue(cur) {
  return cur === PLANNING_SPECIAL ? PLANNING_PRESENT : PLANNING_SPECIAL;
}

function isPlanningPresent(val) {
  return val === PLANNING_PRESENT || val === PLANNING_SPECIAL;
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
        if (day[shift] === PLANNING_PRESENT || day[shift] === PLANNING_SPECIAL) {
          day[shift] = PLANNING_REST;
          cleared++;
        }
      }
    }
    d = addDays(d, 1);
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
  if (c.full) return c.special ? 'plein special' : 'plein';
  return 'vide ' + statusClass(c.status);
}

function cellStatusLabel(c) {
  if (c.special) return 'Présent spécial';
  if (c.full) return 'Présent';
  if (c.status === 'rest') return 'Repos';
  if (c.status === 'empty') return 'Non défini';
  return c.status;
}

/* Codes CSS pour les types ---------------------------------------------- */
function statusClass(status) {
  switch (status) {
    case 'work': return 'work';
    case 'rest': return 'rest';
    case 'empty': return 'empty';
    case 'CP': return 'cp';
    case 'RTT': return 'rtt';
    case 'Maladie': return 'mal';
    case 'Formation': return 'form';
    case 'Sans solde': return 'sso';
    case 'Récupération': return 'rec';
    default: return 'empty';
  }
}
