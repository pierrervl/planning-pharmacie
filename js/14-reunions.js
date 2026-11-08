/* Réunions — ponctuelles ou récurrentes (répétition choisie par l'utilisateur) */
'use strict';

/* Modèle d'une réunion (STATE.reunions[]) :
   {
     id, title, date (ISO, 1re occurrence), start 'HH:MM', end 'HH:MM',
     allTeam: bool, participants: [noms], location, note,
     repeat: {
       freq: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly',
       interval: 1,                 // tous les N jours / semaines / mois / ans
       weekdays: [1..7],            // hebdo : 1 = lundi … 7 = dimanche
       monthMode: 'day' | 'nth' | 'last',  // mensuel : le 14 / le 2e mardi / le dernier mardi
       endMode: 'never' | 'until' | 'count',
       until: ISO | null, count: N,
     },
     exceptions: [ISO]              // occurrences annulées
   } */

const REUNION_FREQ_LABELS = {
  none: 'Ne se répète pas',
  daily: 'Tous les jours',
  weekly: 'Toutes les semaines',
  monthly: 'Tous les mois',
  yearly: 'Tous les ans',
};
const REUNION_WEEKDAY_SHORT = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const REUNION_WEEKDAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const REUNION_MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const REUNION_MAX_ITER = 6000;
/* Limite matin / après-midi pour placer la réunion sur les demi-journées */
const REUNION_NOON_MIN = 13 * 60;

function makeReunionId() {
  return `reu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isoWeekday(d) {
  return ((d.getDay() + 6) % 7) + 1;
}

function reunionTimeToMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatReunionTime(t) {
  const m = reunionTimeToMin(t);
  if (m == null) return '';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`;
}

function formatReunionHours(r) {
  const a = formatReunionTime(r.start);
  const b = formatReunionTime(r.end);
  if (a && b) return `${a}–${b}`;
  return a || '';
}

function normalizeReunion(raw) {
  if (!raw || !raw.date) return null;
  const rep = raw.repeat || {};
  const freq = REUNION_FREQ_LABELS[rep.freq] ? rep.freq : 'none';
  const weekdays = Array.isArray(rep.weekdays)
    ? [...new Set(rep.weekdays.map(Number).filter(n => n >= 1 && n <= 7))].sort((a, b) => a - b)
    : [];
  return {
    id: raw.id || makeReunionId(),
    title: String(raw.title || '').trim() || 'Réunion',
    date: raw.date,
    start: reunionTimeToMin(raw.start) != null ? raw.start : '',
    end: reunionTimeToMin(raw.end) != null ? raw.end : '',
    allTeam: raw.allTeam !== false,
    participants: Array.isArray(raw.participants) ? raw.participants.filter(Boolean) : [],
    location: String(raw.location || '').trim(),
    note: String(raw.note || '').trim(),
    repeat: {
      freq,
      interval: Math.max(1, Math.min(99, parseInt(rep.interval, 10) || 1)),
      weekdays: weekdays.length ? weekdays : [isoWeekday(fromISO(raw.date))],
      monthMode: ['day', 'nth', 'last'].includes(rep.monthMode) ? rep.monthMode : 'day',
      endMode: ['never', 'until', 'count'].includes(rep.endMode) ? rep.endMode : 'never',
      until: rep.until || null,
      count: Math.max(1, Math.min(999, parseInt(rep.count, 10) || 10)),
    },
    exceptions: Array.isArray(raw.exceptions) ? raw.exceptions.filter(Boolean) : [],
  };
}

function ensureReunions(state) {
  if (!state) state = STATE;
  if (!Array.isArray(state.reunions)) state.reunions = [];
  state.reunions = state.reunions.map(normalizeReunion).filter(Boolean);
}

function getReunions(state = STATE) {
  return Array.isArray(state.reunions) ? state.reunions : [];
}

