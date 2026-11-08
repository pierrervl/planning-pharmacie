/* Réunions d'équipe : sporadiques (une date) et périodiques */
'use strict';

const REUNION_FREQS = ['weekly', 'biweekly', 'monthly'];
const REUNION_NTHS = [1, 2, 3, 4, -1];
const REUNION_UPCOMING_DAYS = 56;
const REUNION_TITLE_MAX = 80;

function makeReunionId() {
  return 'reu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clampReunionWeekday(value, fallbackIso) {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return n;
  if (isIsoDate(fallbackIso)) return fromISO(fallbackIso).getDay();
  return 1;
}

function clampReunionNth(value) {
  const n = Number(value);
  return REUNION_NTHS.includes(n) ? n : 1;
}

function clampReunionDayOfMonth(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(31, n));
}

function normalizeReunion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'periodique' || raw.kind === 'sporadique' ? raw.kind : null;
  if (!kind) return null;
  const title = String(raw.title || '').trim().slice(0, REUNION_TITLE_MAX);
  if (!title) return null;
  const startTime = normalizeTimeInput(raw.startTime) || '';
  const endTime = normalizeTimeInput(raw.endTime) || '';
  if (startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) return null;
  const participants = Array.isArray(raw.participants)
    ? [...new Set(raw.participants.map(p => String(p || '').trim()).filter(Boolean))]
    : [];
  const base = {
    id: String(raw.id || makeReunionId()),
    kind,
    title,
    startTime,
    endTime,
    place: String(raw.place || '').trim().slice(0, 80),
    note: String(raw.note || '').trim().slice(0, 400),
    participants,
  };
  if (kind === 'sporadique') {
    if (!isIsoDate(raw.date)) return null;
    return { ...base, date: raw.date };
  }
  if (!isIsoDate(raw.startDate)) return null;
  const freq = REUNION_FREQS.includes(raw.freq) ? raw.freq : 'weekly';
  let endDate = isIsoDate(raw.endDate) ? raw.endDate : '';
  if (endDate && endDate < raw.startDate) return null;
  return {
    ...base,
    freq,
    weekday: clampReunionWeekday(raw.weekday, raw.startDate),
    monthlyMode: raw.monthlyMode === 'dom' ? 'dom' : 'nth',
    nth: clampReunionNth(raw.nth),
    dayOfMonth: clampReunionDayOfMonth(raw.dayOfMonth),
    startDate: raw.startDate,
    endDate,
  };
}

function ensureReunions(state) {
  if (!state.reunions) state.reunions = [];
  state.reunions = state.reunions.map(normalizeReunion).filter(Boolean);
}

function nthWeekdayDate(year, monthIndex, weekday, nth) {
  if (nth === -1) {
    const last = new Date(year, monthIndex + 1, 0, 12);
    const delta = (last.getDay() - weekday + 7) % 7;
    last.setDate(last.getDate() - delta);
    return last;
  }
  const first = new Date(year, monthIndex, 1, 12);
  const delta = (weekday - first.getDay() + 7) % 7;
  const day = 1 + delta + (nth - 1) * 7;
  const lastDay = new Date(year, monthIndex + 1, 0, 12).getDate();
  if (day > lastDay) return null;
  return new Date(year, monthIndex, day, 12);
}

function reunionOccursOn(reu, dateIso) {
  if (!reu || !isIsoDate(dateIso)) return false;
  if (reu.kind === 'sporadique') return reu.date === dateIso;
  if (!isIsoDate(reu.startDate) || dateIso < reu.startDate) return false;
  if (reu.endDate && dateIso > reu.endDate) return false;
  const d = fromISO(dateIso);
  if (reu.freq === 'monthly') {
    if (reu.monthlyMode === 'dom') return d.getDate() === reu.dayOfMonth;
    const hit = nthWeekdayDate(d.getFullYear(), d.getMonth(), reu.weekday, reu.nth);
    return !!hit && toISO(hit) === dateIso;
  }
  if (d.getDay() !== reu.weekday) return false;
  const anchorDate = fromISO(reu.startDate);
  const delta = (reu.weekday - anchorDate.getDay() + 7) % 7;
  const anchor = toISO(addDays(anchorDate, delta));
  if (dateIso < anchor) return false;
  const weeks = diffDays(anchor, dateIso) / 7;
  if (!Number.isInteger(weeks)) return false;
  if (reu.freq === 'biweekly') return weeks % 2 === 0;
  return true;
}

