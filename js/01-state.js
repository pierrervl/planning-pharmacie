/* État global, localStorage, données initiales */
'use strict';

/* ===========================================================================
   PLANNING PERSONNEL — application autonome
   ===========================================================================
   Architecture :
     - STATE = objet global persistant (localStorage)
     - DONNEES INITIALES = chargées si aucune sauvegarde
     - UTILITAIRES DATES = ISO week, formats, parsing
     - MOTEUR = computeCell(empName, date, shift) → statut du jour
     - RENDU = renderXxx() par vue + render() = dispatcher
   ========================================================================= */

/* ===========================================================================
   1. ÉTAT GLOBAL ET DONNÉES INITIALES
   ========================================================================= */

const STORAGE_KEY = 'planning_personnel_v3';
const ACTIVE_PHARMACY_STORAGE_KEY = 'planning_active_pharmacy_id';

function getStorageKey(pharmacyId) {
  if (pharmacyId) return `${STORAGE_KEY}_${pharmacyId}`;
  return STORAGE_KEY;
}

function getActivePharmacyIdFromStorage() {
  try {
    return localStorage.getItem(ACTIVE_PHARMACY_STORAGE_KEY) || null;
  } catch (_e) {
    return null;
  }
}

function setActivePharmacyIdInStorage(pharmacyId) {
  try {
    if (pharmacyId) localStorage.setItem(ACTIVE_PHARMACY_STORAGE_KEY, pharmacyId);
    else localStorage.removeItem(ACTIVE_PHARMACY_STORAGE_KEY);
  } catch (_e) { /* ignore */ }
}

function switchPharmacyState(pharmacyId) {
  const currentId = typeof getCurrentPharmacyId === 'function' ? getCurrentPharmacyId() : null;
  if (currentId && currentId !== pharmacyId) {
    saveState(currentId);
  }
  STATE = loadState(pharmacyId);
  if (typeof persistAndRender === 'function') persistAndRender();
  else if (typeof render === 'function') render();
}

/* Cycle de pattern configurable (1 à 10 semaines) */
const LEGACY_PATTERN_CYCLE_WEEKS = ['S1', 'S2', 'S3', "S1'", "S2'", "S3'"];
const DEFAULT_PATTERN_CYCLE_WEEKS = 6;
const PATTERN_CYCLE_WEEKS_MIN = 1;
const PATTERN_CYCLE_WEEKS_MAX = 10;

function getPatternCycleWeekCount(state = STATE) {
  const n = state?.patternCycleWeeks;
  if (Number.isFinite(n) && n >= PATTERN_CYCLE_WEEKS_MIN && n <= PATTERN_CYCLE_WEEKS_MAX) {
    return Math.round(n);
  }
  return DEFAULT_PATTERN_CYCLE_WEEKS;
}

function getPatternCycleWeeks(state = STATE) {
  const n = getPatternCycleWeekCount(state);
  if (n === DEFAULT_PATTERN_CYCLE_WEEKS) return LEGACY_PATTERN_CYCLE_WEEKS.slice();
  const out = [];
  for (let i = 1; i <= n; i++) out.push(`S${i}`);
  return out;
}

function getPatternCycleDays(state = STATE) {
  return getPatternCycleWeekCount(state) * 7;
}

function getPatternCycleWeeksLabel(state = STATE) {
  return getPatternCycleWeeks(state).join(' → ');
}

function ensurePatternWeeksForEmployee(empName, state = STATE) {
  if (!state.patterns[empName]) state.patterns[empName] = {};
  for (const pname of getPatternCycleWeeks(state)) {
    if (!state.patterns[empName][pname]) {
      state.patterns[empName][pname] = makeEmptyPattern();
    } else {
      state.patterns[empName][pname] = normalizePatternWeek(state.patterns[empName][pname], state);
    }
  }
}

function setPatternCycleWeekCount(n, state = STATE) {
  state.patternCycleWeeks = Math.max(
    PATTERN_CYCLE_WEEKS_MIN,
    Math.min(PATTERN_CYCLE_WEEKS_MAX, Math.round(Number(n) || DEFAULT_PATTERN_CYCLE_WEEKS))
  );
  for (const emp of state.employees || []) {
    ensurePatternWeeksForEmployee(emp, state);
  }
}

