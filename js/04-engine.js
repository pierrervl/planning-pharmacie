/* Moteur de calcul du planning */
'use strict';

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
  if (val === 1) return 'plein';
  if (val === 0) return 'vide rest';
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

/* Cycle clic : non défini → présent → repos → présent ---------------- */
function cyclePlanningValue(cur) {
  if (cur === null || cur === undefined) return 1;
  return cur === 1 ? 0 : 1;
}

/* Trouve un congé qui couvre cette date pour ce salarié ----------------- */
function congeForDate(empName, dateIso) {
  for (const c of STATE.conges) {
    if (c.emp === empName && c.start <= dateIso && dateIso <= c.end) return c;
  }
  return null;
}

/* CALCUL FINAL d'une cellule :
   plein (présent) ou vide ; repos / congés = couleur de fond si vide
   status sert aux filtres : 'work' | 'rest' | 'empty' | 'CP' | …
   --------------------------------------------------------------------- */
function computeCell(empName, dateIso, shift) {
  const fLbl = getFerieLabel(dateIso);
  const val = getPlanningValue(empName, dateIso, shift);
  const full = val === 1;
  const cg = full ? null : congeForDate(empName, dateIso);

  let status = 'empty';
  if (full) {
    status = 'work';
  } else if (cg) {
    status = cg.type;
  } else if (val === 0) {
    status = 'rest';
  }

  return {
    full,
    status,
    label: '',
    ferie: !!fLbl,
    ferieLabel: fLbl ? shortFerieLabel(fLbl) : null,
    raw: val
  };
}

/* Classes CSS d'affichage (plein ou vide + variante couleur) ---------- */
function cellDisplayClass(c) {
  if (c.full) return 'plein';
  return 'vide ' + statusClass(c.status);
}

function cellStatusLabel(c) {
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