function upcomingReunionDates(reu, count, fromIso) {
  const wanted = Math.max(1, count || 1);
  if (!reu) return [];
  if (reu.kind === 'sporadique') {
    if (!isIsoDate(reu.date)) return [];
    if (fromIso && reu.date < fromIso) return [];
    return [reu.date];
  }
  if (!isIsoDate(reu.startDate)) return [];
  let cursor = reu.startDate;
  if (fromIso && fromIso > cursor) cursor = fromIso;
  const out = [];
  let d = fromISO(cursor);
  const limit = addDays(d, 800);
  while (out.length < wanted && d <= limit) {
    const iso = toISO(d);
    if (reu.endDate && iso > reu.endDate) break;
    if (reunionOccursOn(reu, iso)) out.push(iso);
    d = addDays(d, 1);
  }
  return out;
}

function nextReunionDate(reu, fromIso) {
  return upcomingReunionDates(reu, 1, fromIso)[0] || null;
}

function reunionsOnDate(dateIso, state) {
  const src = state || (typeof STATE !== 'undefined' ? STATE : { reunions: [] });
  return (src.reunions || [])
    .filter(reu => reunionOccursOn(reu, dateIso))
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '') || a.title.localeCompare(b.title, 'fr'));
}

function collectReunionOccurrences(fromIso, toIso, state) {
  const out = [];
  if (!isIsoDate(fromIso) || !isIsoDate(toIso) || toIso < fromIso) return out;
  let d = fromISO(fromIso);
  const end = fromISO(toIso);
  while (d <= end) {
    const iso = toISO(d);
    for (const reu of reunionsOnDate(iso, state)) out.push({ date: iso, reunion: reu });
    d = addDays(d, 1);
  }
  return out;
}

function reunionNthLabel(nth) {
  if (nth === 1) return '1er';
  if (nth === -1) return 'dernier';
  return `${nth}e`;
}

function reunionWeekdayLabel(weekday, { lower = false } = {}) {
  const name = DAY_NAMES_LONG[weekday] || '';
  return lower ? name.toLowerCase() : name;
}

function reunionRhythmLabel(reu) {
  if (!reu || reu.kind !== 'periodique') return 'Sporadique';
  const day = reunionWeekdayLabel(reu.weekday, { lower: true });
  if (reu.freq === 'weekly') return `Chaque ${day}`;
  if (reu.freq === 'biweekly') return `Un ${day} sur deux`;
  if (reu.monthlyMode === 'dom') return `Le ${reu.dayOfMonth} de chaque mois`;
  return `Le ${reunionNthLabel(reu.nth)} ${day} du mois`;
}

function reunionTimeLabel(reu) {
  const start = reu.startTime ? formatPatternTime(reu.startTime) : '';
  const end = reu.endTime ? formatPatternTime(reu.endTime) : '';
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return '';
}