/* Données initiales extraites de l'Excel d'origine ------------------------ */
const INITIAL_DATA = {
  employees: [
    "Patricia","Claire","Stéphanie","Audrey","Magali",
    "Marine phien","Vanessa","Chloe","Enora","Solène"
  ],
  /* Patterns par salarié — extraits du JSON fourni.
     Les jours absents (Di) restent null = pas de shift.            */
  rawPatterns: {
    "Patricia": {
      "S1":  [[1,1],[1,1],[1,1],[0,0],[1,1],[0,0],[null,null]],
      "S2":  [[1,1],[1,1],[1,1],[0,0],[1,1],[1,0],[null,null]],
      "S3":  [[1,1],[1,1],[1,1],[0,0],[1,1],[0,0],[null,null]],
      "S1'": [[1,1],[1,1],[1,1],[0,0],[1,1],[1,0],[null,null]],
      "S2'": [[1,1],[1,1],[1,1],[0,0],[1,1],[0,0],[null,null]],
      "S3'": [[1,1],[1,1],[1,1],[0,0],[1,1],[1,0],[null,null]],
    },
    "Claire": {
      "S1":  [[1,1],[0,0],[0,0],[1,1],[1,1],[1,0],[null,null]],
      "S2":  [[1,1],[0,0],[0,0],[1,1],[1,1],[0,0],[null,null]],
      "S3":  [[1,1],[0,0],[0,0],[1,1],[1,1],[1,0],[null,null]],
      "S1'": [[1,1],[0,0],[0,0],[1,1],[1,1],[0,0],[null,null]],
      "S2'": [[1,1],[0,0],[0,0],[1,1],[1,1],[1,0],[null,null]],
      "S3'": [[1,0],[0,0],[0,0],[1,1],[1,1],[0,0],[null,null]],
    },
    "Stéphanie": {
      "S1":  [[1,1],[1,1],[1,1],[1,1],[0,0],[0,0],[null,null]],
      "S2":  [[1,1],[1,1],[1,1],[1,0],[0,0],[1,0],[null,null]],
      "S3":  [[1,1],[1,1],[1,1],[1,0],[0,0],[1,0],[null,null]],
      "S1'": [[1,1],[1,1],[1,1],[1,1],[0,0],[0,0],[null,null]],
      "S2'": [[1,1],[1,1],[1,1],[1,0],[0,0],[1,0],[null,null]],
      "S3'": [[1,1],[1,1],[1,1],[1,0],[0,0],[1,0],[null,null]],
    },
    "Audrey": {
      "S1":  [[0,0],[1,1],[1,1],[1,1],[1,1],[1,0],[null,null]],
      "S2":  [[0,0],[1,1],[1,1],[1,1],[1,1],[0,0],[null,null]],
      "S3":  [[0,0],[1,1],[1,1],[1,1],[1,1],[1,0],[null,null]],
      "S1'": [[0,0],[1,1],[1,1],[1,1],[1,1],[1,0],[null,null]],
      "S2'": [[0,0],[1,1],[1,1],[1,1],[1,1],[0,0],[null,null]],
      "S3'": [[0,0],[1,1],[1,1],[1,1],[1,1],[1,0],[null,null]],
    },
    "Magali": {
      "S1":  [[1,1],[1,1],[0,0],[1,0],[1,1],[1,0],[null,null]],
      "S2":  [[1,0],[1,1],[0,0],[1,1],[1,1],[1,0],[null,null]],
      "S3":  [[1,1],[1,1],[0,0],[1,1],[1,1],[0,0],[null,null]],
      "S1'": [[1,1],[1,1],[0,0],[1,0],[1,1],[1,0],[null,null]],
      "S2'": [[1,0],[1,1],[0,0],[1,1],[1,1],[1,0],[null,null]],
      "S3'": [[1,1],[1,1],[0,0],[1,1],[1,1],[0,0],[null,null]],
    }
  },
  planningStart: "2025-09-01",
  planningEnd:   "2027-05-20",
  /* Lundi de la semaine S1 = semaine ISO 20 de 2026 (S3 en sem. 22) */
  patternAnchorDate: "2026-05-11"
};

/* Génère une semaine-type de pattern (7 jours, lun→dim) ----------------- */
function makeEmptyPattern() {
  const arr = [];
  for (let i = 0; i < 7; i++) {
    arr.push({ matin: 0, aprem: 0, matinStart: null, matinEnd: null, apremStart: null, apremEnd: null });
  }
  return arr;
}

