/* CDI — données (semaines de demi-journées par salarié) */
'use strict';

const CDI_DAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

function makeCdiWeekId() {
  return `cdiw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeEmptyCdiDay() {
  return { matin: false, aprem: false };
}

function makeEmptyCdiWeek(label) {
  return {
    id: makeCdiWeekId(),
    label: label || '',
    days: Array.from({ length: 7 }, () => makeEmptyCdiDay()),
  };
}

function normalizeCdiDay(raw) {
  if (!raw || typeof raw !== 'object') return makeEmptyCdiDay();
  return {
    matin: !!raw.matin,
    aprem: !!raw.aprem,
  };
}

function normalizeCdiWeek(raw, index) {
  if (!raw || typeof raw !== 'object') return makeEmptyCdiWeek(`Semaine ${index + 1}`);
  const days = Array.from({ length: 7 }, (_, i) => normalizeCdiDay((raw.days || [])[i]));
  const label = String(raw.label || '').trim() || `Semaine ${index + 1}`;
  return {
    id: raw.id || makeCdiWeekId(),
    label,
    days,
  };
}

function getCdiWeeks(emp, state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { cdiWeeks: {}, employees: [] };
  if (!state.cdiWeeks) state.cdiWeeks = {};
  if (!state.cdiWeeks[emp]) state.cdiWeeks[emp] = [];
  return state.cdiWeeks[emp];
}

function addCdiWeek(emp, label, state) {
  if (state === undefined) state = typeof STATE !== 'undefined' ? STATE : null;
  const weeks = getCdiWeeks(emp, state);
  const week = makeEmptyCdiWeek(label || `Semaine ${weeks.length + 1}`);
  weeks.push(week);
  return { ok: true, week };
}

function removeCdiWeek(emp, weekId, state) {
  if (state === undefined) state = typeof STATE !== 'undefined' ? STATE : null;
  const list = getCdiWeeks(emp, state);
  const i = list.findIndex(w => w.id === weekId);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

function updateCdiWeekLabel(emp, weekId, label, state) {
  if (state === undefined) state = typeof STATE !== 'undefined' ? STATE : null;
  const week = getCdiWeeks(emp, state).find(w => w.id === weekId);
  if (!week) return false;
  week.label = String(label || '').trim() || week.label;
  return true;
}

function setCdiShift(emp, weekId, dayIdx, shift, worked, state) {
  if (state === undefined) state = typeof STATE !== 'undefined' ? STATE : null;
  const week = getCdiWeeks(emp, state).find(w => w.id === weekId);
  if (!week || dayIdx < 0 || dayIdx > 6) return false;
  if (shift !== 'matin' && shift !== 'aprem') return false;
  week.days[dayIdx][shift] = !!worked;
  return true;
}

function toggleCdiShift(emp, weekId, dayIdx, shift, state) {
  if (state === undefined) state = typeof STATE !== 'undefined' ? STATE : null;
  const week = getCdiWeeks(emp, state).find(w => w.id === weekId);
  if (!week || dayIdx < 0 || dayIdx > 6) return false;
  week.days[dayIdx][shift] = !week.days[dayIdx][shift];
  return week.days[dayIdx][shift];
}

function countCdiWeekHalfDays(week) {
  let n = 0;
  for (const day of week.days) {
    if (day.matin) n++;
    if (day.aprem) n++;
  }
  return n;
}

function countCdiTotalHalfDays(weeks) {
  return weeks.reduce((sum, w) => sum + countCdiWeekHalfDays(w), 0);
}

function ensureCdiWeeks(state) {
  if (!state.cdiWeeks) state.cdiWeeks = {};
  for (const emp of state.employees || []) {
    if (!state.cdiWeeks[emp]) state.cdiWeeks[emp] = [];
    state.cdiWeeks[emp] = state.cdiWeeks[emp]
      .map((w, i) => normalizeCdiWeek(w, i));
  }
  for (const name of Object.keys(state.cdiWeeks)) {
    if (!(state.employees || []).includes(name)) delete state.cdiWeeks[name];
  }
}