function reunionParticipantsLabel(reu) {
  const names = reu.participants || [];
  if (!names.length) return 'Toute l\'équipe';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

function shortReunionLabel(title) {
  const t = String(title || 'Réunion').trim();
  return t.length > 12 ? t.slice(0, 11) + '…' : t;
}

function reunionTooltip(reu) {
  return [reu.title, reunionTimeLabel(reu), reu.place, reunionParticipantsLabel(reu)]
    .filter(Boolean)
    .join(' · ');
}

function reunionDayHeaderHtml(dateIso) {
  const list = reunionsOnDate(dateIso);
  if (!list.length) return '';
  const tip = list.map(reunionTooltip).join('\n');
  const label = list.length === 1 ? shortReunionLabel(list[0].title) : `${list.length} réu.`;
  return `<span class="reunion-name" title="${escapeHtml(tip)}">${escapeHtml(label)}</span>`;
}

function formatReunionDayChip(dateIso) {
  const d = fromISO(dateIso);
  return `${DAY_NAMES_SHORT[d.getDay()].toLowerCase()}. ${d.getDate()}/${d.getMonth() + 1}`;
}

function upsertReunion(raw, state) {
  if (!state) state = STATE;
  const entry = normalizeReunion(raw);
  if (!entry) return { ok: false, error: 'Réunion invalide.' };
  if (!entry.startTime) return { ok: false, error: 'Indiquez l\'heure de début.' };
  if (!state.reunions) state.reunions = [];
  const idx = state.reunions.findIndex(r => r.id === entry.id);
  if (idx >= 0) state.reunions[idx] = entry;
  else state.reunions.push(entry);
  return { ok: true, entry, updated: idx >= 0 };
}

function removeReunion(id, state) {
  if (!state) state = STATE;
  const before = (state.reunions || []).length;
  state.reunions = (state.reunions || []).filter(r => r.id !== id);
  return state.reunions.length < before;
}

function renameReunionParticipant(oldName, newName, state) {
  if (!state || oldName === newName) return;
  for (const reu of state.reunions || []) {
    if (!Array.isArray(reu.participants)) continue;
    reu.participants = reu.participants.map(n => (n === oldName ? newName : n));
  }
}

function sortReunionsForCatalog(list) {
  const today = todayISO();
  return list.slice().sort((a, b) => {
    const na = nextReunionDate(a, today) || '9999-99-99';
    const nb = nextReunionDate(b, today) || '9999-99-99';
    if (na !== nb) return na.localeCompare(nb);
    const da = a.kind === 'sporadique' ? a.date : a.startDate;
    const db = b.kind === 'sporadique' ? b.date : b.startDate;
    if (da !== db) return (da || '').localeCompare(db || '');
    return a.title.localeCompare(b.title, 'fr');
  });
}

function reunionPreviewText(reu) {
  if (!reu) return '';
  const dates = upcomingReunionDates(reu, 3, todayISO());
  if (reu.kind === 'sporadique') {
    if (!dates.length) return `Date passée : ${frFormatNumeric(reu.date)}.`;
    return `Le ${frFormat(fromISO(reu.date))}.`;
  }
  const rhythm = reunionRhythmLabel(reu);
  const from = `à partir du ${frFormatNumeric(reu.startDate)}`;
  const until = reu.endDate ? `, jusqu'au ${frFormatNumeric(reu.endDate)}` : '';
  if (!dates.length) return `${rhythm}, ${from}${until}. Aucune date à venir dans la période couverte.`;
  const when = dates.map(frFormatNumeric).join(', ');
  return `${rhythm}, ${from}${until}. Prochaines dates : ${when}.`;
}

function readReunionForm(root) {
  const kindBtn = root.querySelector('.reunion-kind-btn.active');
  const kind = kindBtn?.dataset.kind === 'periodique' ? 'periodique' : 'sporadique';
  const title = (root.querySelector('#reu-title')?.value || '').trim();
  if (!title) return { ok: false, error: 'Indiquez un titre.' };
  const startTime = normalizeTimeInput(root.querySelector('#reu-start-time')?.value);
  const endRaw = (root.querySelector('#reu-end-time')?.value || '').trim();
  const endTime = endRaw ? normalizeTimeInput(endRaw) : '';
  if (!startTime) return { ok: false, error: 'Indiquez l\'heure de début (ex. 13:00).' };
  if (endRaw && !endTime) return { ok: false, error: 'Heure de fin invalide.' };
  if (endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return { ok: false, error: 'L\'heure de fin doit être après l\'heure de début.' };
  }
  const audience = root.querySelector('input[name="reu-audience"]:checked')?.value || 'all';
  let participants = [];
  if (audience === 'some') {
    participants = [...root.querySelectorAll('#reu-participants input:checked')].map(el => el.value);
    if (!participants.length) return { ok: false, error: 'Cochez au moins un participant, ou choisissez toute l\'équipe.' };
  }
  const editingId = root.querySelector('#reu-id')?.value || '';
  const raw = {
    id: editingId || undefined,
    kind,
    title,
    startTime,
    endTime: endTime || '',
    place: root.querySelector('#reu-place')?.value || '',
    note: root.querySelector('#reu-note')?.value || '',
    participants,
  };
  if (kind === 'sporadique') {
    const dateEl = root.querySelector('#reu-date');
    const date = readFrDateInput(dateEl);
    if (!date) {
      return { ok: false, error: dateEl?.value.trim() ? 'Date invalide (jj/mm/aaaa).' : 'Indiquez la date.' };
    }
    raw.date = date;
  } else {
    const startEl = root.querySelector('#reu-start');
    const endEl = root.querySelector('#reu-end');
    const startDate = readFrDateInput(startEl);
    const endDate = readFrDateInput(endEl);
    if (!startDate) {
      return { ok: false, error: startEl?.value.trim() ? 'Date de début invalide (jj/mm/aaaa).' : 'Indiquez à partir de quelle date la réunion commence.' };
    }
    if (endEl?.value.trim() && !endDate) return { ok: false, error: 'Date de fin invalide (jj/mm/aaaa).' };
    if (endDate && endDate < startDate) return { ok: false, error: 'La fin de série doit être après le début.' };
    raw.freq = root.querySelector('#reu-freq')?.value || 'weekly';
    raw.weekday = parseInt(root.querySelector('#reu-weekday')?.value, 10);
    raw.monthlyMode = root.querySelector('#reu-monthly-mode')?.value || 'nth';
    raw.nth = parseInt(root.querySelector('#reu-nth')?.value, 10);
    raw.dayOfMonth = parseInt(root.querySelector('#reu-dom')?.value, 10);
    raw.startDate = startDate;
    raw.endDate = endDate || '';
  }
  const entry = normalizeReunion(raw);
  if (!entry) return { ok: false, error: 'Réunion invalide.' };
  return { ok: true, reunion: entry };
}

function syncReunionFormVisibility(root) {
  const kind = root.querySelector('.reunion-kind-btn.active')?.dataset.kind === 'periodique'
    ? 'periodique'
    : 'sporadique';
  root.querySelectorAll('[data-reu-show]').forEach(el => {
    el.hidden = el.dataset.reuShow !== kind;
  });
  const freq = root.querySelector('#reu-freq')?.value || 'weekly';
  const monthlyMode = root.querySelector('#reu-monthly-mode')?.value || 'nth';
  const monthly = kind === 'periodique' && freq === 'monthly';
  const byDom = monthly && monthlyMode === 'dom';
  const weekday = root.querySelector('[data-reu-field="weekday"]');
  const nth = root.querySelector('[data-reu-field="nth"]');
  const dom = root.querySelector('[data-reu-field="dom"]');
  const mode = root.querySelector('[data-reu-field="monthly-mode"]');
  if (weekday) weekday.hidden = kind !== 'periodique' || byDom;
  if (nth) nth.hidden = !monthly || byDom;
  if (dom) dom.hidden = !byDom;
  if (mode) mode.hidden = !monthly;
  const hint = root.querySelector('#reu-kind-hint');
  if (hint) {
    hint.textContent = kind === 'sporadique'
      ? 'Une seule date : visite, formation ou point exceptionnel.'
      : 'Rendez-vous qui revient : chaque semaine, toutes les 2 semaines, ou chaque mois.';
  }
  const saveBtn = root.querySelector('#reu-save');
  const editing = !!root.querySelector('#reu-id')?.value;
  if (saveBtn) saveBtn.textContent = editing ? 'Enregistrer' : 'Ajouter la réunion';
}

function updateReunionPreview(root) {
  const el = root.querySelector('#reu-preview');
  if (!el) return;
  const titleEl = root.querySelector('#reu-title');
  const previous = titleEl ? titleEl.value : '';
  if (titleEl && !previous.trim()) titleEl.value = 'Réunion';
  let parsed;
  try {
    parsed = readReunionForm(root);
  } finally {
    if (titleEl) titleEl.value = previous;
  }
  if (!parsed.ok) {
    el.textContent = parsed.error;
    el.classList.add('is-error');
    return;
  }
  el.classList.remove('is-error');
  el.textContent = reunionPreviewText(parsed.reunion);
}

function reunionAudienceIsSome(reu) {
  return !!(reu && (reu.participants || []).length);
}

function renderReunionParticipantFields(editing) {
  const selected = new Set((editing?.participants) || []);
  const known = new Set(STATE.employees || []);
  const extras = [...selected].filter(n => !known.has(n));
  const names = [...(STATE.employees || []), ...extras];
  if (!names.length) {
    return '<p class="muted">Aucun salarié dans l\'équipe. La réunion concernera toute l\'équipe.</p>';
  }
  return names.map((name, index) => {
    const id = `reu-part-${index}`;
    const checked = selected.has(name) ? 'checked' : '';
    return `<label class="reunion-participant" for="${id}">
      <input type="checkbox" id="${id}" value="${escapeHtml(name)}" ${checked}>
      <span>${escapeHtml(name)}</span>
    </label>`;
  }).join('');
}

function renderWeekdayOptions(selected) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map(day => {
    const sel = day === selected ? 'selected' : '';
    return `<option value="${day}" ${sel}>${DAY_NAMES_LONG[day]}</option>`;
  }).join('');
}