/* Convertit raw [[m,a],…] (7 jours) en semaine pattern ------------------ */
function rawToPatternWeek(raw7) {
  return raw7.map(([m, a]) => ({
    matin: (m === null ? null : m),
    aprem: (a === null ? null : a)
  }));
}

/* Réduit un ancien pattern 14 jours → 7 jours ------------------------- */
function normalizePatternWeek(pat, state) {
  if (!pat || !pat.length) return makeEmptyPattern();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const cell = pat[i] || { matin: 0, aprem: 0 };
    let matinStart = normalizeTimeInput(cell.matinStart);
    let matinEnd = normalizeTimeInput(cell.matinEnd);
    let apremStart = normalizeTimeInput(cell.apremStart);
    let apremEnd = normalizeTimeInput(cell.apremEnd);

    if (state && cell.matinH != null && Number.isFinite(cell.matinH) && !matinStart && !matinEnd) {
      const def = getPatternShiftDefaultSlot('matin', state, i);
      matinStart = def.start;
      matinEnd = minutesToTime(timeToMinutes(def.start) + Math.round(cell.matinH * 60));
      if (!matinEnd || hoursBetweenTimes(matinStart, matinEnd) == null) {
        matinStart = null;
        matinEnd = null;
      }
    }
    if (state && cell.apremH != null && Number.isFinite(cell.apremH) && !apremStart && !apremEnd) {
      const def = getPatternShiftDefaultSlot('aprem', state, i);
      apremStart = def.start;
      apremEnd = minutesToTime(timeToMinutes(def.start) + Math.round(cell.apremH * 60));
      if (!apremEnd || hoursBetweenTimes(apremStart, apremEnd) == null) {
        apremStart = null;
        apremEnd = null;
      }
    }

    out.push({ matin: cell.matin, aprem: cell.aprem, matinStart, matinEnd, apremStart, apremEnd });
  }
  return out;
}

/* Construit l'état par défaut (vierge — sans employés, patterns ni planning) */
function buildDefaultState() {
  const anchorMonday = toISO(mondayOf(fromISO(todayISO())));
  const state = {
    employees: [],
    patterns: {},
    affectations: {},
    planning: {},
    patternAnchorDate: anchorMonday,
    patternCycleWeeks: DEFAULT_PATTERN_CYCLE_WEEKS,
    patternShiftDefaults: {
      matin: { start: '08:00', end: '12:30' },
      aprem: { start: '14:00', end: '19:30' },
    },
    patternShiftDefaultsSaturday: {
      matin: { start: '08:30', end: '12:30' },
      aprem: { start: '14:00', end: '18:30' },
    },
    planningChangeRequests: [],
    /* congés : [{ id, emp, start, end, type, comment }]                */
    conges: [],
    /* modes de congés : [{ id, label, themeId }] */
    congeTypeCatalog: [],
    /* fériés personnalisés ajoutés/retirés                              */
    feriesAdd:    [],  // dates ISO ajoutées
    feriesRemove: [],  // dates ISO retirées du calcul auto
    /* jours de garde pharmacie : [{ id, start, end, label }]            */
    gardes:       [],
    /* journées de solidarité : [{ id, year, start, end, label }]            */
    pantecotes:   [],
    /* heures récupérées : { pantecoteId: { emp: { work, formation } } } */
    pantecoteRecovery: {},
    /* type par salarié : Pharmacien/Préparateur × étudiant/salarié */
    employeeTypes: {},
    /* catalogue des types : [{ id, label, group, bg, border }] */
    employeeTypeCatalog: [],
    /* legacy — migré vers employeeTypeCatalog */
    employeeTypeColors: {},
    /* coordonnées et infos personnelles : { empName: { phone, email, … } } */
    employeeInfo: {},
    /* jours travaillés pour contrats : { empName: [{ id, date, hours, note }] } */
    contractDays: {},
    contractDescriptions: {},
    /* semaines CDI (demi-journées) : { empName: [{ id, label, days: [{matin, aprem}×7] }] } */
    cdiWeeks: {},
    cdiDescriptions: {},
    pharmacyInfo: {},
    employerInfo: {},
    /* préférences UI                                                    */
    ui: {
      currentTab:     'help',
      currentDate:    todayISO(),
      monthEmp:       null,
      yearEmp:        null,
      employeeView:   null,
      employeePeriodStart: toISO(new Date(new Date().getFullYear(), 0, 1, 12)),
      employeePeriodEnd:   todayISO(),
      employeeChartEmps:   [],
      yearShown:      new Date().getFullYear(),
      filtersEmp:     [],
      filterShift:   'both',
      filterTypes:   ['work','rest','empty','CP','RTT','Maladie','Formation','Sans solde','Récupération'],
      patternLayout: 'unified', /* 'unified' | 'split' */
      weekPrintStart: null,
      weekPrintEnd: null,
      weekCellDisplay: 'cross', /* 'cross' | 'hours' */
    }
  };

  ensureEmployeeTypeCatalog(state);
  ensureEmployeeTypes(state);
  ensureEmployeeTypeColors(state);
  ensureCongeTypeCatalog(state);
  ensureEmployeeInfo(state);
  ensureContractDays(state);
  ensureContractDescriptions(state);
  ensureCdiWeeks(state);
  ensureCdiDescriptions(state);
  ensureContractPartyInfo(state);
  ensurePantecotes(state);
  cleanupPantecoteRecovery(state);
  return state;
}