function getReunionById(id) {
  return getReunions().find(r => r.id === id) || null;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/* N-ième (1..5) jour de semaine wd (1..7) d'un mois, ou le dernier si nth === -1 */
function nthWeekdayOfMonth(year, month, wd, nth) {
  if (nth === -1) {
    const last = new Date(year, month, daysInMonth(year, month), 12);
    const diff = (isoWeekday(last) - wd + 7) % 7;
    return new Date(year, month, last.getDate() - diff, 12);
  }
  const first = new Date(year, month, 1, 12);
  const diff = (wd - isoWeekday(first) + 7) % 7;
  const day = 1 + diff + (nth - 1) * 7;
  if (day > daysInMonth(year, month)) return null;
  return new Date(year, month, day, 12);
}

/* Liste ordonnée des dates candidates (ISO), annulations comprises, sans dépasser endIso.
   Les dates annulées comptent dans « après N occurrences ». */
function reunionCandidateDates(r, endIso) {
  const out = [];
  const rep = r.repeat || { freq: 'none' };
  const start = fromISO(r.date);
  const until = rep.endMode === 'until' && rep.until ? rep.until : null;
  const maxCount = rep.endMode === 'count' ? rep.count : Infinity;
  const limit = until && until < endIso ? until : endIso;
  const push = (d) => {
    const iso = toISO(d);
    if (iso < r.date || iso > limit) return iso > limit ? 'stop' : 'skip';
    out.push(iso);
    return out.length >= maxCount ? 'stop' : 'ok';
  };

  if (rep.freq === 'none') {
    if (r.date <= limit) out.push(r.date);
    return out;
  }
  const step = rep.interval || 1;
  for (let k = 0; k < REUNION_MAX_ITER; k++) {
    if (rep.freq === 'daily') {
      if (push(addDays(start, k * step)) === 'stop') break;
    } else if (rep.freq === 'weekly') {
      const mon = addDays(mondayOf(start), k * 7 * step);
      let stop = false;
      for (const wd of rep.weekdays) {
        if (push(addDays(mon, wd - 1)) === 'stop') { stop = true; break; }
      }
      if (stop || toISO(mon) > limit) break;
    } else if (rep.freq === 'monthly') {
      const base = new Date(start.getFullYear(), start.getMonth() + k * step, 1, 12);
      const y = base.getFullYear();
      const m = base.getMonth();
      if (toISO(base) > limit) break;
      let d = null;
      if (rep.monthMode === 'day') {
        if (start.getDate() <= daysInMonth(y, m)) d = new Date(y, m, start.getDate(), 12);
      } else {
        const wd = isoWeekday(start);
        const nth = rep.monthMode === 'last' ? -1 : Math.ceil(start.getDate() / 7);
        d = nthWeekdayOfMonth(y, m, wd, nth);
      }
      if (d && push(d) === 'stop') break;
    } else if (rep.freq === 'yearly') {
      const y = start.getFullYear() + k * step;
      if (`${y}-01-01` > limit) break;
      const m = start.getMonth();
      if (start.getDate() <= daysInMonth(y, m) && push(new Date(y, m, start.getDate(), 12)) === 'stop') break;
    } else {
      break;
    }
  }
  return out;
}

/* Occurrences entre deux dates ISO (incluses) : [{ iso, cancelled }] */
function reunionOccurrencesBetween(r, startIso, endIso) {
  const ex = new Set(r.exceptions || []);
  return reunionCandidateDates(r, endIso)
    .filter(iso => iso >= startIso)
    .map(iso => ({ iso, cancelled: ex.has(iso) }));
}

function nextReunionOccurrence(r, fromIso = todayISO()) {
  const horizon = toISO(addDays(fromISO(fromIso), 3 * 366));
  return reunionOccurrencesBetween(r, fromIso, horizon).find(o => !o.cancelled) || null;
}

function reunionParticipants(r, state = STATE) {
  if (r.allTeam) return (state.employees || []).slice();
  return (r.participants || []).filter(e => (state.employees || []).includes(e));
}

function reunionShifts(r) {
  const s = reunionTimeToMin(r.start);
  let e = reunionTimeToMin(r.end);
  if (s == null) return ['matin', 'aprem'];
  if (e == null || e <= s) e = s + 60;
  const shifts = [];
  if (s < REUNION_NOON_MIN) shifts.push('matin');
  if (e > REUNION_NOON_MIN) shifts.push('aprem');
  return shifts;
}

/* Réunions visibles par l'utilisateur courant (un salarié ne voit que les siennes) */
function reunionVisibleForCurrentUser(r) {
  const isStaffOnly = typeof isStaff === 'function' && isStaff()
    && !(typeof isTeamLeader === 'function' && isTeamLeader());
  if (!isStaffOnly) return true;
  const linked = typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;
  if (!linked) return r.allTeam;
  return r.allTeam || (r.participants || []).some(p =>
    p === linked || (typeof employeeNamesMatch === 'function' && employeeNamesMatch(p, linked)));
}

/* Index { iso: [{ reunion, cancelled }] } pour une période */
function buildReunionIndex(startIso, endIso) {
  const idx = {};
  for (const r of getReunions()) {
    if (!reunionVisibleForCurrentUser(r)) continue;
    for (const o of reunionOccurrencesBetween(r, startIso, endIso)) {
      if (o.cancelled) continue;
      (idx[o.iso] = idx[o.iso] || []).push(r);
    }
  }
  for (const iso of Object.keys(idx)) {
    idx[iso].sort((a, b) => (reunionTimeToMin(a.start) ?? 0) - (reunionTimeToMin(b.start) ?? 0));
  }
  return idx;
}

/* Résumé lisible de la répétition */
function ordinalFr(n) {
  return n === 1 ? '1er' : `${n}e`;
}

function joinFr(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`;
}

function describeReunionRepeat(r) {
  const rep = r.repeat || { freq: 'none' };
  const start = fromISO(r.date);
  const n = rep.interval || 1;
  let txt;
  switch (rep.freq) {
    case 'daily':
      txt = n === 1 ? 'Tous les jours' : `Tous les ${n} jours`;
      break;
    case 'weekly': {
      const days = joinFr(rep.weekdays.map(w => `le ${REUNION_WEEKDAY_LONG[w - 1]}`));
      txt = (n === 1 ? 'Chaque semaine' : `Toutes les ${n} semaines`) + ` ${days}`;
      break;
    }
    case 'monthly': {
      const wd = REUNION_WEEKDAY_LONG[isoWeekday(start) - 1];
      const when = rep.monthMode === 'day'
        ? `le ${start.getDate() === 1 ? '1er' : start.getDate()}`
        : rep.monthMode === 'last'
          ? `le dernier ${wd}`
          : `le ${ordinalFr(Math.ceil(start.getDate() / 7))} ${wd}`;
      txt = (n === 1 ? 'Chaque mois' : `Tous les ${n} mois`) + ` ${when}`;
      break;
    }
    case 'yearly':
      txt = (n === 1 ? 'Chaque année' : `Tous les ${n} ans`)
        + ` le ${start.getDate() === 1 ? '1er' : start.getDate()} ${MONTH_NAMES[start.getMonth()].toLowerCase()}`;
      break;
    default:
      return `Ponctuelle · ${DAY_NAMES_LONG[start.getDay()].toLowerCase()} ${frFormatNumeric(r.date)}`;
  }
  txt += `, à partir du ${frFormatNumeric(r.date)}`;
  if (rep.endMode === 'until' && rep.until) txt += `, jusqu'au ${frFormatNumeric(rep.until)}`;
  else if (rep.endMode === 'count') txt += `, ${rep.count} fois`;
  return txt;
}

function describeReunionParticipants(r) {
  if (r.allTeam) return "Toute l'équipe";
  const list = reunionParticipants(r);
  if (!list.length) return 'Aucun participant';
  if (list.length <= 3) return list.map(shortEmpName).join(', ');
  return `${list.length} salariés`;
}

/* --- Mise à jour --------------------------------------------------------- */
function saveReunion(raw) {
  const r = normalizeReunion(raw);
  if (!r) return { ok: false, error: 'Date requise.' };
  if (!r.allTeam && !r.participants.length) return { ok: false, error: 'Choisissez au moins un participant.' };
  const s = reunionTimeToMin(r.start);
  const e = reunionTimeToMin(r.end);
  if (s == null) return { ok: false, error: 'Heure de début requise.' };
  if (e != null && e <= s) return { ok: false, error: "L'heure de fin doit être après l'heure de début." };
  if (r.repeat.freq === 'weekly' && !r.repeat.weekdays.length) return { ok: false, error: 'Choisissez au moins un jour de la semaine.' };
  if (r.repeat.endMode === 'until' && (!r.repeat.until || r.repeat.until < r.date)) {
    return { ok: false, error: 'La date de fin doit être après la première réunion.' };
  }
  ensureReunions();
  const i = STATE.reunions.findIndex(x => x.id === r.id);
  if (i >= 0) STATE.reunions[i] = r;
  else STATE.reunions.push(r);
  return { ok: true, reunion: r, created: i < 0 };
}

function deleteReunion(id) {
  STATE.reunions = getReunions().filter(r => r.id !== id);
}

function toggleReunionException(id, iso) {
  const r = getReunionById(id);
  if (!r) return;
  const set = new Set(r.exceptions || []);
  if (set.has(iso)) set.delete(iso);
  else set.add(iso);
  r.exceptions = [...set].sort();
}

function renameEmployeeInReunions(oldName, newName) {
  for (const r of getReunions()) {
    r.participants = (r.participants || []).map(p => (p === oldName ? newName : p));
  }
}

/* --- Affichage dans le planning Semaine -------------------------------- */
function reunionHeaderHtml(iso, index) {
  const list = (index || {})[iso];
  if (!list || !list.length) return '';
  const tip = list.map(r => `${formatReunionHours(r)} ${r.title}`.trim()).join('\n');
  const label = list.length === 1
    ? `${formatReunionTime(list[0].start)} ${list[0].title}`
    : `${list.length} réunions`;
  return `<span class="reunion-name" title="${escapeHtml(tip)}">${escapeHtml(label)}</span>`;
}

/* Ajoute un repère sur les demi-journées des participants */
function decorateReunionCells(root, index) {
  if (!root || !index) return;
  for (const [iso, list] of Object.entries(index)) {
    for (const r of list) {
      const who = reunionParticipants(r);
      for (const emp of who) {
        for (const shift of reunionShifts(r)) {
          const sel = `[data-emp="${CSS.escape(emp)}"][data-date="${iso}"][data-shift="${shift}"]`;
          root.querySelectorAll(sel).forEach(cell => {
            cell.classList.add('has-reunion');
            const line = `Réunion ${formatReunionHours(r)} : ${r.title}`;
            cell.title = cell.title ? `${cell.title}\n${line}` : line;
          });
        }
      }
    }
  }
}

/* --- Éditeur (onglet Réunions) ------------------------------------------ */
function blankReunionDraft() {
  const today = todayISO();
  return normalizeReunion({
    date: today, start: '14:00', end: '15:00', allTeam: true,
    repeat: { freq: 'none', interval: 1, weekdays: [isoWeekday(fromISO(today))], endMode: 'never' },
  });
}

function renderReunionsEditor(root) {
  ensureReunions();
  const editable = typeof canEditPlanning !== 'function' || canEditPlanning();
  const editing = STATE.ui.reunionEditId ? getReunionById(STATE.ui.reunionEditId) : null;
  if (STATE.ui.reunionEditId && !editing) STATE.ui.reunionEditId = null;

  const ctrl = document.createElement('div');
  ctrl.className = 'controls';
  ctrl.innerHTML = `
    <div class="label">Réunions</div>
    <div class="help-text">Réunions ponctuelles ou régulières : elles apparaissent dans la vue Semaine
      (en-tête du jour et repère <span class="reunion-dot-inline" aria-hidden="true"></span> sur les demi-journées des participants).</div>`;
  root.appendChild(ctrl);

  if (editable) root.appendChild(buildReunionForm(editing || blankReunionDraft(), !!editing));

  root.appendChild(buildReunionList(editable));
  root.appendChild(buildReunionUpcoming(editable));
}

function buildReunionForm(r, isEdit) {
  const rep = r.repeat;
  const start = fromISO(r.date);
  const emps = STATE.employees.slice();
  const card = document.createElement('div');
  card.className = 'form-card reunion-form';
  card.innerHTML = `
    <h3>${isEdit ? 'Modifier la réunion' : 'Nouvelle réunion'}</h3>
    <div class="reunion-grid">
      <div class="field reunion-field-wide">
        <label for="reu-title">Titre</label>
        <input type="text" id="reu-title" maxlength="80" placeholder="ex : Réunion d'équipe" value="${escapeHtml(isEdit ? r.title : '')}">
      </div>
      <div class="field">
        <label for="reu-date">${rep.freq === 'none' ? 'Date' : 'Première date'}</label>
        <input type="text" class="fr-date" id="reu-date" data-iso="${r.date}" value="${frFormatNumeric(r.date)}">
      </div>
      <div class="field reunion-times">
        <label for="reu-start">Horaire</label>
        <div class="reunion-time-row">
          <input type="time" id="reu-start" value="${escapeHtml(r.start)}" step="300" aria-label="Heure de début">
          <span>à</span>
          <input type="time" id="reu-end" value="${escapeHtml(r.end)}" step="300" aria-label="Heure de fin">
        </div>
      </div>
      <div class="field">
        <label for="reu-location">Lieu <span class="muted">(facultatif)</span></label>
        <input type="text" id="reu-location" maxlength="60" placeholder="ex : Arrière-boutique" value="${escapeHtml(r.location)}">
      </div>
    </div>

    <fieldset class="reunion-fieldset">
      <legend>Participants</legend>
      <div class="reunion-radio-row">
        <label><input type="radio" name="reu-who" value="all" ${r.allTeam ? 'checked' : ''}> Toute l'équipe</label>
        <label><input type="radio" name="reu-who" value="some" ${r.allTeam ? '' : 'checked'}> Certains salariés</label>
      </div>
      <div class="reunion-emps" data-reu-section="emps" ${r.allTeam ? 'hidden' : ''}>
        ${emps.length ? emps.map(e => `
          <label class="reunion-emp">
            <input type="checkbox" class="reu-emp" value="${escapeHtml(e)}" ${r.participants.includes(e) ? 'checked' : ''}>
            <span>${escapeHtml(e)}</span>
          </label>`).join('') : '<p class="muted">Ajoutez d\'abord des salariés (Équipe → Salariés).</p>'}
      </div>
    </fieldset>

    <fieldset class="reunion-fieldset">
      <legend>Répétition</legend>
      <div class="reunion-repeat-row">
        <select id="reu-freq" aria-label="Fréquence">
          ${Object.entries(REUNION_FREQ_LABELS).map(([k, v]) => `<option value="${k}" ${rep.freq === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <span class="reunion-interval" data-reu-section="interval">
          <label for="reu-interval">tous les</label>
          <input type="number" id="reu-interval" min="1" max="99" value="${rep.interval}">
          <span id="reu-interval-unit"></span>
        </span>
      </div>

      <div class="reunion-sub" data-reu-section="weekdays">
        <div class="reunion-sub-label">Les jours</div>
        <div class="reunion-weekdays" role="group" aria-label="Jours de la semaine">
          ${REUNION_WEEKDAY_SHORT.map((lbl, i) => `
            <button type="button" class="reunion-wd${rep.weekdays.includes(i + 1) ? ' active' : ''}" data-wd="${i + 1}"
              aria-pressed="${rep.weekdays.includes(i + 1)}" title="${REUNION_WEEKDAY_LONG[i]}">${lbl}</button>`).join('')}
        </div>
      </div>

      <div class="reunion-sub" data-reu-section="monthly">
        <div class="reunion-sub-label">Le</div>
        <div class="reunion-radio-col" id="reu-month-modes"></div>
      </div>

      <div class="reunion-sub" data-reu-section="end">
        <div class="reunion-sub-label">Fin</div>
        <div class="reunion-radio-col">
          <label><input type="radio" name="reu-end" value="never" ${rep.endMode === 'never' ? 'checked' : ''}> Jamais</label>
          <label class="reunion-inline"><input type="radio" name="reu-end" value="until" ${rep.endMode === 'until' ? 'checked' : ''}> Le
            <input type="text" class="fr-date" id="reu-until" data-iso="${rep.until || ''}" value="${rep.until ? frFormatNumeric(rep.until) : ''}" aria-label="Date de fin"></label>
          <label class="reunion-inline"><input type="radio" name="reu-end" value="count" ${rep.endMode === 'count' ? 'checked' : ''}> Après
            <input type="number" id="reu-count" min="1" max="999" value="${rep.count}" aria-label="Nombre d'occurrences"> réunions</label>
        </div>
      </div>
      <p class="reunion-summary" id="reu-summary" aria-live="polite"></p>
    </fieldset>

    <div class="field">
      <label for="reu-note">Note <span class="muted">(facultatif)</span></label>
      <textarea id="reu-note" rows="2" maxlength="300" placeholder="Ordre du jour, consignes…">${escapeHtml(r.note)}</textarea>
    </div>

    <div class="reunion-actions">
      <button type="button" class="primary" id="reu-save">${isEdit ? 'Enregistrer les modifications' : '+ Ajouter la réunion'}</button>
      ${isEdit ? '<button type="button" class="nav" id="reu-cancel">Annuler</button>' : ''}
    </div>`;

  const q = (sel) => card.querySelector(sel);
  /* Tant que l'utilisateur n'a pas choisi les jours lui-même, le jour coché suit la date. */
  const state = {
    weekdays: rep.weekdays.slice(),
    monthMode: rep.monthMode,
    weekdaysTouched: isEdit && rep.freq === 'weekly',
  };
  const syncWeekdayButtons = () => {
    card.querySelectorAll('.reunion-wd').forEach(btn => {
      const on = state.weekdays.includes(Number(btn.dataset.wd));
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  };

  const readDraft = () => {
    const date = readFrDateInput(q('#reu-date')) || r.date;
    const freq = q('#reu-freq').value;
    const endMode = (card.querySelector('input[name="reu-end"]:checked') || {}).value || 'never';
    return {
      id: isEdit ? r.id : undefined,
      title: q('#reu-title').value,
      date,
      start: q('#reu-start').value,
      end: q('#reu-end').value,
      location: q('#reu-location').value,
      note: q('#reu-note').value,
      allTeam: (card.querySelector('input[name="reu-who"]:checked') || {}).value !== 'some',
      participants: [...card.querySelectorAll('.reu-emp:checked')].map(c => c.value),
      repeat: {
        freq,
        interval: q('#reu-interval').value,
        weekdays: state.weekdays,
        monthMode: state.monthMode,
        endMode,
        until: q('#reu-until').value ? readFrDateInput(q('#reu-until')) : null,
        count: q('#reu-count').value,
      },
      exceptions: isEdit ? r.exceptions : [],
    };
  };

  const refresh = () => {
    if (!state.weekdaysTouched) {
      const dateIso = readFrDateInput(q('#reu-date')) || r.date;
      state.weekdays = [isoWeekday(fromISO(dateIso))];
      syncWeekdayButtons();
    }
    const d = readDraft();
    const freq = d.repeat.freq;
    const show = (name, on) => { const el = card.querySelector(`[data-reu-section="${name}"]`); if (el) el.hidden = !on; };
    show('emps', !d.allTeam);
    show('interval', freq !== 'none');
    show('weekdays', freq === 'weekly');
    show('monthly', freq === 'monthly');
    show('end', freq !== 'none');
    q('label[for="reu-date"]').textContent = freq === 'none' ? 'Date' : 'Première date';
    const n = parseInt(d.repeat.interval, 10) || 1;
    q('#reu-interval-unit').textContent = { daily: n > 1 ? 'jours' : 'jour', weekly: n > 1 ? 'semaines' : 'semaine', monthly: 'mois', yearly: n > 1 ? 'ans' : 'an' }[freq] || '';

    /* Choix mensuels selon la date choisie */
    const sd = fromISO(d.date);
    const wd = REUNION_WEEKDAY_LONG[isoWeekday(sd) - 1];
    const nth = Math.ceil(sd.getDate() / 7);
    const isLastWeek = sd.getDate() + 7 > daysInMonth(sd.getFullYear(), sd.getMonth());
    const modes = [
      ['day', `Le ${sd.getDate() === 1 ? '1er' : sd.getDate()} de chaque mois`],
      ...(nth <= 4 ? [['nth', `Le ${ordinalFr(nth)} ${wd} du mois`]] : []),
      ...(isLastWeek ? [['last', `Le dernier ${wd} du mois`]] : []),
    ];
    if (!modes.some(m => m[0] === state.monthMode)) state.monthMode = 'day';
    q('#reu-month-modes').innerHTML = modes.map(([k, lbl]) => `
      <label><input type="radio" name="reu-month" value="${k}" ${state.monthMode === k ? 'checked' : ''}> ${lbl}</label>`).join('');
    card.querySelectorAll('input[name="reu-month"]').forEach(inp => {
      inp.onchange = () => { state.monthMode = inp.value; refresh(); };
    });

    const preview = normalizeReunion(d);
    q('#reu-summary').textContent = preview ? `Résumé : ${describeReunionRepeat(preview)}${preview.start ? ` · ${formatReunionHours(preview)}` : ''}` : '';
  };

  card.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', refresh);
    el.addEventListener('change', refresh);
  });
  card.addEventListener('frdate-select', refresh);
  card.querySelectorAll('.reunion-wd').forEach(btn => {
    btn.onclick = () => {
      const wd = Number(btn.dataset.wd);
      state.weekdaysTouched = true;
      state.weekdays = state.weekdays.includes(wd)
        ? state.weekdays.filter(x => x !== wd)
        : [...state.weekdays, wd].sort((a, b) => a - b);
      syncWeekdayButtons();
      refresh();
    };
  });
  q('#reu-until').addEventListener('focus', () => { card.querySelector('input[name="reu-end"][value="until"]').checked = true; });
  q('#reu-count').addEventListener('focus', () => { card.querySelector('input[name="reu-end"][value="count"]').checked = true; });

  q('#reu-save').onclick = () => {
    if (!readFrDateInput(q('#reu-date'))) { toast('Date requise (format jj/mm/aaaa).', true); return; }
    const res = saveReunion(readDraft());
    if (!res.ok) { toast(res.error, true); return; }
    STATE.ui.reunionEditId = null;
    persistAndRender();
    toast(res.created ? 'Réunion ajoutée' : 'Réunion modifiée');
  };
  const cancel = q('#reu-cancel');
  if (cancel) cancel.onclick = () => { STATE.ui.reunionEditId = null; persistAndRender({ skipCloud: true }); };

  window.setTimeout(refresh, 0);
  return card;
}

function buildReunionList(editable) {
  const list = getReunions().filter(reunionVisibleForCurrentUser).slice().sort((a, b) => {
    const na = nextReunionOccurrence(a)?.iso || '9999';
    const nb = nextReunionOccurrence(b)?.iso || '9999';
    return na.localeCompare(nb);
  });
  const card = document.createElement('div');
  card.className = 'form-card';
  let h = `<h3>Réunions enregistrées (${list.length})</h3>`;
  if (!list.length) {
    h += `<p class="muted">Aucune réunion pour le moment.${editable ? ' Utilisez le formulaire ci-dessus.' : ''}</p>`;
  } else {
    h += `<div class="reunion-table-wrap"><table class="list reunion-table"><thead><tr>
      <th>Réunion</th><th>Quand</th><th>Horaire</th><th>Participants</th><th>Prochaine</th>${editable ? '<th></th>' : ''}
    </tr></thead><tbody>`;
    for (const r of list) {
      const next = nextReunionOccurrence(r);
      h += `<tr${STATE.ui.reunionEditId === r.id ? ' class="is-editing"' : ''}>
        <td><strong>${escapeHtml(r.title)}</strong>${r.location ? `<div class="muted">${escapeHtml(r.location)}</div>` : ''}</td>
        <td>${escapeHtml(describeReunionRepeat(r))}</td>
        <td>${escapeHtml(formatReunionHours(r))}</td>
        <td>${escapeHtml(describeReunionParticipants(r))}</td>
        <td>${next ? escapeHtml(frFormatNumeric(next.iso)) : '<span class="muted">Terminée</span>'}</td>
        ${editable ? `<td class="reunion-row-actions">
          <button type="button" class="nav" data-reu-edit="${escapeHtml(r.id)}">Modifier</button>
          <button type="button" class="del" data-reu-del="${escapeHtml(r.id)}">Supprimer</button>
        </td>` : ''}
      </tr>`;
    }
    h += '</tbody></table></div>';
  }
  card.innerHTML = h;
  card.querySelectorAll('[data-reu-edit]').forEach(b => {
    b.onclick = () => {
      STATE.ui.reunionEditId = b.dataset.reuEdit;
      persistAndRender({ skipCloud: true });
      document.querySelector('.reunion-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  card.querySelectorAll('[data-reu-del]').forEach(b => {
    b.onclick = () => {
      const r = getReunionById(b.dataset.reuDel);
      if (!r) return;
      const recurring = r.repeat.freq !== 'none';
      if (!confirm(recurring ? `Supprimer « ${r.title} » et toutes ses dates ?` : `Supprimer « ${r.title} » ?`)) return;
      deleteReunion(r.id);
      if (STATE.ui.reunionEditId === r.id) STATE.ui.reunionEditId = null;
      persistAndRender();
      toast('Réunion supprimée');
    };
  });
  return card;
}

const REUNION_UPCOMING_WEEKS = 8;

function buildReunionUpcoming(editable) {
  const from = todayISO();
  const to = toISO(addDays(fromISO(from), REUNION_UPCOMING_WEEKS * 7));
  const rows = [];
  for (const r of getReunions()) {
    if (!reunionVisibleForCurrentUser(r)) continue;
    for (const o of reunionOccurrencesBetween(r, from, to)) rows.push({ r, ...o });
  }
  rows.sort((a, b) => a.iso.localeCompare(b.iso)
    || (reunionTimeToMin(a.r.start) ?? 0) - (reunionTimeToMin(b.r.start) ?? 0));

  const card = document.createElement('div');
  card.className = 'form-card';
  let h = `<h3>Prochaines réunions <span class="muted">(${REUNION_UPCOMING_WEEKS} semaines)</span></h3>`;
  if (!rows.length) {
    h += '<p class="muted">Aucune réunion prévue sur cette période.</p>';
  } else {
    h += '<ul class="reunion-upcoming">';
    for (const row of rows) {
      const d = fromISO(row.iso);
      const recurring = row.r.repeat.freq !== 'none';
      h += `<li class="${row.cancelled ? 'is-cancelled' : ''}">
        <span class="reunion-up-date"><strong>${DAY_NAMES_ABBR[d.getDay()]} ${d.getDate()}</strong> ${REUNION_MONTH_SHORT[d.getMonth()]}</span>
        <span class="reunion-up-time">${escapeHtml(formatReunionHours(row.r))}</span>
        <span class="reunion-up-title">${escapeHtml(row.r.title)}<span class="muted"> · ${escapeHtml(describeReunionParticipants(row.r))}</span>
          ${row.cancelled ? '<span class="reunion-up-badge">Annulée</span>' : ''}</span>
        ${editable && recurring ? `<button type="button" class="nav reunion-up-btn" data-reu-ex="${escapeHtml(row.r.id)}" data-iso="${row.iso}">
          ${row.cancelled ? 'Rétablir' : 'Annuler cette date'}</button>` : '<span></span>'}
      </li>`;
    }
    h += '</ul>';
    if (editable) h += '<p class="muted reunion-up-hint">« Annuler cette date » retire une seule occurrence d\'une réunion régulière, sans toucher aux autres.</p>';
  }
  card.innerHTML = h;
  card.querySelectorAll('[data-reu-ex]').forEach(b => {
    b.onclick = () => {
      toggleReunionException(b.dataset.reuEx, b.dataset.iso);
      persistAndRender();
    };
  });
  return card;
}

/* Normalise les réunions déjà chargées (le module se charge après 01-state.js) */
if (typeof STATE !== 'undefined') ensureReunions(STATE);