function renderNthOptions(selected) {
  const options = [
    [1, 'Le 1er'],
    [2, 'Le 2e'],
    [3, 'Le 3e'],
    [4, 'Le 4e'],
    [-1, 'Le dernier'],
  ];
  return options.map(([value, label]) => {
    const sel = value === selected ? 'selected' : '';
    return `<option value="${value}" ${sel}>${label}</option>`;
  }).join('');
}

function createWeekReunionsStrip(days) {
  if (!days?.length || typeof reunionsOnDate !== 'function') return null;
  const fromIso = toISO(days[0]);
  const toIso = toISO(days[days.length - 1]);
  const occurrences = collectReunionOccurrences(fromIso, toIso);
  if (!occurrences.length) return null;
  const shown = occurrences.slice(0, 12);
  const extra = occurrences.length - shown.length;
  const strip = document.createElement('div');
  strip.className = 'week-reunions-strip no-print';
  const items = shown.map(({ date, reunion }) => {
    const time = reunionTimeLabel(reunion);
    const who = (reunion.participants || []).length
      ? `<span class="muted">${escapeHtml(reunionParticipantsLabel(reunion))}</span>`
      : '';
    const place = reunion.place ? `<span class="muted">${escapeHtml(reunion.place)}</span>` : '';
    return `<li>
      <span class="reunion-badge ${reunion.kind}">${reunion.kind === 'periodique' ? 'Périodique' : 'Sporadique'}</span>
      <strong>${escapeHtml(formatReunionDayChip(date))}</strong>
      ${time ? `<span>${escapeHtml(time)}</span>` : ''}
      <span>${escapeHtml(reunion.title)}</span>
      ${place}
      ${who}
    </li>`;
  }).join('');
  strip.innerHTML = `
    <div class="week-reunions-strip-head">
      <span>Réunions sur cette période</span>
      <button type="button" class="nav" id="wk-reunions-open">Ouvrir les réunions</button>
    </div>
    <ul class="week-reunions-list">${items}</ul>
    ${extra > 0 ? `<p class="muted">Et ${extra} autre${extra > 1 ? 's' : ''} sur la période.</p>` : ''}`;
  strip.querySelector('#wk-reunions-open').onclick = () => {
    if (typeof goToTab === 'function') goToTab('reunions');
  };
  return strip;
}