/* État global, chargé depuis le localStorage si présent ----------------- */
let STATE = loadState();

function loadState(pharmacyId) {
  try {
    const key = getStorageKey(pharmacyId);
    let raw = localStorage.getItem(key);
    if (!raw && !pharmacyId) raw = localStorage.getItem(STORAGE_KEY);
    if (!raw && pharmacyId) raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = localStorage.getItem('planning_personnel_v2');
    if (!raw) raw = localStorage.getItem('planning_personnel_v1');
    if (raw) {
      const state = JSON.parse(raw);
      migrateState(state);
      return state;
    }
  } catch (e) {
    console.warn('Échec lecture localStorage, état par défaut chargé.', e);
  }
  return buildDefaultState();
}

/* Assure la compatibilité des anciennes sauvegardes --------------------- */
function migrateState(state) {
  if (!state.planning) state.planning = {};
  if (!state.conges) state.conges = [];
  if (!state.feriesAdd) state.feriesAdd = [];
  if (!state.feriesRemove) state.feriesRemove = [];
  if (!state.ui) state.ui = {};
  if (!state.ui.filtersEmp) state.ui.filtersEmp = (state.employees || []).slice();
  if (!state.ui.filterShift) state.ui.filterShift = 'both';
  if (!state.ui.currentDate) state.ui.currentDate = todayISO();
  if (!state.ui.currentTab) state.ui.currentTab = 'week';
  if (!state.ui.patternLayout) state.ui.patternLayout = 'unified';
  if (!state.ui.filterTypes) {
    state.ui.filterTypes = ['work', 'rest', 'empty'];
  } else if (!state.ui.filterTypes.includes('empty')) {
    state.ui.filterTypes.push('empty');
  }
  if (!state.ui.employeePeriodStart) {
    state.ui.employeePeriodStart = toISO(new Date(new Date().getFullYear(), 0, 1, 12));
  }
  if (!state.ui.employeePeriodEnd) {
    state.ui.employeePeriodEnd = todayISO();
  }
  const curMon = mondayOf(fromISO(state.ui.currentDate || todayISO()));
  if (!state.ui.weekPrintStart) {
    state.ui.weekPrintStart = toISO(curMon);
  }
  if (!state.ui.weekPrintEnd) {
    state.ui.weekPrintEnd = toISO(addDays(curMon, (1 + 2) * 7 - 1)); /* 3 semaines */
  }
  if (!state.ui.weekCellDisplay || !['cross', 'hours'].includes(state.ui.weekCellDisplay)) {
    state.ui.weekCellDisplay = 'cross';
  }
  if (state.ui.currentTab === 'employee') state.ui.currentTab = 'emp-detail';
  if (!state.ui.employeeChartEmps) {
    state.ui.employeeChartEmps = (state.employees || []).slice();
  }
  state.ui.employeeChartEmps = state.ui.employeeChartEmps.filter(e =>
    (state.employees || []).includes(e)
  );
  if (!state.patternAnchorDate || state.patternAnchorDate === '2026-04-21') {
    state.patternAnchorDate = toISO(mondayOf(fromISO(todayISO())));
  }
  ensurePatternShiftDefaults(state);
  ensurePatternShiftDefaultsSaturday(state);

  if (!state.planningChangeRequests) state.planningChangeRequests = [];

  if (!state.gardes) state.gardes = [];
  ensureGardes(state);
  if (!state.pantecotes) state.pantecotes = [];
  if (!state.pantecoteRecovery) state.pantecoteRecovery = {};
  ensurePantecotes(state);
  cleanupPantecoteRecovery(state);
  if (!state.congeTypeCatalog) state.congeTypeCatalog = [];
  ensureCongeTypeCatalog(state);
  applyCongeTypeColorStyles(state);
  if (!state.employeeTypes) state.employeeTypes = {};
  ensureEmployeeTypes(state);
  ensureEmployeeTypeCatalog(state);
  ensureEmployeeTypeColors(state);
  applyEmployeeTypeColorStyles(state);

  if (!state.employeeInfo) state.employeeInfo = {};
  ensureEmployeeInfo(state);
  enforceAllContractEnds(state);

  if (!state.contractDays) state.contractDays = {};
  ensureContractDays(state);
  if (!state.contractDescriptions) state.contractDescriptions = {};
  ensureContractDescriptions(state);
  if (!state.cdiWeeks) state.cdiWeeks = {};
  ensureCdiWeeks(state);
  if (!state.cdiDescriptions) state.cdiDescriptions = {};
  ensureCdiDescriptions(state);
  ensureContractPartyInfo(state);

  if (!state.ui.contractEmp && (state.employees || []).length) {
    state.ui.contractEmp = state.employees[0];
  }
  if (!state.ui.cdiEmp && (state.employees || []).length) {
    state.ui.cdiEmp = state.employees[0];
  }
  if (!state.ui.cdiDocTitle) {
    state.ui.cdiDocTitle = 'Planning CDI — demi-journées travaillées';
  }
  if (!state.ui.contractDocTitle) {
    state.ui.contractDocTitle = 'Contrat de travail — planning des journées';
  }
  if (state.ui.contractPharmacyName == null) state.ui.contractPharmacyName = '';
  if (!state.ui.employeeDetailsOpen) state.ui.employeeDetailsOpen = [];

  if (!state.patternCycleWeeks) state.patternCycleWeeks = DEFAULT_PATTERN_CYCLE_WEEKS;
  else setPatternCycleWeekCount(state.patternCycleWeeks, state);

  if (!state.affectations) state.affectations = {};
  for (const emp of (state.employees || [])) {
    if (!state.planning[emp]) state.planning[emp] = {};
    if (!state.affectations[emp]) state.affectations[emp] = [];
    ensurePatternWeeksForEmployee(emp, state);
  }
  // si planning vide mais affectations existent : génère depuis les patterns
  const needsSeed = (state.employees || []).some(emp => {
    const p = state.planning[emp] || {};
    return Object.keys(p).length === 0 && (state.affectations[emp] || []).length > 0;
  });
  if (needsSeed) {
    for (const emp of state.employees) {
      for (const a of (state.affectations[emp] || [])) {
        applyPatternToPeriod(emp, a.start, a.end, a.pattern, state);
      }
    }
  }
}