function renderReunionsEditor(root) {
  ensureReunions(STATE);
  const editable = typeof canEditPlanning !== 'function' || canEditPlanning();
  const today = todayISO();
  let editing = (STATE.reunions || []).find(r => r.id === STATE.ui.reunionEditId) || null;
  if (STATE.ui.reunionEditId && !editing) STATE.ui.reunionEditId = '';
  if (!editable) editing = null;

  const ctrl = document.createElement('div');
  ctrl.className = 'controls';
  ctrl.innerHTML = `
    <div class="label">Réunions</div>
    <div class="help-text">
      Une réunion <strong>sporadique</strong> n'a lieu qu'une fois.
      Une réunion <strong>périodique</strong> revient chaque semaine, toutes les 2 semaines, ou chaque mois.
      Les deux apparaissent dans la vue Semaine.
    </div>`;
  root.appendChild(ctrl);

  if (!editable) {
    const note = document.createElement('p');
    note.className = 'muted reunion-readonly-note';
    note.textContent = 'Consultation seule — l\'administrateur ajoute et modifie les réunions.';
    root.appendChild(note);
  }

  if (editable) {
    const kind = editing?.kind || 'sporadique';
    const dateIso = editing?.kind === 'sporadique' ? editing.date : today;
    const startIso = editing?.kind === 'periodique' ? editing.startDate : today;
    const endIso = editing?.kind === 'periodique' ? (editing.endDate || '') : '';
    const weekday = editing?.kind === 'periodique' ? editing.weekday : fromISO(today).getDay();
    const freq = editing?.freq || 'weekly';
    const monthlyMode = editing?.monthlyMode || 'nth';
    const nth = editing?.nth || 1;
    const dayOfMonth = editing?.dayOfMonth || fromISO(startIso).getDate();
    const startTime = editing?.startTime || '13:00';
    const endTime = editing?.endTime || '14:00';
    const audienceSome = reunionAudienceIsSome(editing);
    const form = document.createElement('div');
    form.className = 'form-card';
    form.id = 'reu-form';
    form.innerHTML = `
      <h3>${editing ? 'Modifier la réunion' : 'Nouvelle réunion'}</h3>
      <input type="hidden" id="reu-id" value="${escapeHtml(editing?.id || '')}">
      <div class="reunion-kind" role="group" aria-label="Type de réunion">
        <button type="button" class="reunion-kind-btn${kind === 'sporadique' ? ' active' : ''}" data-kind="sporadique" aria-pressed="${kind === 'sporadique'}">Sporadique</button>
        <button type="button" class="reunion-kind-btn${kind === 'periodique' ? ' active' : ''}" data-kind="periodique" aria-pressed="${kind === 'periodique'}">Périodique</button>
      </div>
      <p class="muted" id="reu-kind-hint"></p>
      <div class="form-grid reunion-form-grid">
        <div class="field reunion-span-all">
          <label for="reu-title">Titre</label>
          <input type="text" id="reu-title" maxlength="${REUNION_TITLE_MAX}" placeholder="ex. Réunion d'équipe" value="${escapeHtml(editing?.title || '')}">
        </div>
        <div class="field" data-reu-show="sporadique">
          <label for="reu-date">Date</label>
          <input type="text" class="fr-date" id="reu-date" data-iso="${dateIso}" value="${frFormatNumeric(dateIso)}">
        </div>
        <div class="field" data-reu-show="periodique">
          <label for="reu-freq">Rythme</label>
          <select id="reu-freq">
            <option value="weekly" ${freq === 'weekly' ? 'selected' : ''}>Chaque semaine</option>
            <option value="biweekly" ${freq === 'biweekly' ? 'selected' : ''}>Toutes les 2 semaines</option>
            <option value="monthly" ${freq === 'monthly' ? 'selected' : ''}>Chaque mois</option>
          </select>
        </div>
        <div class="field" data-reu-field="monthly-mode">
          <label for="reu-monthly-mode">Chaque mois</label>
          <select id="reu-monthly-mode">
            <option value="nth" ${monthlyMode === 'nth' ? 'selected' : ''}>Un jour de la semaine</option>
            <option value="dom" ${monthlyMode === 'dom' ? 'selected' : ''}>Un jour du mois</option>
          </select>
        </div>
        <div class="field" data-reu-field="weekday">
          <label for="reu-weekday">Jour</label>
          <select id="reu-weekday">${renderWeekdayOptions(weekday)}</select>
        </div>
        <div class="field" data-reu-field="nth">
          <label for="reu-nth">Lequel</label>
          <select id="reu-nth">${renderNthOptions(nth)}</select>
        </div>
        <div class="field" data-reu-field="dom">
          <label for="reu-dom">Jour du mois</label>
          <input type="number" id="reu-dom" min="1" max="31" value="${dayOfMonth}">
        </div>
        <div class="field" data-reu-show="periodique">
          <label for="reu-start">À partir du</label>
          <input type="text" class="fr-date" id="reu-start" data-iso="${startIso}" value="${frFormatNumeric(startIso)}">
        </div>
        <div class="field" data-reu-show="periodique">
          <label for="reu-end">Jusqu'au</label>
          <input type="text" class="fr-date" id="reu-end" data-iso="${endIso}" value="${endIso ? frFormatNumeric(endIso) : ''}" placeholder="sans fin">
        </div>
        <div class="field">
          <label for="reu-start-time">Début</label>
          <input type="text" id="reu-start-time" inputmode="numeric" placeholder="13:00" value="${escapeHtml(startTime)}">
        </div>
        <div class="field">
          <label for="reu-end-time">Fin</label>
          <input type="text" id="reu-end-time" inputmode="numeric" placeholder="14:00" value="${escapeHtml(endTime)}">
        </div>
        <div class="field reunion-span-all">
          <label for="reu-place">Lieu</label>
          <input type="text" id="reu-place" maxlength="80" placeholder="ex. réserve, officine" value="${escapeHtml(editing?.place || '')}">
        </div>
        <div class="field reunion-span-all">
          <label>Participants</label>
          <div class="reunion-audience">
            <label><input type="radio" name="reu-audience" value="all" ${audienceSome ? '' : 'checked'}> Toute l'équipe</label>
            <label><input type="radio" name="reu-audience" value="some" ${audienceSome ? 'checked' : ''}> Certains salariés</label>
          </div>
          <div class="reunion-participants" id="reu-participants" ${audienceSome ? '' : 'hidden'}>
            ${renderReunionParticipantFields(editing)}
          </div>
        </div>
        <div class="field reunion-span-all">
          <label for="reu-note">Note</label>
          <textarea id="reu-note" rows="2" maxlength="400" placeholder="Ordre du jour, lien, précision…">${escapeHtml(editing?.note || '')}</textarea>
        </div>
      </div>
      <p class="reunion-preview" id="reu-preview"></p>
      <div class="reunion-form-actions">
        <button type="button" class="primary" id="reu-save">Ajouter la réunion</button>
        <button type="button" class="nav" id="reu-cancel" ${editing ? '' : 'hidden'}>Annuler</button>
      </div>`;
    root.appendChild(form);

    const refresh = () => {
      syncReunionFormVisibility(form);
      updateReunionPreview(form);
    };
    form.querySelectorAll('.reunion-kind-btn').forEach(btn => {
      btn.onclick = () => {
        form.querySelectorAll('.reunion-kind-btn').forEach(other => {
          const on = other === btn;
          other.classList.toggle('active', on);
          other.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        refresh();
      };
    });
    form.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', refresh);
      el.addEventListener('change', refresh);
    });
    form.addEventListener('frdate-select', refresh);
    form.querySelectorAll('input[name="reu-audience"]').forEach(el => {
      el.addEventListener('change', () => {
        const some = form.querySelector('input[name="reu-audience"]:checked')?.value === 'some';
        const box = form.querySelector('#reu-participants');
        if (box) box.hidden = !some;
        refresh();
      });
    });
    form.querySelector('#reu-save').onclick = () => {
      const parsed = readReunionForm(form);
      if (!parsed.ok) {
        toast(parsed.error, true);
        updateReunionPreview(form);
        return;
      }
      const wasUpdate = !!(parsed.reunion.id && (STATE.reunions || []).some(r => r.id === parsed.reunion.id));
      const result = upsertReunion(parsed.reunion);
      if (!result.ok) {
        toast(result.error, true);
        return;
      }
      STATE.ui.reunionEditId = '';
      persistAndRender();
      toast(wasUpdate ? 'Réunion mise à jour' : 'Réunion ajoutée');
    };
    const cancel = form.querySelector('#reu-cancel');
    if (cancel) {
      cancel.onclick = () => {
        STATE.ui.reunionEditId = '';
        persistAndRender({ skipCloud: true });
      };
    }
    refresh();
    if (editing) {
      requestAnimationFrame(() => form.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  const upcoming = collectReunionOccurrences(today, toISO(addDays(fromISO(today), REUNION_UPCOMING_DAYS - 1)));
  const soon = document.createElement('div');
  soon.className = 'form-card';
  let soonHtml = `<h3>À venir — 8 semaines (${upcoming.length})</h3>`;
  if (!upcoming.length) {
    soonHtml += '<p class="muted">Aucune réunion sur les 8 prochaines semaines.</p>';
  } else {
    soonHtml += `<div class="reunion-table-wrap"><table class="list"><thead><tr>
      <th>Date</th><th>Horaire</th><th>Titre</th><th>Type</th><th>Participants</th><th>Lieu</th>
    </tr></thead><tbody>`;
    for (const item of upcoming) {
      const reu = item.reunion;
      const d = fromISO(item.date);
      soonHtml += `<tr>
        <td>${DAY_NAMES_ABBR[d.getDay()]} ${frFormatNumeric(item.date)}</td>
        <td>${escapeHtml(reunionTimeLabel(reu) || '—')}</td>
        <td><strong>${escapeHtml(reu.title)}</strong>${reu.note ? `<div class="muted">${escapeHtml(reu.note)}</div>` : ''}</td>
        <td><span class="reunion-badge ${reu.kind}">${reu.kind === 'periodique' ? 'Périodique' : 'Sporadique'}</span></td>
        <td>${escapeHtml(reunionParticipantsLabel(reu))}</td>
        <td>${escapeHtml(reu.place || '—')}</td>
      </tr>`;
    }
    soonHtml += '</tbody></table></div>';
  }
  soon.innerHTML = soonHtml;
  root.appendChild(soon);

  const catalog = sortReunionsForCatalog(STATE.reunions || []);
  const listCard = document.createElement('div');
  listCard.className = 'form-card';
  const filter = ['all', 'periodique', 'sporadique'].includes(STATE.ui.reunionFilter)
    ? STATE.ui.reunionFilter
    : 'all';
  let listHtml = `<h3>Réunions enregistrées (${catalog.length})</h3>`;
  if (!catalog.length) {
    listHtml += '<p class="muted">Aucune réunion pour l\'instant.</p>';
  } else {
    listHtml += `
      <div class="reunion-filters" role="group" aria-label="Filtrer les réunions">
        <button type="button" data-reu-filter="all" class="${filter === 'all' ? 'active' : ''}">Toutes</button>
        <button type="button" data-reu-filter="periodique" class="${filter === 'periodique' ? 'active' : ''}">Périodiques</button>
        <button type="button" data-reu-filter="sporadique" class="${filter === 'sporadique' ? 'active' : ''}">Sporadiques</button>
      </div>
      <p class="muted" id="reu-filter-empty" hidden>Aucune réunion dans ce filtre.</p>
      <div class="reunion-table-wrap"><table class="list"><thead><tr>
        <th>Titre</th><th>Type</th><th>Quand</th><th>Horaire</th><th>Participants</th><th>Prochaine</th>${editable ? '<th></th>' : ''}
      </tr></thead><tbody>`;
    for (const reu of catalog) {
      const next = nextReunionDate(reu, today);
      const when = reu.kind === 'sporadique'
        ? frFormatNumeric(reu.date)
        : reunionRhythmLabel(reu);
      const nextLabel = next
        ? frFormatNumeric(next)
        : (reu.kind === 'sporadique' ? 'Passée' : 'Terminée');
      const editingRow = editing && editing.id === reu.id ? ' is-editing' : '';
      listHtml += `<tr data-reu-kind="${reu.kind}" class="${editingRow.trim()}">
        <td><strong>${escapeHtml(reu.title)}</strong>${reu.place ? `<div class="muted">${escapeHtml(reu.place)}</div>` : ''}</td>
        <td><span class="reunion-badge ${reu.kind}">${reu.kind === 'periodique' ? 'Périodique' : 'Sporadique'}</span></td>
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(reunionTimeLabel(reu) || '—')}</td>
        <td>${escapeHtml(reunionParticipantsLabel(reu))}</td>
        <td>${nextLabel}</td>
        ${editable ? `<td class="reunion-row-actions">
          <button type="button" class="nav" data-reu-edit="${escapeHtml(reu.id)}">Modifier</button>
          <button type="button" class="del" data-reu-rm="${escapeHtml(reu.id)}">Retirer</button>
        </td>` : ''}
      </tr>`;
    }
    listHtml += '</tbody></table></div>';
  }
  listCard.innerHTML = listHtml;
  root.appendChild(listCard);

  const applyFilter = () => {
    const current = STATE.ui.reunionFilter || 'all';
    listCard.querySelectorAll('[data-reu-filter]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.reuFilter === current);
    });
    const rows = [...listCard.querySelectorAll('tr[data-reu-kind]')];
    rows.forEach(row => {
      row.hidden = current !== 'all' && row.dataset.reuKind !== current;
    });
    const empty = listCard.querySelector('#reu-filter-empty');
    if (empty) empty.hidden = rows.some(row => !row.hidden);
  };
  listCard.querySelectorAll('[data-reu-filter]').forEach(btn => {
    btn.onclick = () => {
      STATE.ui.reunionFilter = btn.dataset.reuFilter;
      saveState();
      applyFilter();
    };
  });
  applyFilter();

  if (editable) {
    listCard.querySelectorAll('[data-reu-edit]').forEach(btn => {
      btn.onclick = () => {
        STATE.ui.reunionEditId = btn.dataset.reuEdit;
        persistAndRender({ skipCloud: true });
      };
    });
    listCard.querySelectorAll('[data-reu-rm]').forEach(btn => {
      btn.onclick = () => {
        const reu = (STATE.reunions || []).find(r => r.id === btn.dataset.reuRm);
        const label = reu ? `« ${reu.title} »` : 'cette réunion';
        if (!confirm(`Retirer ${label} ?`)) return;
        removeReunion(btn.dataset.reuRm);
        if (STATE.ui.reunionEditId === btn.dataset.reuRm) STATE.ui.reunionEditId = '';
        persistAndRender();
        toast('Réunion retirée');
      };
    });
  }
}