function saveState(pharmacyId) {
  try {
    const id = pharmacyId || (typeof getCurrentPharmacyId === 'function' ? getCurrentPharmacyId() : null);
    localStorage.setItem(getStorageKey(id), JSON.stringify(STATE));
  } catch (e) {
    console.error('Échec sauvegarde localStorage', e);
    toast('⚠ Sauvegarde locale impossible (quota ?)', true);
  }
}

/* Gestion des salariés --------------------------------------------------- */
function normalizeEmployeeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function validateEmployeeName(name, { exclude } = {}) {
  const n = normalizeEmployeeName(name);
  if (!n) return 'Le nom ne peut pas être vide.';
  if (n.length < 2) return 'Le nom doit comporter au moins 2 caractères.';
  if (STATE.employees.some(e => e !== exclude && e === n)) {
    return `Un salarié nommé « ${n} » existe déjà.`;
  }
  return null;
}

function moveEmployeeDataKey(store, oldName, newName) {
  if (oldName === newName) return;
  if (!(oldName in store)) return;
  store[newName] = store[oldName];
  delete store[oldName];
}

function replaceEmployeeInUiArrays(oldName, newName) {
  const map = (e) => (e === oldName ? newName : e);
  if (STATE.ui.filtersEmp) STATE.ui.filtersEmp = STATE.ui.filtersEmp.map(map);
  if (STATE.ui.employeeChartEmps) STATE.ui.employeeChartEmps = STATE.ui.employeeChartEmps.map(map);
  if (STATE.ui.employeeView === oldName) STATE.ui.employeeView = newName;
  if (STATE.ui.monthEmp === oldName) STATE.ui.monthEmp = newName;
  if (STATE.ui.yearEmp === oldName) STATE.ui.yearEmp = newName;
  if (STATE.ui.contractEmp === oldName) STATE.ui.contractEmp = newName;
  if (STATE.ui.cdiEmp === oldName) STATE.ui.cdiEmp = newName;
}

function addEmployee(name, typeRef) {
  const n = normalizeEmployeeName(name);
  const err = validateEmployeeName(n);
  if (err) return { ok: false, error: err };

  STATE.employees.push(n);
  STATE.patterns[n] = {};
  for (const pname of getPatternCycleWeeks()) {
    STATE.patterns[n][pname] = makeEmptyPattern();
  }
  STATE.affectations[n] = [];
  STATE.planning[n] = {};
  setEmployeeType(n, typeRef || getDefaultEmployeeTypeId());
  setEmployeeInfo(n, makeEmptyEmployeeInfo());
  if (!STATE.contractDays) STATE.contractDays = {};
  STATE.contractDays[n] = [];
  if (!STATE.contractDescriptions) STATE.contractDescriptions = {};
  STATE.contractDescriptions[n] = '';
  if (!STATE.cdiWeeks) STATE.cdiWeeks = {};
  STATE.cdiWeeks[n] = [];
  if (!STATE.cdiDescriptions) STATE.cdiDescriptions = {};
  STATE.cdiDescriptions[n] = '';
  if (!STATE.ui.filtersEmp.includes(n)) STATE.ui.filtersEmp.push(n);
  if (!STATE.ui.employeeChartEmps.includes(n)) STATE.ui.employeeChartEmps.push(n);
  if (!STATE.ui.employeeView) STATE.ui.employeeView = n;

  return { ok: true, name: n };
}

function renameEmployee(oldName, newName) {
  const next = normalizeEmployeeName(newName);
  const err = validateEmployeeName(next, { exclude: oldName });
  if (err) return { ok: false, error: err };
  if (!STATE.employees.includes(oldName)) {
    return { ok: false, error: 'Salarié introuvable.' };
  }
  if (oldName === next) return { ok: true, name: next };

  moveEmployeeDataKey(STATE.patterns, oldName, next);
  moveEmployeeDataKey(STATE.affectations, oldName, next);
  moveEmployeeDataKey(STATE.planning, oldName, next);
  if (!STATE.employeeTypes) STATE.employeeTypes = {};
  moveEmployeeDataKey(STATE.employeeTypes, oldName, next);
  if (!STATE.employeeInfo) STATE.employeeInfo = {};
  moveEmployeeDataKey(STATE.employeeInfo, oldName, next);
  if (!STATE.contractDays) STATE.contractDays = {};
  moveEmployeeDataKey(STATE.contractDays, oldName, next);
  if (!STATE.contractDescriptions) STATE.contractDescriptions = {};
  moveEmployeeDataKey(STATE.contractDescriptions, oldName, next);
  if (!STATE.cdiWeeks) STATE.cdiWeeks = {};
  moveEmployeeDataKey(STATE.cdiWeeks, oldName, next);
  if (!STATE.cdiDescriptions) STATE.cdiDescriptions = {};
  moveEmployeeDataKey(STATE.cdiDescriptions, oldName, next);

  if (STATE.ui.contractEmp === oldName) STATE.ui.contractEmp = next;
  if (STATE.ui.cdiEmp === oldName) STATE.ui.cdiEmp = next;
  if (STATE.ui.employeeDetailsOpen) {
    STATE.ui.employeeDetailsOpen = STATE.ui.employeeDetailsOpen.map(e => (e === oldName ? next : e));
  }

  const i = STATE.employees.indexOf(oldName);
  if (i >= 0) STATE.employees[i] = next;

  for (const c of STATE.conges || []) {
    if (c.emp === oldName) c.emp = next;
  }

  replaceEmployeeInUiArrays(oldName, next);
  return { ok: true, name: next };
}

function reorderEmployee(fromIndex, toIndex) {
  const list = STATE.employees;
  const n = list.length;
  if (fromIndex === toIndex) return { ok: true };
  if (fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n) {
    return { ok: false, error: 'Position invalide.' };
  }
  const [emp] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, emp);
  return { ok: true };
}
