/* Éditeurs patterns, affectations, congés, fériés */
'use strict';

const PATTERN_DAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

const PATTERN_CONCEPT_NOTE = `
  <p class="pattern-concept-lead">
    Le <strong>planning</strong> (onglet Semaine) est d'abord un <strong>calendrier vierge</strong>.
    Le <strong>pattern</strong>, c'est le modèle — comme un <strong>tampon</strong> avec l'empreinte
    des horaires de travail habituels de chaque salarié. Vous le préparez ici, puis vous l'« estampez »
    sur le calendrier via <em>Importer le cycle vers le planning</em>.
  </p>`;

function patternEscapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPatternsEditor(root) {
  const layout = STATE.ui.patternLayout || 'unified';
  const patternEmps = STATE.employees.slice();
  const defaultStart = STATE.ui.patternImportStart || toISO(getPatternAnchorMonday());
  const defaultEnd = STATE.ui.patternImportEnd || INITIAL_DATA.planningEnd;
  const anchorSummary = getPatternAnchorSummary();
  const cycleWeeks = getPatternCycleWeekCount();
  const cycleLabel = getPatternCycleWeeksLabel();
  const cycleWeekOptions = Array.from(
    { length: PATTERN_CYCLE_WEEKS_MAX - PATTERN_CYCLE_WEEKS_MIN + 1 },
    (_, i) => {
      const n = i + PATTERN_CYCLE_WEEKS_MIN;
      return `<option value="${n}"${n === cycleWeeks ? ' selected' : ''}>${n} semaine${n > 1 ? 's' : ''}</option>`;
    }
  ).join('');

  const ctrl = document.createElement('div');
  ctrl.className = 'controls pattern-controls';
  ctrl.innerHTML = `
    <div class="label">Modèle de cycle — ${cycleWeeks} semaine${cycleWeeks > 1 ? 's' : ''}</div>
    <div class="pattern-concept-note">${PATTERN_CONCEPT_NOTE}</div>
    <div class="help-text">
      Modèle indépendant du planning affiché : chaque salarié, demi-journées M/A,
      <b>${cycleWeeks} semaine${cycleWeeks > 1 ? 's' : ''}-types</b>
      (<b>${cycleLabel}</b>). Clic = plein ↔ repos · clic droit = orange → rouge → vert
      (horaires demandés sur orange/rouge) · double-clic sur orange/rouge = modifier les horaires.
      Les cases affichent la durée calculée (ex. 5,5).
      Tous les salariés sont listés ici (filtres latéraux ignorés).
      L'ancrage sert <b>uniquement à l'import</b> : S1 = semaine ISO ${anchorSummary.isoWeek} (${anchorSummary.isoYear}), lundi ${anchorSummary.anchorLabel}.
    </div>
    <div class="spacer"></div>
    <label>Durée du cycle :
      <select id="pat-cycle-weeks">${cycleWeekOptions}</select>
    </label>
    <label>Affichage :
      <select id="pat-layout">
        <option value="unified" ${layout === 'unified' ? 'selected' : ''}>1 tableau — ${cycleWeeks} semaines</option>
        <option value="split" ${layout === 'split' ? 'selected' : ''}>${cycleWeeks} tableaux — 1 par semaine</option>
      </select>
    </label>
  `;
  root.appendChild(ctrl);

  ctrl.querySelector('#pat-cycle-weeks').onchange = (e) => {
    const n = parseInt(e.target.value, 10);
    if (!Number.isFinite(n)) return;
    setPatternCycleWeekCount(n);
    saveState();
    toast(`Cycle modifié : ${n} semaine${n > 1 ? 's' : ''} (${getPatternCycleWeeksLabel()}).`);
    persistAndRender();
  };

  mountPatternShiftDefaultsPanel(root);
  mountPatternAnchorPanel(root);

  const importPanel = document.createElement('div');
  importPanel.className = 'form-card pattern-import-panel no-print';
  importPanel.innerHTML = `
    <h3>Importer le cycle vers le planning</h3>
    <p class="muted">
      Recopie les ${getPatternCycleWeekCount()} semaines-types (${getPatternCycleWeeksLabel()}) sur une période calendaire, pour tous les salariés,
      selon l'ancrage défini ci-dessus. Les cellules existantes peuvent être écrasées ou conservées.
    </p>
    <div class="form-grid pattern-import-grid">
      <label>Du <input type="text" class="fr-date" id="pat-import-start" data-iso="${defaultStart}" value="${frFormatNumeric(defaultStart)}"></label>
      <label>Au <input type="text" class="fr-date" id="pat-import-end" data-iso="${defaultEnd}" value="${frFormatNumeric(defaultEnd)}"></label>
      <button type="button" class="primary" id="pat-import-run">↓ Importer sur la période</button>
    </div>
  `;
  root.appendChild(importPanel);
  attachPatternPeriodImportHandlers(importPanel);

  if (patternEmps.length > 0) {
    mountPatternCopyPanel(root, patternEmps);
  }

  if (patternEmps.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'muted';
    msg.textContent = 'Aucun salarié dans l\'équipe. Ajoutez des salariés dans l\'onglet Équipe.';
    root.appendChild(msg);
    $('#pat-layout').onchange = (e) => {
      STATE.ui.patternLayout = e.target.value;
      persistAndRender();
    };
    return;
  }

  if (layout === 'split') {
    renderPatternsSplit(root, patternEmps);
  } else {
    renderPatternsUnified(root, patternEmps);
  }

  $('#pat-layout').onchange = (e) => {
    STATE.ui.patternLayout = e.target.value;
    persistAndRender();
  };
}

function mountPatternShiftDefaultsPanel(root) {
  ensurePatternShiftDefaults(STATE);
  ensurePatternShiftDefaultsSaturday(STATE);
  const d = STATE.patternShiftDefaults;
  const sat = STATE.patternShiftDefaultsSaturday;
  const matinH = hoursBetweenTimes(d.matin.start, d.matin.end);
  const apremH = hoursBetweenTimes(d.aprem.start, d.aprem.end);
  const satMatinH = hoursBetweenTimes(sat.matin.start, sat.matin.end);
  const panel = document.createElement('div');
  panel.className = 'form-card pattern-hours-defaults no-print';
  panel.innerHTML = `
    <h3>Horaires par demi-journée (défaut)</h3>
    <p class="muted">
      Indiquez l'heure de début et de fin pour chaque demi-journée — la durée est calculée automatiquement.
      Les cases orange et rouge peuvent avoir des horaires propres (clic droit ou double-clic).
    </p>
    <div class="pattern-hours-day-section">
      <div class="pattern-hours-day-section-title">Lundi → vendredi</div>
      <div class="pattern-hours-shifts">
        <div class="pattern-hours-shift-block">
          <div class="pattern-hours-shift-title">Matin</div>
          <div class="pattern-hours-grid">
            <label>Début
              <input type="text" id="pat-def-matin-start" placeholder="8h00" value="${formatPatternTime(d.matin.start)}">
            </label>
            <label>Fin
              <input type="text" id="pat-def-matin-end" placeholder="12h30" value="${formatPatternTime(d.matin.end)}">
            </label>
            <span class="pattern-hours-computed" id="pat-def-matin-hours">= ${formatContractHours(matinH)} h</span>
          </div>
        </div>
        <div class="pattern-hours-shift-block">
          <div class="pattern-hours-shift-title">Après-midi</div>
          <div class="pattern-hours-grid">
            <label>Début
              <input type="text" id="pat-def-aprem-start" placeholder="14h00" value="${formatPatternTime(d.aprem.start)}">
            </label>
            <label>Fin
              <input type="text" id="pat-def-aprem-end" placeholder="19h30" value="${formatPatternTime(d.aprem.end)}">
            </label>
            <span class="pattern-hours-computed" id="pat-def-aprem-hours">= ${formatContractHours(apremH)} h</span>
          </div>
        </div>
      </div>
    </div>
    <div class="pattern-hours-day-section">
      <div class="pattern-hours-day-section-title">Samedi</div>
      <p class="muted">Le samedi après-midi n'est pas travaillé.</p>
      <div class="pattern-hours-shifts">
        <div class="pattern-hours-shift-block">
          <div class="pattern-hours-shift-title">Matin</div>
          <div class="pattern-hours-grid">
            <label>Début
              <input type="text" id="pat-def-sat-matin-start" placeholder="8h30" value="${formatPatternTime(sat.matin.start)}">
            </label>
            <label>Fin
              <input type="text" id="pat-def-sat-matin-end" placeholder="12h30" value="${formatPatternTime(sat.matin.end)}">
            </label>
            <span class="pattern-hours-computed" id="pat-def-sat-matin-hours">= ${formatContractHours(satMatinH)} h</span>
          </div>
        </div>
      </div>
    </div>`;
  root.appendChild(panel);

  const fieldGroups = [
    { prefix: 'pat-def', store: 'weekday', shifts: ['matin', 'aprem'] },
    { prefix: 'pat-def-sat', store: 'saturday', shifts: ['matin'] },
  ];

  const updatePreview = (prefix, shift) => {
    const startEl = panel.querySelector(`#${prefix}-${shift}-start`);
    const endEl = panel.querySelector(`#${prefix}-${shift}-end`);
    const hoursEl = panel.querySelector(`#${prefix}-${shift}-hours`);
    const h = hoursBetweenTimes(startEl.value, endEl.value);
    hoursEl.textContent = h != null ? `= ${formatContractHours(h)} h` : '= — h';
    hoursEl.classList.toggle('invalid', h == null);
  };

  const readGroup = (prefix, shifts) => {
    const pending = {};
    for (const shift of shifts) {
      const start = panel.querySelector(`#${prefix}-${shift}-start`).value;
      const end = panel.querySelector(`#${prefix}-${shift}-end`).value;
      const s = normalizeTimeInput(start);
      const e = normalizeTimeInput(end);
      if (!s || !e || hoursBetweenTimes(s, e) == null) return null;
      pending[shift] = { start: s, end: e };
    }
    return pending;
  };

  const resetGroupInputs = (prefix, shifts, slots) => {
    for (const shift of shifts) {
      const slot = slots[shift];
      panel.querySelector(`#${prefix}-${shift}-start`).value = formatPatternTime(slot.start);
      panel.querySelector(`#${prefix}-${shift}-end`).value = formatPatternTime(slot.end);
      updatePreview(prefix, shift);
    }
  };

  const saveDefaults = () => {
    const weekday = readGroup('pat-def', ['matin', 'aprem']);
    if (!weekday) {
      toast('Horaires semaine invalides (ex. 8h00 → 12h30).', true);
      resetGroupInputs('pat-def', ['matin', 'aprem'], STATE.patternShiftDefaults);
      return;
    }
    const saturday = readGroup('pat-def-sat', ['matin']);
    if (!saturday) {
      toast('Horaires samedi invalides (ex. 8h30 → 12h30).', true);
      resetGroupInputs('pat-def-sat', ['matin'], STATE.patternShiftDefaultsSaturday);
      return;
    }
    STATE.patternShiftDefaults = weekday;
    STATE.patternShiftDefaultsSaturday = {
      matin: saturday.matin,
      aprem: STATE.patternShiftDefaultsSaturday.aprem,
    };
    resetGroupInputs('pat-def', ['matin', 'aprem'], weekday);
    resetGroupInputs('pat-def-sat', ['matin'], saturday);
    saveState();
    persistAndRender();
  };

  for (const group of fieldGroups) {
    for (const shift of group.shifts) {
      const prefix = group.prefix;
      panel.querySelector(`#${prefix}-${shift}-start`).addEventListener('input', () => updatePreview(prefix, shift));
      panel.querySelector(`#${prefix}-${shift}-end`).addEventListener('input', () => updatePreview(prefix, shift));
      panel.querySelector(`#${prefix}-${shift}-start`).addEventListener('change', saveDefaults);
      panel.querySelector(`#${prefix}-${shift}-end`).addEventListener('change', saveDefaults);
    }
  }
}

function mountPatternCopyPanel(root, patternEmps) {
  const weekNames = getPatternCycleWeeks();
  const src = weekNames.includes(STATE.ui.patternCopySrc) ? STATE.ui.patternCopySrc : weekNames[0];
  const dst = weekNames.includes(STATE.ui.patternCopyDst) ? STATE.ui.patternCopyDst : (weekNames[1] || weekNames[0]);

  const weekOptions = (selected) => weekNames
    .map((w) => `<option value="${patternEscapeAttr(w)}" ${w === selected ? 'selected' : ''}>${escapeHtml(w)}</option>`)
    .join('');

  const empChecks = patternEmps.map((emp) => `
    <label class="pattern-copy-emp-item">
      <input type="checkbox" class="pat-copy-emp" value="${patternEscapeAttr(emp)}" checked>
      <span>${escapeHtml(emp)}</span>
    </label>`).join('');

  const panel = document.createElement('div');
  panel.className = 'form-card pattern-copy-panel no-print';
  panel.innerHTML = `
    <h3>Copier une semaine-type</h3>
    <p class="muted">Recopie les présences et horaires d'une semaine-type vers une autre, pour les salariés sélectionnés.</p>
    <div class="pattern-copy-grid">
      <label>Copier <select id="pat-copy-src">${weekOptions(src)}</select></label>
      <label>vers <select id="pat-copy-dst">${weekOptions(dst)}</select></label>
      <button type="button" class="primary" id="pat-copy-run">Copier la semaine</button>
    </div>
    <div class="pattern-copy-emps">
      <div class="pattern-copy-emps-head">
        <span>Salariés concernés :</span>
        <button type="button" class="link-btn" id="pat-copy-all">Tous</button>
        <button type="button" class="link-btn" id="pat-copy-none">Aucun</button>
      </div>
      <div class="pattern-copy-emps-list">${empChecks}</div>
    </div>`;
  root.appendChild(panel);

  const srcSel = panel.querySelector('#pat-copy-src');
  const dstSel = panel.querySelector('#pat-copy-dst');

  srcSel.onchange = () => { STATE.ui.patternCopySrc = srcSel.value; saveState(); };
  dstSel.onchange = () => { STATE.ui.patternCopyDst = dstSel.value; saveState(); };

  panel.querySelector('#pat-copy-all').onclick = () => {
    panel.querySelectorAll('.pat-copy-emp').forEach((c) => { c.checked = true; });
  };
  panel.querySelector('#pat-copy-none').onclick = () => {
    panel.querySelectorAll('.pat-copy-emp').forEach((c) => { c.checked = false; });
  };

  panel.querySelector('#pat-copy-run').onclick = () => {
    const from = srcSel.value;
    const to = dstSel.value;
    if (from === to) { toast('Choisissez deux semaines différentes.', true); return; }
    const emps = [...panel.querySelectorAll('.pat-copy-emp:checked')].map((c) => c.value);
    if (!emps.length) { toast('Sélectionnez au moins un salarié.', true); return; }

    let n = 0;
    for (const emp of emps) {
      if (copyPatternWeekForEmployee(emp, from, to)) n++;
    }
    STATE.ui.patternCopySrc = from;
    STATE.ui.patternCopyDst = to;
    saveState();
    persistAndRender();
    toast(`${from} copiée vers ${to} pour ${n} salarié(s).`);
  };
}

function promptShiftSlotDialog({ title, subtitle, slot, defSlot, onSave, onClear, onDone }) {
  const old = document.querySelector('.import-dialog-overlay');
  if (old) old.remove();

  const currentH = hoursBetweenTimes(slot.start, slot.end);
  const defH = hoursBetweenTimes(defSlot.start, defSlot.end);

  const overlay = document.createElement('div');
  overlay.className = 'import-dialog-overlay';
  overlay.innerHTML = `
    <div class="import-dialog pattern-hours-dialog" role="dialog">
      <h3>${title}</h3>
      <p class="muted">${subtitle}</p>
      <div class="pattern-hours-grid pattern-hours-dialog-grid">
        <label class="pattern-hours-field">Début
          <input type="text" id="slot-cell-start" placeholder="14h00" value="${formatPatternTime(slot.start)}">
        </label>
        <label class="pattern-hours-field">Fin
          <input type="text" id="slot-cell-end" placeholder="19h30" value="${formatPatternTime(slot.end)}">
        </label>
      </div>
      <p class="pattern-hours-hint" id="slot-cell-hours-preview">Durée : ${formatContractHours(currentH)} h</p>
      <p class="muted pattern-hours-hint">Défaut : ${formatPatternTime(defSlot.start)} → ${formatPatternTime(defSlot.end)} (${formatContractHours(defH)} h)</p>
      <div class="import-dialog-btns">
        <button type="button" class="primary" data-act="ok">Enregistrer</button>
        <button type="button" class="nav" data-act="default">Utiliser le défaut</button>
        <button type="button" class="nav muted-btn" data-act="cancel">Annuler</button>
      </div>
    </div>`;

  const close = () => overlay.remove();
  const finish = () => {
    close();
    if (onDone) onDone();
  };

  const updatePreview = () => {
    const h = hoursBetweenTimes(
      overlay.querySelector('#slot-cell-start').value,
      overlay.querySelector('#slot-cell-end').value
    );
    const el = overlay.querySelector('#slot-cell-hours-preview');
    el.textContent = h != null ? `Durée : ${formatContractHours(h)} h` : 'Durée invalide (fin après début)';
    el.classList.toggle('invalid', h == null);
    return h;
  };

  overlay.querySelector('#slot-cell-start').addEventListener('input', updatePreview);
  overlay.querySelector('#slot-cell-end').addEventListener('input', updatePreview);

  overlay.querySelector('[data-act="ok"]').onclick = () => {
    const start = overlay.querySelector('#slot-cell-start').value;
    const end = overlay.querySelector('#slot-cell-end').value;
    if (!onSave(start, end)) {
      toast('Horaires invalides (ex. départ à 17h30 au lieu de 19h30).', true);
      return;
    }
    saveState();
    close();
    if (onDone) onDone();
  };

  overlay.querySelector('[data-act="default"]').onclick = () => {
    if (onClear) onClear();
    saveState();
    close();
    if (onDone) onDone();
  };

  overlay.querySelector('[data-act="cancel"]').onclick = finish;
  overlay.onclick = (e) => {
    if (e.target === overlay) finish();
  };

  const onKey = (e) => {
    if (e.key === 'Enter') overlay.querySelector('[data-act="ok"]').click();
    if (e.key === 'Escape') finish();
  };
  overlay.querySelector('#slot-cell-start').addEventListener('keydown', onKey);
  overlay.querySelector('#slot-cell-end').addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  overlay.querySelector('#slot-cell-start').focus();
  overlay.querySelector('#slot-cell-start').select();
}

function promptPatternCellHours({ emp, pname, dayIdx, shift, onDone }) {
  const shiftLabel = shift === 'matin' ? 'Matin' : 'Après-midi';
  const dayLabel = PATTERN_DAY_LABELS[dayIdx];
  promptShiftSlotDialog({
    title: `Horaires — ${patternEscapeAttr(emp)}`,
    subtitle: `${dayLabel} ${shiftLabel} · semaine ${patternEscapeAttr(pname)}`,
    slot: getPatternCellSlot(emp, pname, dayIdx, shift),
    defSlot: getPatternShiftDefaultSlot(shift, STATE, dayIdx),
    onSave: (start, end) => setPatternCellSlot(emp, pname, dayIdx, shift, start, end),
    onClear: () => clearPatternCellSlot(emp, pname, dayIdx, shift),
    onDone,
  });
}

function promptPlanningCellHours({ emp, iso, shift, onDone }) {
  const shiftLabel = shift === 'matin' ? 'Matin' : 'Après-midi';
  const d = fromISO(iso);
  const dayIdx = weekDayIndex(d);
  const dayLabel = DAY_NAMES_ABBR[d.getDay()];
  promptShiftSlotDialog({
    title: `Horaires — ${patternEscapeAttr(emp)}`,
    subtitle: `${dayLabel} ${frFormat(d)} · ${shiftLabel}`,
    slot: getPlanningCellSlot(emp, iso, shift),
    defSlot: getPatternShiftDefaultSlot(shift, STATE, dayIdx),
    onSave: (start, end) => setPlanningCellSlot(emp, iso, shift, start, end),
    onClear: () => clearPlanningCellSlot(emp, iso, shift),
    onDone,
  });
}

function renderPatternEditorCell(emp, pname, dayIdx, shift, weekBoundary) {
  const v = getPatternWeekValue(emp, pname, dayIdx, shift);
  const shiftCls = shift === 'matin' ? 'shift-matin' : 'shift-aprem';
  const cls = ['cell', 'editable', 'pattern-cell', patternCellDisplayClass(v), shiftCls];
  if (weekBoundary && shift === 'matin') cls.push('week-start');
  const shiftLabel = shift === 'matin' ? 'Matin' : 'Après-midi';
  let title = `${emp} — semaine ${pname} — ${PATTERN_DAY_LABELS[dayIdx]} — ${shiftLabel}`;
  let inner = '';
  if (isPlanningPresent(v)) {
    const slot = getPatternCellSlot(emp, pname, dayIdx, shift);
    const h = getPatternCellHours(emp, pname, dayIdx, shift);
    title += ` — ${formatPatternTime(slot.start)} → ${formatPatternTime(slot.end)} (${formatContractHours(h)} h)`;
    if (h != null) {
      inner = `<span class="pattern-cell-hours">${formatContractHours(h)}</span>`;
    }
  }
  title += ' — clic : plein ↔ repos · clic droit : orange → rouge → vert';
  if (isPlanningSpecialVal(v)) {
    title += ' · double-clic : modifier les horaires';
  }
  return `<td class="${cls.join(' ')}" data-pat-emp="${patternEscapeAttr(emp)}" data-pat-name="${patternEscapeAttr(pname)}" data-pat-day="${dayIdx}" data-pat-shift="${shift}" title="${patternEscapeAttr(title)}">${inner}</td>`;
}

function buildPatternTableHeader(thead, weekNames, headRows, { showMonthCol = false } = {}) {
  const showM = STATE.ui.filterShift !== 'aprem';
  const showA = STATE.ui.filterShift !== 'matin';
  const colsPerDay = (showM ? 1 : 0) + (showA ? 1 : 0);
  const totalHeadRows = headRows;

  const trWeeks = document.createElement('tr');
  trWeeks.innerHTML = `<th class="empname" rowspan="${totalHeadRows}">Nom</th>`;
  for (const pname of weekNames) {
    trWeeks.innerHTML += `<th class="week-band" colspan="${colsPerDay * 7}">Semaine ${pname}</th>`;
    trWeeks.innerHTML += `<th class="hours-col hours-col-week" rowspan="${totalHeadRows}">H./sem.</th>`;
  }
  if (showMonthCol) {
    trWeeks.innerHTML += `<th class="hours-col hours-col-month" rowspan="${totalHeadRows}" title="Moyenne mensuelle projetée sur le cycle 6 semaines">H./mois</th>`;
  }
  thead.appendChild(trWeeks);

  const trDays = document.createElement('tr');
  weekNames.forEach((pname, weekIdx) => {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const cls = ['day-header', 'day-group'];
      if (weekIdx > 0 && dayIdx === 0) cls.push('week-start');
      trDays.innerHTML += `
        <th class="${cls.join(' ')}" colspan="${colsPerDay}">
          <span class="date-lbl">${PATTERN_DAY_LABELS[dayIdx]}</span>
        </th>`;
    }
  });
  thead.appendChild(trDays);

  const trShifts = document.createElement('tr');
  weekNames.forEach((pname, weekIdx) => {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const weekBoundary = weekIdx > 0 && dayIdx === 0;
      if (showM) trShifts.innerHTML += `<th class="shift-col matin${weekBoundary ? ' week-start' : ''}">M</th>`;
      if (showA) trShifts.innerHTML += `<th class="shift-col">A</th>`;
    }
  });
  thead.appendChild(trShifts);

  return { showM, showA };
}

function buildPatternTableBody(tbody, visibleEmps, weekNames, { showMonthCol = false } = {}) {
  const showM = STATE.ui.filterShift !== 'aprem';
  const showA = STATE.ui.filterShift !== 'matin';

  for (const emp of visibleEmps) {
    const tr = document.createElement('tr');
    tr.className = 'emp-row';
    tr.innerHTML = `<td class="empname" title="${emp}">${shortEmpName(emp)}</td>`;
    weekNames.forEach((pname, weekIdx) => {
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const weekBoundary = weekIdx > 0 && dayIdx === 0;
        if (showM) tr.innerHTML += renderPatternEditorCell(emp, pname, dayIdx, 'matin', weekBoundary);
        else tr.innerHTML += `<td class="cell vide empty shift-matin${weekBoundary ? ' week-start' : ''}" style="opacity:.15"></td>`;
        if (showA) tr.innerHTML += renderPatternEditorCell(emp, pname, dayIdx, 'aprem', weekBoundary);
        else tr.innerHTML += `<td class="cell vide empty shift-aprem" style="opacity:.15"></td>`;
      }
      const weekH = computePatternWeekHours(emp, pname);
      tr.innerHTML += renderHoursTotalCell(weekH, {
        extraClass: 'hours-col-week',
        title: `${emp} — semaine ${pname} — ${formatContractHours(weekH)} h travaillées`,
      });
    });
    if (showMonthCol) {
      const monthH = weekNames.length === getPatternCycleWeekCount()
        ? computePatternMonthlyHours(emp)
        : computePatternWeekMonthlyProjection(emp, weekNames[0]);
      const monthTitle = weekNames.length === getPatternCycleWeekCount()
        ? `${emp} — moyenne mensuelle (cycle ${getPatternCycleWeekCount()} sem.) — ${formatContractHours(monthH)} h`
        : `${emp} — projection mensuelle (sem. ${weekNames[0]}) — ${formatContractHours(monthH)} h`;
      tr.innerHTML += renderHoursTotalCell(monthH, {
        extraClass: 'hours-col-month',
        title: monthTitle,
      });
    }
    tbody.appendChild(tr);
  }
}

function attachPatternCellHandlers(container) {
  container.querySelectorAll('td.pattern-cell[data-pat-emp]').forEach(el => {
    el.onclick = (e) => {
      const emp = el.dataset.patEmp;
      const pname = el.dataset.patName;
      const dayIdx = parseInt(el.dataset.patDay, 10);
      const shift = el.dataset.patShift;
      const cur = getPatternWeekValue(emp, pname, dayIdx, shift);
      setPatternWeekValue(emp, pname, dayIdx, shift, nextPlanningValueOnLeftClick(cur, e));
      persistAndRender();
    };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      const emp = el.dataset.patEmp;
      const pname = el.dataset.patName;
      const dayIdx = parseInt(el.dataset.patDay, 10);
      const shift = el.dataset.patShift;
      const cur = getPatternWeekValue(emp, pname, dayIdx, shift);
      const next = nextPlanningValueOnRightClick(cur);
      setPatternWeekValue(emp, pname, dayIdx, shift, next);
      saveState();
      if (isPlanningSpecialVal(next)) {
        promptPatternCellHours({ emp, pname, dayIdx, shift, onDone: persistAndRender });
      } else {
        persistAndRender();
      }
    };
    el.ondblclick = (e) => {
      e.preventDefault();
      const emp = el.dataset.patEmp;
      const pname = el.dataset.patName;
      const dayIdx = parseInt(el.dataset.patDay, 10);
      const shift = el.dataset.patShift;
      const cur = getPatternWeekValue(emp, pname, dayIdx, shift);
      if (!isPlanningSpecialVal(cur)) return;
      promptPatternCellHours({ emp, pname, dayIdx, shift, onDone: persistAndRender });
    };
  });
}

function renderPatternsUnified(root, visibleEmps) {
  const weekNames = getPatternCycleWeeks();
  const wrap = document.createElement('div');
  wrap.className = 'planning-wrap';
  const tbl = document.createElement('table');
  tbl.className = 'planning';

  const thead = document.createElement('thead');
  buildPatternTableHeader(thead, weekNames, 3, { showMonthCol: true });

  const tbody = document.createElement('tbody');
  buildPatternTableBody(tbody, visibleEmps, weekNames, { showMonthCol: true });

  tbl.appendChild(thead);
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  root.appendChild(wrap);
  attachPatternCellHandlers(wrap);
}

function renderPatternsSplit(root, visibleEmps) {
  const wrap = document.createElement('div');
  wrap.className = 'patterns-split';

  for (const pname of getPatternCycleWeeks()) {
    const card = document.createElement('div');
    card.className = 'form-card pattern-week-card';
    card.innerHTML = `<h3>Semaine-type <span class="pname">${pname}</span></h3>`;

    const inner = document.createElement('div');
    inner.className = 'planning-wrap';
    const tbl = document.createElement('table');
    tbl.className = 'planning';

    const thead = document.createElement('thead');
    buildPatternTableHeader(thead, [pname], 3, { showMonthCol: true });

    const tbody = document.createElement('tbody');
    buildPatternTableBody(tbody, visibleEmps, [pname], { showMonthCol: true });

    tbl.appendChild(thead);
    tbl.appendChild(tbody);
    inner.appendChild(tbl);
    card.appendChild(inner);
    wrap.appendChild(card);
    attachPatternCellHandlers(inner);
  }

  root.appendChild(wrap);
}

function cssId(s) {
  return s.replace(/[^a-zA-Z0-9]/g, '_');
}

function attachPatternPeriodImportHandlers(panel) {
  const startEl = panel.querySelector('#pat-import-start');
  const endEl = panel.querySelector('#pat-import-end');
  const runBtn = panel.querySelector('#pat-import-run');

  const persistDates = () => {
    const startIso = readFrDateInput(startEl);
    const endIso = readFrDateInput(endEl);
    if (startIso) STATE.ui.patternImportStart = startIso;
    if (endIso) STATE.ui.patternImportEnd = endIso;
    saveState();
  };
  startEl.addEventListener('blur', persistDates);
  endEl.addEventListener('blur', persistDates);

  runBtn.onclick = () => {
    const startIso = readFrDateInput(startEl);
    const endIso = readFrDateInput(endEl);
    if (!startIso || !endIso) {
      toast('Indique une date de début et une date de fin au format jj/mm/aaaa.', true);
      return;
    }
    if (startIso > endIso) {
      toast('La date de début doit être antérieure ou égale à la date de fin.', true);
      return;
    }

    persistDates();
    const emps = STATE.employees.slice();
    const startLbl = frFormat(fromISO(startIso));
    const endLbl = frFormat(fromISO(endIso));
    const dayCount = diffDays(startIso, endIso) + 1;

    const runImport = (mode) => {
      const r = importPatternPeriod(startIso, endIso, emps, mode);
      persistAndRender();
      const msg = mode === 'fillEmpty' && r.skipped > 0
        ? `Cycle importé (${r.updated} cellules, ${r.skipped} conservées) — ${dayCount} jours`
        : `Cycle importé du ${startLbl} au ${endLbl} (${dayCount} jours)`;
      toast(msg);
    };

    if (!periodHasPlanningData(startIso, endIso, emps)) {
      runImport('overwrite');
      return;
    }

    showPlanningImportDialog({
      title: `Importer le cycle — ${startLbl} → ${endLbl}`,
      message: 'Cette période contient déjà des présences dans le planning.',
      onChoose: runImport
    });
  };
}

function mountPatternAnchorPanel(root, options = {}) {
  const idPrefix = options.idPrefix || 'pat-anchor';
  const anchorSummary = getPatternAnchorSummary();
  const curMon = mondayOf(fromISO(STATE.ui.currentDate || todayISO()));
  const defaultAnchorYear = STATE.ui.patternAnchorEditYear ?? getISOWeekYear(curMon);
  const defaultAnchorWeek = STATE.ui.patternAnchorEditWeek ?? getISOWeek(curMon);
  const defaultAnchorPattern = STATE.ui.patternAnchorEditName ?? getPatternWeekNameForMonday(curMon);
  const compactHelp = options.compactHelp;

  const panel = document.createElement('div');
  panel.className = 'form-card pattern-anchor-panel no-print settings-section';
  if (options.sectionId) panel.id = options.sectionId;
  panel.innerHTML = `
    <h3>Ancrage calendaire (cycle patterns)</h3>
    <p class="muted">
      Indique quelle semaine ISO correspond à quelle semaine du cycle (S1, S2, S3…).
      <strong>Cela ne modifie pas le planning en vue Semaine</strong> — seul un import explicite
      recopie le modèle dans les cellules.
      ${compactHelp ? ` <button type="button" class="nav settings-goto" data-tab="patterns">→ Import depuis Patterns</button>` : ''}
    </p>
    <p class="pattern-anchor-current">
      <strong>Actuellement :</strong> S1 = semaine ISO <b>${anchorSummary.isoWeek}</b> (${anchorSummary.isoYear})
      — lundi ${anchorSummary.anchorLabel}
    </p>
    <div class="form-grid pattern-anchor-grid">
      <label>Année ISO
        <input type="number" id="${idPrefix}-year" min="2020" max="2100" value="${defaultAnchorYear}">
      </label>
      <label>Semaine ISO
        <input type="number" id="${idPrefix}-week" min="1" max="53" value="${defaultAnchorWeek}">
      </label>
      <label>Semaine du cycle
        <select id="${idPrefix}-pattern">
          ${getPatternCycleWeeks().map(p =>
            `<option value="${patternEscapeAttr(p)}"${p === defaultAnchorPattern ? ' selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </label>
      <button type="button" class="primary" id="${idPrefix}-apply">Enregistrer l'ancrage</button>
    </div>
    <p class="muted pattern-anchor-preview" id="${idPrefix}-preview"></p>`;
  root.appendChild(panel);
  attachPatternAnchorHandlers(panel, idPrefix);
  bindSettingsNavLinks(panel);
  return panel;
}

function attachPatternAnchorHandlers(panel, idPrefix = 'pat-anchor') {
  const yearEl = panel.querySelector(`#${idPrefix}-year`);
  const weekEl = panel.querySelector(`#${idPrefix}-week`);
  const patternEl = panel.querySelector(`#${idPrefix}-pattern`);
  const previewEl = panel.querySelector(`#${idPrefix}-preview`);
  const applyBtn = panel.querySelector(`#${idPrefix}-apply`);

  const readAnchorForm = () => ({
    isoYear: parseInt(yearEl.value, 10),
    isoWeek: parseInt(weekEl.value, 10),
    patternName: patternEl.value,
  });

  const updatePreview = () => {
    const { isoYear, isoWeek, patternName } = readAnchorForm();
    const info = describePatternAnchorForISOWeek(isoYear, isoWeek, patternName);
    previewEl.textContent = info
      ? `Aperçu import : ${patternName} = sem. ISO ${info.refIsoWeek} (${info.refIsoYear}) → S1 = sem. ISO ${info.anchorIsoWeek} (${info.anchorIsoYear}), lundi ${info.anchorLabel}.`
      : 'Semaine ou année invalide.';
  };

  [yearEl, weekEl, patternEl].forEach(el => {
    el.oninput = updatePreview;
    el.onchange = updatePreview;
  });
  updatePreview();

  applyBtn.onclick = () => {
    const { isoYear, isoWeek, patternName } = readAnchorForm();
    const r = setPatternAnchorFromISOWeek(isoYear, isoWeek, patternName);
    if (!r.ok) {
      toast(r.error, true);
      return;
    }
    STATE.ui.patternAnchorEditYear = isoYear;
    STATE.ui.patternAnchorEditWeek = isoWeek;
    STATE.ui.patternAnchorEditName = patternName;
    toast(`Ancrage enregistré (${patternName} = sem. ${isoWeek}/${isoYear}). Le planning n'est pas modifié — importez pour appliquer.`);
    persistAndRender();
  };
}

/* ===========================================================================
   11. ÉDITEUR D'AFFECTATIONS (qui suit quel pattern et quand)
   ========================================================================= */

function renderAssignmentsEditor(root) {
  const anchorLbl = frFormat(getPatternAnchorMonday());
  const ctrl = document.createElement('div');
  ctrl.className = 'controls';
  ctrl.innerHTML = `
    <div class="label">Affectations dans le temps</div>
    <div class="help-text">
      Copie le <b>cycle calendaire</b> (S1→S3') sur la période choisie.
      <b>S1</b> = semaine ISO 20 (à partir du ${anchorLbl}).
      La semaine 22 correspond à <b>S3</b>.
      Modifiez ensuite dans la vue Semaine · « Réappliquer » pour recopier.
    </div>
  `;
  root.appendChild(ctrl);

  for (const emp of STATE.employees) {
    const card = document.createElement('div');
    card.className = 'form-card';

    const list = STATE.affectations[emp] || [];
    const patNames = Object.keys(STATE.patterns[emp] || {});
    if (patNames.length === 0) {
      card.innerHTML = `<h3>${emp}</h3><p class="muted">Aucun pattern défini. Va dans l'onglet Patterns pour en créer.</p>`;
      root.appendChild(card);
      continue;
    }

    let html = `<h3>${emp}</h3>`;
    html += `<div class="assignments-list">`;
    if (list.length === 0) {
      html += `<div class="muted">Aucune affectation pour le moment.</div>`;
    }
    list.forEach((a, i) => {
      html += `
        <div class="assignment-row" style="grid-template-columns:1fr 1fr 60px auto auto">
          <span><b>Du</b> ${frFormatNumeric(a.start)}</span>
          <span><b>au</b> ${a.end ? frFormatNumeric(a.end) : '—'}</span>
          <span class="pat">${a.pattern}</span>
          <button data-act="reapply" data-emp="${emp}" data-idx="${i}" title="Recopier le pattern sur cette période">↻ Réappliquer</button>
          <button data-act="del" data-emp="${emp}" data-idx="${i}">✕</button>
        </div>`;
    });
    html += `</div>`;
    html += `
      <div class="add-assignment-form">
        <input type="text" class="fr-date" data-fld="start" data-emp="${emp}" data-iso="${todayISO()}" value="${frFormatNumeric(todayISO())}">
        <input type="text" class="fr-date" data-fld="end" data-emp="${emp}" placeholder="jj/mm/aaaa (fin libre)">
        <select data-fld="pattern" data-emp="${emp}">
          ${getPatternCycleWeeks().map(p => `<option value="${p}">${p} (début de cycle)</option>`).join('')}
        </select>
        <button data-act="add" data-emp="${emp}">+ Ajouter</button>
      </div>
      <p class="help-text">Laisser "fin" vide signifie : sans fin (en cours).</p>
    `;
    card.innerHTML = html;
    root.appendChild(card);
  }

  // listeners
  root.querySelectorAll('[data-act="del"]').forEach(b => {
    b.onclick = () => {
      const emp = b.dataset.emp, i = parseInt(b.dataset.idx, 10);
      if (!confirm('Supprimer cette affectation ?')) return;
      STATE.affectations[emp].splice(i, 1);
      persistAndRender();
    };
  });
  root.querySelectorAll('[data-act="add"]').forEach(b => {
    b.onclick = () => {
      const emp = b.dataset.emp;
      const start = readFrDateInput(root.querySelector(`[data-fld="start"][data-emp="${cssAttr(emp)}"]`));
      const end   = readFrDateInput(root.querySelector(`[data-fld="end"][data-emp="${cssAttr(emp)}"]`)) || null;
      const pat   = root.querySelector(`[data-fld="pattern"][data-emp="${cssAttr(emp)}"]`).value;
      if (!start) { alert('Date de début requise (format jj/mm/aaaa).'); return; }
      if (end && end < start) { alert('La date de fin doit être >= date de début.'); return; }
      if (!STATE.affectations[emp]) STATE.affectations[emp] = [];
      STATE.affectations[emp].push({ start, end, pattern: pat });
      STATE.affectations[emp].sort((a, b) => a.start.localeCompare(b.start));
      applyPatternToPeriod(emp, start, end, pat);
      toast(`Pattern « ${pat} » copié du ${start} au ${end || 'fin'}`);
      persistAndRender();
    };
  });
  root.querySelectorAll('[data-act="reapply"]').forEach(b => {
    b.onclick = () => {
      const emp = b.dataset.emp;
      const i = parseInt(b.dataset.idx, 10);
      const a = STATE.affectations[emp][i];
      if (!confirm(`Réappliquer « ${a.pattern} » du ${a.start} au ${a.end || 'fin'} ?\nLes modifications manuelles sur cette période seront écrasées.`)) return;
      applyPatternToPeriod(emp, a.start, a.end, a.pattern);
      toast('Pattern réappliqué sur la période');
      persistAndRender();
    };
  });
}

/* Échappe les apostrophes pour les sélecteurs CSS [attr="..."] -------- */
function cssAttr(s) {
  return s.replace(/"/g, '\\"');
}

/* ===========================================================================
   12. ÉDITEUR DE CONGÉS
   ========================================================================= */

function renderCongeThemeSwatchPicker(selectedThemeId, hiddenInputId) {
  const selected = getCongeThemeById(selectedThemeId).id;
  const idAttr = hiddenInputId ? ` id="${escapeHtml(hiddenInputId)}"` : '';
  return `
    <div class="conge-theme-picker emp-theme-picker" role="radiogroup" aria-label="Thème">
      ${CONGE_COLOR_THEMES.map(t => `
        <button type="button" class="emp-theme-swatch${t.id === selected ? ' is-selected' : ''}"
          data-theme-id="${escapeHtml(t.id)}" title="${escapeHtml(t.label)}" aria-label="${escapeHtml(t.label)}"
          aria-pressed="${t.id === selected}">
          <span class="emp-theme-swatch-inner" style="background:${t.bg}; border-color:${t.border};"></span>
        </button>`).join('')}
      <input type="hidden" class="conge-catalog-theme-value"${idAttr} value="${escapeHtml(selected)}">
    </div>`;
}

function bindCongeThemePicker(picker, onChange) {
  if (!picker) return;
  const hidden = picker.querySelector('.conge-catalog-theme-value');
  picker.querySelectorAll('.emp-theme-swatch').forEach(btn => {
    btn.onclick = () => {
      picker.querySelectorAll('.emp-theme-swatch').forEach(b => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-selected');
      btn.setAttribute('aria-pressed', 'true');
      if (hidden) hidden.value = btn.dataset.themeId;
      if (onChange) onChange(btn.dataset.themeId);
    };
  });
}

function previewCongeThemeOnChip(chip, themeId) {
  if (!chip) return;
  const theme = getCongeThemeById(themeId);
  chip.style.backgroundColor = theme.bg;
  chip.style.borderLeftColor = theme.border;
}

function renderCongeTypeCatalogRow(entry) {
  const used = countCongesWithTypeLabel(entry.label);
  const def = DEFAULT_CONGE_TYPE_CATALOG.find(t => t.id === entry.id);
  const isDefaultTheme = def && def.themeId === entry.themeId;
  const colors = getCongeEntryColors(entry);
  return `
    <tr class="conge-catalog-row" data-type-id="${escapeHtml(entry.id)}">
      <td>
        <span class="type-badge conge-type-badge ${congeTypeCssClass(entry.id)} conge-catalog-preview">${escapeHtml(entry.label)}</span>
      </td>
      <td><input type="text" class="conge-catalog-label" value="${escapeHtml(entry.label)}" maxlength="40" aria-label="Libellé du mode"></td>
      <td class="conge-catalog-theme-cell">${renderCongeThemeSwatchPicker(entry.themeId)}</td>
      <td class="conge-catalog-used">${used ? `${used} congé${used > 1 ? 's' : ''}` : '—'}</td>
      <td class="conge-catalog-actions">
        <button type="button" class="nav conge-catalog-save" data-type-id="${escapeHtml(entry.id)}">Enregistrer</button>
        <button type="button" class="nav conge-catalog-reset-theme" data-type-id="${escapeHtml(entry.id)}"${isDefaultTheme ? ' disabled' : ''}>Thème défaut</button>
        <button type="button" class="nav del conge-catalog-delete" data-type-id="${escapeHtml(entry.id)}"${used ? ' disabled title="Mode utilisé par des congés"' : ''}>Supprimer</button>
      </td>
    </tr>`;
}

function bindCongeTypeCatalogEditor(card) {
  const readRow = (row) => ({
    label: row.querySelector('.conge-catalog-label').value,
    themeId: row.querySelector('.conge-catalog-theme-value')?.value,
  });

  card.querySelectorAll('.conge-catalog-row').forEach(row => {
    const preview = row.querySelector('.conge-catalog-preview');
    bindCongeThemePicker(row.querySelector('.conge-theme-picker'), (themeId) => {
      previewCongeThemeOnChip(preview, themeId);
      const def = DEFAULT_CONGE_TYPE_CATALOG.find(t => t.id === row.dataset.typeId);
      const resetBtn = row.querySelector('.conge-catalog-reset-theme');
      if (resetBtn) resetBtn.disabled = def && def.themeId === themeId;
    });
  });

  card.querySelectorAll('.conge-catalog-save').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('.conge-catalog-row');
      const r = updateCongeTypeCatalogEntry(btn.dataset.typeId, readRow(row));
      if (!r.ok) { toast(r.error, true); return; }
      applyCongeTypeColorStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      toast(`Mode « ${r.entry.label} » enregistré`);
      persistAndRender();
    };
  });

  card.querySelectorAll('.conge-catalog-label').forEach(input => {
    input.oninput = () => {
      const preview = input.closest('.conge-catalog-row').querySelector('.conge-catalog-preview');
      if (preview) preview.textContent = input.value.trim() || '…';
    };
  });

  card.querySelectorAll('.conge-catalog-reset-theme').forEach(btn => {
    btn.onclick = () => {
      resetCongeTypeTheme(btn.dataset.typeId);
      applyCongeTypeColorStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
    };
  });

  card.querySelectorAll('.conge-catalog-delete').forEach(btn => {
    btn.onclick = () => {
      const entry = getCongeTypeDefById(btn.dataset.typeId);
      const label = entry ? entry.label : 'ce mode';
      if (!confirm(`Supprimer le mode « ${label} » ?`)) return;
      const r = removeCongeTypeCatalogEntry(btn.dataset.typeId);
      if (!r.ok) { toast(r.error, true); return; }
      applyCongeTypeColorStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
      toast('Mode supprimé');
    };
  });

  const addBtn = card.querySelector('#conge-catalog-add-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      const label = ($('#conge-catalog-add-label')?.value || '').trim();
      const themeId = card.querySelector('#conge-catalog-add-theme-value')?.value;
      const r = addCongeTypeCatalogEntry(label, themeId);
      if (!r.ok) { toast(r.error, true); return; }
      applyCongeTypeColorStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
      toast(`Mode « ${r.entry.label} » ajouté`);
    };
  }

  const resetAllBtn = card.querySelector('#conge-type-themes-reset-all');
  if (resetAllBtn) {
    resetAllBtn.onclick = () => {
      if (!confirm('Réinitialiser les thèmes de tous les modes de congé ?')) return;
      resetAllCongeTypeThemes();
      applyCongeTypeColorStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
      toast('Thèmes réinitialisés');
    };
  }
}

function mountCongeTypeCatalogSection(root, options = {}) {
  const catalog = getCongeTypeCatalog();
  const defaultAddThemeId = getDefaultCongeThemeIdForIndex(catalog.length);

  const card = document.createElement('div');
  card.className = 'form-card conge-catalog-card settings-section';
  if (options.sectionId) card.id = options.sectionId;
  card.innerHTML = `
    <h3>Modes de congés</h3>
    <p class="muted">Définissez les types d'absence et leur couleur dans le planning. Les changements s'appliquent immédiatement.</p>
    <table class="list conge-catalog-table">
      <thead>
        <tr>
          <th>Aperçu</th>
          <th>Libellé</th>
          <th>Thème</th>
          <th>Utilisation</th>
          <th class="conge-catalog-actions-col">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${catalog.map(renderCongeTypeCatalogRow).join('')}
      </tbody>
    </table>
    <div class="conge-catalog-add">
      <h4>Ajouter un mode</h4>
      <div class="conge-catalog-add-row">
        <label>Libellé <input type="text" id="conge-catalog-add-label" maxlength="40" placeholder="Ex. CET"></label>
        <div class="conge-catalog-add-theme">
          <span class="conge-catalog-add-theme-label">Thème</span>
          <div id="conge-catalog-add-theme">${renderCongeThemeSwatchPicker(defaultAddThemeId, 'conge-catalog-add-theme-value')}</div>
        </div>
        <button type="button" class="primary" id="conge-catalog-add-btn">+ Ajouter</button>
      </div>
    </div>
    <div class="conge-catalog-actions-footer">
      <button type="button" class="nav" id="conge-type-themes-reset-all">Réinitialiser tous les thèmes</button>
    </div>`;
  root.appendChild(card);
  bindCongeTypeCatalogEditor(card);
  bindCongeThemePicker(card.querySelector('#conge-catalog-add-theme'));
  return card;
}

function renderCongesEditor(root) {
  const staffMode = typeof isStaff === 'function' && isStaff();
  const teamLeaderMode = typeof isTeamLeader === 'function' && isTeamLeader();
  const linkedEmp = typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;

  if (!staffMode) {
    const hint = document.createElement('div');
    hint.className = 'form-card settings-hint-card';
    hint.innerHTML = `
      <p class="muted">Modes et couleurs des absences :
        <button type="button" class="nav settings-goto" data-tab="settings" data-hash="cfg-conge-types">Configuration → Modes de congés</button>
      </p>`;
    root.appendChild(hint);
    bindSettingsNavLinks(hint);
  }

  const empOptions = (staffMode && !teamLeaderMode && linkedEmp)
    ? `<option selected>${escapeHtml(linkedEmp)}</option>`
    : STATE.employees.map(e => `<option>${escapeHtml(e)}</option>`).join('');

  const form = document.createElement('div');
  form.className = 'form-card';
  form.innerHTML = `
    <h3>Ajouter un congé / absence</h3>
    ${teamLeaderMode ? '<p class="muted">En tant que chef d\'équipe, vous pouvez saisir un congé pour tout salarié.</p>' : ''}
    ${staffMode && !teamLeaderMode ? '<p class="muted">Vous ne pouvez saisir un congé que pour vous-même.</p>' : ''}
    <div class="form-grid">
      <div class="field">
        <label>Salarié</label>
        <select id="cg-emp" ${staffMode && !teamLeaderMode && linkedEmp ? 'disabled' : ''}>
          ${empOptions}
        </select>
      </div>
      <div class="field">
        <label>Type</label>
        <select id="cg-type">
          ${getCongeTypeLabels().map(t => `<option>${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Date début</label>
        <input type="text" class="fr-date" id="cg-start" data-iso="${todayISO()}" value="${frFormatNumeric(todayISO())}">
      </div>
      <div class="field">
        <label>Date fin</label>
        <input type="text" class="fr-date" id="cg-end" data-iso="${todayISO()}" value="${frFormatNumeric(todayISO())}">
      </div>
      <div class="field" style="grid-column: 1 / -1">
        <label>Commentaire</label>
        <input type="text" id="cg-cmt" placeholder="(facultatif)">
      </div>
      <button class="primary" id="cg-add">+ Ajouter</button>
    </div>
  `;
  root.appendChild(form);

  $('#cg-add').onclick = () => {
    const empVal = (staffMode && !teamLeaderMode && linkedEmp) ? linkedEmp : $('#cg-emp').value;
    const c = {
      id: 'cg_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
      emp: empVal,
      type: $('#cg-type').value,
      start: readFrDateInput($('#cg-start')),
      end:   readFrDateInput($('#cg-end')),
      comment: $('#cg-cmt').value
    };
    if (!c.start || !c.end) { alert('Dates requises (format jj/mm/aaaa).'); return; }
    if (c.end < c.start) { alert('La date de fin doit être >= début.'); return; }
    const cleared = clearPresenceForPeriod(c.emp, c.start, c.end);
    STATE.conges.push(c);
    STATE.conges.sort((a,b) => a.start.localeCompare(b.start));
    persistAndRender();
    toast(cleared > 0
      ? `Congé ajouté — ${cleared} présence${cleared > 1 ? 's' : ''} retirée${cleared > 1 ? 's' : ''}`
      : 'Congé ajouté');
  };

  // liste existante
  const list = document.createElement('div');
  list.className = 'form-card';
  list.innerHTML = `<h3>Congés enregistrés (${STATE.conges.length})</h3>`;
  if (STATE.conges.length === 0) {
    list.innerHTML += `<p class="muted">Aucun congé pour le moment.</p>`;
  } else {
    const tbl = document.createElement('table');
    tbl.className = 'list';
    let h = `<thead><tr>
      <th>Salarié</th><th>Type</th><th>Début</th><th>Fin</th>
      <th>Jours</th><th>Commentaire</th><th></th>
    </tr></thead><tbody>`;
    for (const c of STATE.conges) {
      const days = diffDays(c.start, c.end) + 1;
      const typeCls = congeTypeBadgeClass(c.type);
      const canDel = !staffMode
        || teamLeaderMode
        || (linkedEmp && typeof employeeNamesMatch === 'function' && employeeNamesMatch(c.emp, linkedEmp));
      h += `<tr>
        <td>${escapeHtml(c.emp)}</td>
        <td><span class="${typeCls}">${escapeHtml(c.type)}</span></td>
        <td>${frFormatNumeric(c.start)}</td>
        <td>${frFormatNumeric(c.end)}</td>
        <td>${days}</td>
        <td>${c.comment || ''}</td>
        <td>${canDel ? `<button class="del" data-id="${c.id}">Supprimer</button>` : ''}</td>
      </tr>`;
    }
    h += `</tbody>`;
    tbl.innerHTML = h;
    list.appendChild(tbl);
  }
  root.appendChild(list);

  root.querySelectorAll('.del').forEach(b => {
    b.onclick = () => {
      if (!confirm('Supprimer ce congé ?')) return;
      STATE.conges = STATE.conges.filter(c => c.id !== b.dataset.id);
      persistAndRender();
    };
  });
}

/* ===========================================================================
   13. ÉDITEUR DE JOURS FÉRIÉS
   ========================================================================= */

function renderFeriesEditor(root) {
  const ctrl = document.createElement('div');
  ctrl.className = 'controls';
  ctrl.innerHTML = `
    <div class="label">Jours fériés</div>
    <div class="help-text">
      Les jours fériés français sont calculés automatiquement (Pâques par algorithme de Gauss).
      Tu peux en ajouter (ponts, jours offerts) ou en retirer.
    </div>
    <div class="spacer"></div>
    <label>Année : <input type="number" id="fr-year" value="${STATE.ui.yearShown}" min="2020" max="2100" style="width:90px"></label>
  `;
  root.appendChild(ctrl);

  // ajout perso
  const form = document.createElement('div');
  form.className = 'form-card';
  form.innerHTML = `
    <h3>Ajouter un jour férié personnalisé</h3>
    <div class="form-grid">
      <div class="field">
        <label>Date</label>
        <input type="text" class="fr-date" id="fr-date" data-iso="${todayISO()}" value="${frFormatNumeric(todayISO())}">
      </div>
      <div class="field">
        <label>Libellé</label>
        <input type="text" id="fr-label" placeholder="ex : Pont du 14 juillet">
      </div>
      <button class="primary" id="fr-add">+ Ajouter</button>
    </div>
  `;
  root.appendChild(form);

  $('#fr-add').onclick = () => {
    const d = readFrDateInput($('#fr-date'));
    const l = $('#fr-label').value || 'Personnalisé';
    if (!d) return;
    // si on retirait ce jour, on annule le retrait
    STATE.feriesRemove = STATE.feriesRemove.filter(x => x !== d);
    // si l'ajout existe déjà, on remplace
    STATE.feriesAdd = STATE.feriesAdd.filter(f => f.date !== d);
    STATE.feriesAdd.push({ date: d, label: l });
    persistAndRender();
  };

  // tableau de l'année courante
  const card = document.createElement('div');
  card.className = 'form-card';
  const year = STATE.ui.yearShown;
  const allFeries = collectFeriesForYear(year);
  let h = `<h3>Jours fériés ${year} (${allFeries.length})</h3>`;
  const tbl = document.createElement('table');
  tbl.className = 'list';
  h = `<h3>Jours fériés ${year} (${allFeries.length})</h3>`;
  h += `<table class="list"><thead><tr>
    <th>Date</th><th>Jour</th><th>Libellé</th><th>Source</th><th></th>
  </tr></thead><tbody>`;
  for (const f of allFeries) {
    const d = fromISO(f.date);
    const isCustom = STATE.feriesAdd.some(x => x.date === f.date);
    const isRemoved = STATE.feriesRemove.includes(f.date);
    if (isRemoved) continue;
    h += `<tr>
      <td>${f.date}</td>
      <td>${DAY_NAMES_LONG[d.getDay()]}</td>
      <td>${f.label}</td>
      <td>${isCustom ? '<i>Personnalisé</i>' : 'Automatique'}</td>
      <td>
        ${isCustom
          ? `<button class="del" data-fer-rm-custom="${f.date}">Retirer</button>`
          : `<button class="del" data-fer-rm="${f.date}">Désactiver</button>`
        }
      </td>
    </tr>`;
  }
  // les fériés retirés (pour pouvoir les réactiver)
  if (STATE.feriesRemove.length > 0) {
    h += `<tr><td colspan="5"><b>Désactivés :</b></td></tr>`;
    for (const dt of STATE.feriesRemove.filter(d => d.startsWith(String(year)))) {
      const y = parseInt(dt.slice(0,4), 10);
      const lbl = feriesForYear(y)[dt] || 'Inconnu';
      h += `<tr style="opacity:.5">
        <td>${dt}</td><td>—</td><td>${lbl}</td><td>Auto (désactivé)</td>
        <td><button class="del" data-fer-restore="${dt}">Réactiver</button></td>
      </tr>`;
    }
  }
  h += `</tbody></table>`;
  card.innerHTML = h;
  root.appendChild(card);

  $('#fr-year').onchange = (e) => { STATE.ui.yearShown = parseInt(e.target.value, 10); persistAndRender(); };
  root.querySelectorAll('[data-fer-rm]').forEach(b => {
    b.onclick = () => {
      STATE.feriesRemove.push(b.dataset.ferRm);
      persistAndRender();
    };
  });
  root.querySelectorAll('[data-fer-rm-custom]').forEach(b => {
    b.onclick = () => {
      const d = b.dataset.ferRmCustom;
      STATE.feriesAdd = STATE.feriesAdd.filter(f => f.date !== d);
      persistAndRender();
    };
  });
  root.querySelectorAll('[data-fer-restore]').forEach(b => {
    b.onclick = () => {
      STATE.feriesRemove = STATE.feriesRemove.filter(x => x !== b.dataset.ferRestore);
      persistAndRender();
    };
  });
}

function collectFeriesForYear(year) {
  const auto = feriesForYear(year);
  const list = [];
  for (const date in auto) {
    list.push({ date, label: auto[date] });
  }
  for (const f of STATE.feriesAdd) {
    if (f.date.startsWith(String(year))) {
      // remplace si déjà présent
      const idx = list.findIndex(x => x.date === f.date);
      if (idx >= 0) list[idx] = f;
      else list.push(f);
    }
  }
  list.sort((a,b) => a.date.localeCompare(b.date));
  return list;
}

/* ===========================================================================
   14. ÉDITEUR DE JOURS DE GARDE
   ========================================================================= */

function renderGardesEditor(root) {
  const ctrl = document.createElement('div');
  ctrl.className = 'controls';
  ctrl.innerHTML = `
    <div class="label">Jours de garde</div>
    <div class="help-text">
      Saisissez une période (du … au …) ou un seul jour (même date début et fin).
      Les jours de garde apparaissent dans le planning avec un en-tête de colonne rouge clair.
    </div>
    <div class="spacer"></div>
    <label>Année : <input type="number" id="gd-year" value="${STATE.ui.yearShown}" min="2020" max="2100" style="width:90px"></label>
  `;
  root.appendChild(ctrl);

  const today = todayISO();
  const form = document.createElement('div');
  form.className = 'form-card';
  form.innerHTML = `
    <h3>Ajouter une période de garde</h3>
    <div class="form-grid">
      <div class="field">
        <label>Du</label>
        <input type="text" class="fr-date" id="gd-start" data-iso="${today}" value="${frFormatNumeric(today)}">
      </div>
      <div class="field">
        <label>Au</label>
        <input type="text" class="fr-date" id="gd-end" data-iso="${today}" value="${frFormatNumeric(today)}">
      </div>
      <div class="field">
        <label>Libellé</label>
        <input type="text" id="gd-label" placeholder="ex : Garde de week-end">
      </div>
      <button class="primary" id="gd-add">+ Ajouter</button>
    </div>
    <p class="muted">Pour un seul jour, indiquez la même date en début et fin.</p>
  `;
  root.appendChild(form);

  $('#gd-add').onclick = () => {
    const start = readFrDateInput($('#gd-start'));
    const end = readFrDateInput($('#gd-end'));
    const l = ($('#gd-label').value || '').trim() || 'Garde';
    if (!start || !end) {
      toast('Dates requises (format jj/mm/aaaa).', true);
      return;
    }
    const r = addGardePeriod(start, end, l);
    if (!r.ok) {
      toast(r.error, true);
      return;
    }
    persistAndRender();
    const dayLbl = r.days === 1 ? '1 jour' : `${r.days} jours`;
    toast(r.overlaps
      ? `Garde enregistrée (${dayLbl}) — chevauche une période existante`
      : `Garde enregistrée (${dayLbl})`);
  };

  const card = document.createElement('div');
  card.className = 'form-card';
  const year = STATE.ui.yearShown;
  const allGardes = collectGardesForYear(year);
  let h = `<h3>Périodes de garde ${year} (${allGardes.length})</h3>`;
  if (allGardes.length === 0) {
    h += `<p class="muted">Aucune garde pour ${year}.</p>`;
  } else {
    h += `<table class="list"><thead><tr>
      <th>Du</th><th>Au</th><th>Jours</th><th>Libellé</th><th></th>
    </tr></thead><tbody>`;
    for (const g of allGardes) {
      const days = gardePeriodDayCount(g);
      const single = g.start === g.end;
      h += `<tr>
        <td>${frFormatNumeric(g.start)}</td>
        <td>${single ? '—' : frFormatNumeric(g.end)}</td>
        <td>${days}${single ? ' (1 jour)' : ''}</td>
        <td>${escapeHtml(g.label || 'Garde')}</td>
        <td><button class="del" data-gd-rm="${escapeHtml(g.id)}">Retirer</button></td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }
  card.innerHTML = h;
  root.appendChild(card);

  $('#gd-year').onchange = (e) => { STATE.ui.yearShown = parseInt(e.target.value, 10); persistAndRender(); };
  root.querySelectorAll('[data-gd-rm]').forEach(b => {
    b.onclick = () => {
      if (!confirm('Retirer cette période de garde ?')) return;
      removeGarde(b.dataset.gdRm);
      persistAndRender();
      toast('Période retirée');
    };
  });
}

/* ===========================================================================
   15. ÉDITEUR PANTECOTES
   ========================================================================= */

function renderPantecotesEditor(root) {
  const pantecotes = getPantecotesSorted();
  const editable = typeof canEditPlanning !== 'function' || canEditPlanning();
  const emps = STATE.employees.slice();

  const ctrl = document.createElement('div');
  ctrl.className = 'controls';
  ctrl.innerHTML = `
    <div class="label">${SOLIDARITE_LABELS}</div>
    <div class="help-text">
      Définissez les dates de chaque édition, saisissez ou ajustez les heures travaillées,
      puis les heures récupérées en travail ou en formation.
      La colonne <strong>Total récup.</strong> passe au rouge si la récupération n'atteint pas les heures travaillées.
    </div>
  `;
  root.appendChild(ctrl);

  if (editable) {
    const addCard = document.createElement('div');
    addCard.className = 'form-card';
    const nextYear = pantecotes.length
      ? Math.max(...pantecotes.map(p => p.year)) + 1
      : new Date().getFullYear();
    const today = todayISO();
    addCard.innerHTML = `
      <h3>Ajouter une ${SOLIDARITE_LABEL.toLowerCase()}</h3>
      <div class="form-grid">
        <div class="field">
          <label>Année</label>
          <input type="number" id="pt-add-year" value="${nextYear}" min="2000" max="2100" style="width:90px">
        </div>
        <div class="field">
          <label>Du</label>
          <input type="text" class="fr-date" id="pt-add-start" data-iso="${today}" value="${frFormatNumeric(today)}">
        </div>
        <div class="field">
          <label>Au</label>
          <input type="text" class="fr-date" id="pt-add-end" data-iso="${today}" value="${frFormatNumeric(today)}">
        </div>
        <div class="field">
          <label>Libellé</label>
          <input type="text" id="pt-add-label" placeholder="ex : ${SOLIDARITE_LABEL} 2027">
        </div>
        <button class="primary" id="pt-add-btn">+ Ajouter</button>
      </div>
    `;
    root.appendChild(addCard);

    $('#pt-add-btn').onclick = () => {
      const year = parseInt($('#pt-add-year').value, 10);
      const start = readFrDateInput($('#pt-add-start'));
      const end = readFrDateInput($('#pt-add-end'));
      const label = ($('#pt-add-label').value || '').trim();
      const r = addPantecote(year, start, end, label || solidariteDefaultLabel(year));
      if (!r.ok) {
        toast(r.error, true);
        return;
      }
      persistAndRender();
      toast(`${SOLIDARITE_LABEL} ${year} ajoutée`);
    };
  }

  const datesCard = document.createElement('div');
  datesCard.className = 'form-card';
  let datesHtml = `<h3>Éditions (${pantecotes.length})</h3>`;
  if (!pantecotes.length) {
    datesHtml += `<p class="muted">Aucune ${SOLIDARITE_LABEL.toLowerCase()}. Ajoutez-en une ci-dessus.</p>`;
  } else {
    datesHtml += `<table class="list pantecotes-editions-table"><thead><tr>
      <th>Édition</th><th>Du</th><th>Au</th><th>Jours</th>${editable ? '<th></th>' : ''}
    </tr></thead><tbody>`;
    for (const p of pantecotes) {
      const days = pantecoteHasDates(p) ? pantecoteDateRange(p).length : 0;
      const single = p.start && p.start === p.end;
      datesHtml += `<tr data-pt-id="${escapeHtml(p.id)}">
        <td><strong>${escapeHtml(p.label)}</strong></td>
        <td>${editable
          ? `<input type="text" class="fr-date pt-date-start" data-iso="${p.start || ''}" value="${p.start ? frFormatNumeric(p.start) : ''}" placeholder="jj/mm/aaaa">`
          : (p.start ? frFormatNumeric(p.start) : '—')}</td>
        <td>${editable
          ? `<input type="text" class="fr-date pt-date-end" data-iso="${p.end || ''}" value="${p.end ? frFormatNumeric(p.end) : ''}" placeholder="jj/mm/aaaa">`
          : (p.end && !single ? frFormatNumeric(p.end) : (single ? '—' : '—'))}</td>
        <td class="num">${pantecoteHasDates(p) ? days + (single ? ' (1 jour)' : '') : '<span class="muted">dates à définir</span>'}</td>
        ${editable ? `<td><button class="del" data-pt-rm="${escapeHtml(p.id)}" title="Supprimer l'édition">Retirer</button></td>` : ''}
      </tr>`;
    }
    datesHtml += `</tbody></table>`;
    if (editable) {
      datesHtml += `<p class="muted">Modifiez les dates puis cliquez sur Enregistrer les dates.</p>
        <button type="button" class="primary" id="pt-save-dates">Enregistrer les dates</button>`;
    }
  }
  datesCard.innerHTML = datesHtml;
  root.appendChild(datesCard);

  if (editable && pantecotes.length) {
    $('#pt-save-dates').onclick = () => {
      let ok = true;
      datesCard.querySelectorAll('tr[data-pt-id]').forEach(row => {
        const id = row.dataset.ptId;
        const start = readFrDateInput(row.querySelector('.pt-date-start'));
        const end = readFrDateInput(row.querySelector('.pt-date-end'));
        const r = updatePantecote(id, { start, end });
        if (!r.ok) {
          toast(r.error, true);
          ok = false;
        }
      });
      if (!ok) return;
      persistAndRender();
      toast('Dates enregistrées');
    };

    datesCard.querySelectorAll('[data-pt-rm]').forEach(btn => {
      btn.onclick = () => {
        const p = pantecotes.find(x => x.id === btn.dataset.ptRm);
        if (!confirm(`Retirer ${p ? p.label : 'cette édition'} ? Les heures récupérées associées seront supprimées.`)) return;
        removePantecote(btn.dataset.ptRm);
        persistAndRender();
        toast('Édition retirée');
      };
    });
  }

  const tableCard = document.createElement('div');
  tableCard.className = 'form-card pantecotes-table-card';
  if (!pantecotes.length) {
    tableCard.innerHTML = `<h3>Suivi par salarié</h3><p class="muted">Ajoutez au moins une édition pour afficher le tableau.</p>`;
  } else {
    const colsPerEdition = 3;
    let thead = `<tr>
      <th class="pantecotes-emp-col" rowspan="2">Salarié</th>`;
    for (const p of pantecotes) {
      const datesHint = pantecoteHasDates(p)
        ? `${frFormatNumeric(p.start)}${p.end !== p.start ? ' → ' + frFormatNumeric(p.end) : ''}`
        : 'dates non définies';
      thead += `<th class="pantecotes-edition-head" colspan="${colsPerEdition}" title="${escapeHtml(datesHint)}">${escapeHtml(p.label)}</th>`;
    }
    thead += `<th class="pantecotes-total-head" rowspan="2">Total récup.</th></tr>
      <tr>`;
    for (const p of pantecotes) {
      thead += `
        <th class="pantecotes-subhead" title="Heures travaillées (planning ou saisie manuelle)">H. travaillées</th>
        <th class="pantecotes-subhead" title="Heures récupérées en travail">Récup. travail</th>
        <th class="pantecotes-subhead" title="Heures récupérées en formation">Récup. formation</th>`;
    }
    thead += `</tr>`;

    let tbody = '';
    for (const emp of emps) {
      const rowTotals = pantecoteRowTotals(emp, pantecotes);
      const totalCls = pantecoteRecupIsShort(rowTotals.recup, rowTotals.worked)
        ? 'pantecotes-row-total is-short'
        : (rowTotals.worked > 0 ? 'pantecotes-row-total is-ok' : 'pantecotes-row-total');
      const totalTitle = pantecoteRowTotalTitle(emp, rowTotals);
      tbody += `<tr class="emp-row" data-emp="${escapeHtml(emp)}"><td class="empname ${employeeTypeClass(emp)}" title="${escapeHtml(emp)}">${escapeHtml(shortEmpName(emp))}</td>`;
      for (const p of pantecotes) {
        const workedInfo = getPantecoteHoursWorkedInfo(emp, p);
        const rec = getPantecoteRecovery(p.id, emp);
        const workedTitle = workedInfo.manual
          ? `${emp} — ${p.label} — saisie manuelle (${formatContractHours(workedInfo.hours)} h)`
          : (workedInfo.hours == null
            ? 'Définissez les dates de l\'édition'
            : `${emp} — ${p.label} — planning (${formatContractHours(workedInfo.hours)} h)`);
        if (editable) {
          tbody += `
            <td class="pantecotes-input-cell pantecotes-worked-cell" title="${escapeHtml(workedTitle)}">
              <input type="text" class="pantecotes-hours-input pantecotes-worked-input${workedInfo.manual ? ' is-manual' : ''}"
                inputmode="decimal" data-pt-id="${escapeHtml(p.id)}" data-emp="${escapeHtml(emp)}" data-field="worked"
                value="${workedInfo.hours != null ? formatContractHours(workedInfo.hours) : ''}" placeholder="0"
                aria-label="Heures travaillées">
            </td>`;
          tbody += `
            <td class="pantecotes-input-cell">
              <input type="text" class="pantecotes-hours-input" inputmode="decimal"
                data-pt-id="${escapeHtml(p.id)}" data-emp="${escapeHtml(emp)}" data-field="work"
                value="${rec.work ? formatContractHours(rec.work) : ''}" placeholder="0" aria-label="Récupération travail">
            </td>
            <td class="pantecotes-input-cell">
              <input type="text" class="pantecotes-hours-input" inputmode="decimal"
                data-pt-id="${escapeHtml(p.id)}" data-emp="${escapeHtml(emp)}" data-field="formation"
                value="${rec.formation ? formatContractHours(rec.formation) : ''}" placeholder="0" aria-label="Récupération formation">
            </td>`;
        } else {
          tbody += `<td class="num pantecotes-worked" title="${escapeHtml(workedTitle)}">${workedInfo.hours != null ? formatContractHours(workedInfo.hours) : '—'}</td>`;
          tbody += `
            <td class="num">${rec.work ? formatContractHours(rec.work) : '—'}</td>
            <td class="num">${rec.formation ? formatContractHours(rec.formation) : '—'}</td>`;
        }
      }
      tbody += `<td class="num ${totalCls}" title="${escapeHtml(totalTitle)}"><strong>${formatContractHours(rowTotals.recup)}</strong></td></tr>`;
    }

    let tfoot = `<tr class="sum-row"><td class="sum-label">Total</td>`;
    let grandRecup = 0;
    let grandWorked = 0;
    let hasGrandWorked = false;
    for (const p of pantecotes) {
      let teamWorked = 0;
      let teamWork = 0;
      let teamFormation = 0;
      let hasWorked = false;
      for (const emp of emps) {
        const w = getPantecoteHoursWorked(emp, p);
        if (w != null) { teamWorked += w; hasWorked = true; }
        const rec = getPantecoteRecovery(p.id, emp);
        teamWork += rec.work || 0;
        teamFormation += rec.formation || 0;
      }
      if (hasWorked) {
        grandWorked += teamWorked;
        hasGrandWorked = true;
      }
      grandRecup += teamWork + teamFormation;
      tfoot += `<td class="num sum-row-hours">${hasWorked ? formatContractHours(Math.round(teamWorked * 100) / 100) : '—'}</td>`;
      tfoot += `<td class="num sum-row-hours">${teamWork ? formatContractHours(Math.round(teamWork * 100) / 100) : '—'}</td>`;
      tfoot += `<td class="num sum-row-hours">${teamFormation ? formatContractHours(Math.round(teamFormation * 100) / 100) : '—'}</td>`;
    }
    const grandWorkedR = hasGrandWorked ? Math.round(grandWorked * 100) / 100 : null;
    const grandRecupR = Math.round(grandRecup * 100) / 100;
    const grandTotalCls = pantecoteRecupIsShort(grandRecupR, grandWorkedR)
      ? 'sum-row-hours pantecotes-row-total is-short'
      : (grandWorkedR > 0 ? 'sum-row-hours pantecotes-row-total is-ok' : 'sum-row-hours pantecotes-row-total');
    tfoot += `<td class="num ${grandTotalCls}"><strong>${formatContractHours(grandRecupR)}</strong></td></tr>`;

    tableCard.innerHTML = `
      <h3>Suivi par salarié</h3>
      <p class="muted">Les heures travaillées sont préremplies depuis le planning (modifiables). Double-clic sur une H. travaillée pour reprendre la valeur du planning.</p>
      <div class="planning-wrap pantecotes-wrap">
        <table class="list pantecotes-table">
          <thead>${thead}</thead>
          <tbody>${tbody}</tbody>
          <tfoot>${tfoot}</tfoot>
        </table>
      </div>`;
  }
  root.appendChild(tableCard);

  if (editable) {
    tableCard.querySelectorAll('.pantecotes-hours-input').forEach(input => {
      const save = () => {
        const ptId = input.dataset.ptId;
        const emp = input.dataset.emp;
        const field = input.dataset.field;
        const parsed = parseHoursInput(input.value);
        if (parsed === null) {
          toast('Heures invalides (nombre ≥ 0, virgule ou point).', true);
          input.focus();
          return;
        }
        if (field === 'worked') {
          setPantecoteWorkedOverride(ptId, emp, parsed);
          input.classList.add('is-manual');
        } else {
          const rec = getPantecoteRecovery(ptId, emp);
          const work = field === 'work' ? parsed : rec.work;
          const formation = field === 'formation' ? parsed : rec.formation;
          setPantecoteRecovery(ptId, emp, work, formation);
        }
        saveState();
        refreshPantecoteEmployeeRow(tableCard, emp, pantecotes, emps);
        updatePantecotesFooterTotals(tableCard, pantecotes, emps);
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
      if (input.dataset.field === 'worked') {
        input.addEventListener('dblclick', (e) => {
          e.preventDefault();
          const ptId = input.dataset.ptId;
          const emp = input.dataset.emp;
          const p = pantecotes.find(x => x.id === ptId);
          if (!p) return;
          clearPantecoteWorkedOverride(ptId, emp);
          const info = getPantecoteHoursWorkedInfo(emp, p);
          input.value = info.hours != null ? formatContractHours(info.hours) : '';
          input.classList.toggle('is-manual', info.manual);
          saveState();
          refreshPantecoteEmployeeRow(tableCard, emp, pantecotes, emps);
          updatePantecotesFooterTotals(tableCard, pantecotes, emps);
          toast('Heures travaillées reprises depuis le planning');
        });
      }
    });
  }
}

function refreshPantecoteEmployeeRow(tableCard, emp, pantecotes, emps) {
  const row = tableCard.querySelector(`tr[data-emp="${CSS.escape(emp)}"]`);
  if (!row) return;
  const totals = pantecoteRowTotals(emp, pantecotes);
  const totalCell = row.querySelector('.pantecotes-row-total') || row.querySelector('td:last-child');
  if (!totalCell) return;
  totalCell.className = 'num pantecotes-row-total'
    + (pantecoteRecupIsShort(totals.recup, totals.worked) ? ' is-short'
      : (totals.worked > 0 ? ' is-ok' : ''));
  totalCell.title = pantecoteRowTotalTitle(emp, totals);
  const strong = totalCell.querySelector('strong') || totalCell;
  strong.textContent = formatContractHours(totals.recup);
}

function updatePantecotesFooterTotals(tableCard, pantecotes, emps) {
  const tfoot = tableCard.querySelector('tfoot tr');
  if (!tfoot) return;
  const cells = tfoot.querySelectorAll('td');
  let cellIdx = 1;
  let grandRecup = 0;
  let grandWorked = 0;
  let hasGrandWorked = false;
  for (const p of pantecotes) {
    let teamWorked = 0;
    let teamWork = 0;
    let teamFormation = 0;
    let hasWorked = false;
    for (const emp of emps) {
      const w = getPantecoteHoursWorked(emp, p);
      if (w != null) { teamWorked += w; hasWorked = true; }
      const rec = getPantecoteRecovery(p.id, emp);
      teamWork += rec.work || 0;
      teamFormation += rec.formation || 0;
    }
    if (hasWorked) {
      grandWorked += teamWorked;
      hasGrandWorked = true;
    }
    grandRecup += teamWork + teamFormation;
    if (cells[cellIdx]) cells[cellIdx].textContent = hasWorked ? formatContractHours(Math.round(teamWorked * 100) / 100) : '—';
    cellIdx++;
    if (cells[cellIdx]) cells[cellIdx].textContent = teamWork ? formatContractHours(Math.round(teamWork * 100) / 100) : '—';
    cellIdx++;
    if (cells[cellIdx]) cells[cellIdx].textContent = teamFormation ? formatContractHours(Math.round(teamFormation * 100) / 100) : '—';
    cellIdx++;
  }
  const grandWorkedR = hasGrandWorked ? Math.round(grandWorked * 100) / 100 : null;
  const grandRecupR = Math.round(grandRecup * 100) / 100;
  const grandCell = cells[cellIdx];
  if (grandCell) {
    grandCell.className = 'num sum-row-hours pantecotes-row-total'
      + (pantecoteRecupIsShort(grandRecupR, grandWorkedR) ? ' is-short'
        : (grandWorkedR > 0 ? ' is-ok' : ''));
    const target = grandCell.querySelector('strong') || grandCell;
    target.textContent = formatContractHours(grandRecupR);
  }
}

/* ===========================================================================
   ÉDITEUR ÉQUIPE — ajout / renommage salariés
   ========================================================================= */

function renderThemeSwatchPicker(selectedThemeId, hiddenInputId) {
  const selected = getThemeById(selectedThemeId).id;
  const idAttr = hiddenInputId ? ` id="${escapeHtml(hiddenInputId)}"` : '';
  return `
    <div class="emp-theme-picker" role="radiogroup" aria-label="Thème">
      ${EMPLOYEE_TYPE_THEMES.map(t => `
        <button type="button" class="emp-theme-swatch${t.id === selected ? ' is-selected' : ''}"
          data-theme-id="${escapeHtml(t.id)}" title="${escapeHtml(t.label)}" aria-label="${escapeHtml(t.label)}"
          aria-pressed="${t.id === selected}">
          <span class="emp-theme-swatch-inner" style="background:${t.bg}; border-color:${t.border};"></span>
        </button>`).join('')}
      <input type="hidden" class="emp-catalog-theme-value"${idAttr} value="${escapeHtml(selected)}">
    </div>`;
}

function previewThemeOnChip(chip, themeId) {
  if (!chip) return;
  const theme = getThemeById(themeId);
  chip.style.backgroundColor = theme.bg;
  chip.style.borderLeftColor = theme.border;
}

function bindThemePicker(picker, onChange) {
  if (!picker) return;
  const hidden = picker.querySelector('.emp-catalog-theme-value');
  picker.querySelectorAll('.emp-theme-swatch').forEach(btn => {
    btn.onclick = () => {
      picker.querySelectorAll('.emp-theme-swatch').forEach(b => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-selected');
      btn.setAttribute('aria-pressed', 'true');
      if (hidden) hidden.value = btn.dataset.themeId;
      if (onChange) onChange(btn.dataset.themeId);
    };
  });
}

function renderEmployeeTypeCatalogRow(entry) {
  const used = countEmployeesWithTypeId(entry.id);
  const def = DEFAULT_EMPLOYEE_TYPE_CATALOG.find(t => t.id === entry.id);
  const isDefaultTheme = def && def.themeId === entry.themeId;
  const cls = employeeTypeClassForId(entry.id);
  return `
    <tr class="emp-catalog-row" data-type-id="${escapeHtml(entry.id)}">
      <td>
        <span class="employees-type-chip ${cls} emp-catalog-preview">${escapeHtml(entry.label)}</span>
      </td>
      <td><input type="text" class="emp-catalog-label" value="${escapeHtml(entry.label)}" maxlength="60" aria-label="Libellé du type"></td>
      <td><input type="text" class="emp-catalog-group" value="${escapeHtml(entry.group)}" maxlength="40" aria-label="Groupe du type"></td>
      <td class="emp-catalog-theme-cell">${renderThemeSwatchPicker(entry.themeId)}</td>
      <td class="emp-catalog-used">${used ? `${used} salarié${used > 1 ? 's' : ''}` : '—'}</td>
      <td class="emp-catalog-actions">
        <button type="button" class="nav emp-catalog-save" data-type-id="${escapeHtml(entry.id)}">Enregistrer</button>
        <button type="button" class="nav emp-catalog-reset-theme" data-type-id="${escapeHtml(entry.id)}"${isDefaultTheme ? ' disabled' : ''}>Thème défaut</button>
        <button type="button" class="nav del emp-catalog-delete" data-type-id="${escapeHtml(entry.id)}"${used ? ' disabled title="Type assigné à des salariés"' : ''}>Supprimer</button>
      </td>
    </tr>`;
}

function renderEmployeeTypeLegendGroups() {
  return getEmployeeTypeGroups().map(group => {
    const types = getEmployeeTypeCatalog().filter(t => (t.group || 'Autres') === group);
    return `
      <div class="employees-type-group">
        <span class="employees-type-group-label">${escapeHtml(group)}</span>
        <div class="employees-type-group-chips">
          ${types.map(t => `<span class="employees-type-chip ${employeeTypeClassForId(t.id)}">${escapeHtml(t.label)}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function bindEmployeeTypeCatalogEditor(card) {
  const readRow = (row) => ({
    label: row.querySelector('.emp-catalog-label').value,
    group: row.querySelector('.emp-catalog-group').value,
    themeId: row.querySelector('.emp-catalog-theme-value')?.value,
  });

  card.querySelectorAll('.emp-catalog-row').forEach(row => {
    const preview = row.querySelector('.emp-catalog-preview');
    bindThemePicker(row.querySelector('.emp-theme-picker'), (themeId) => {
      previewThemeOnChip(preview, themeId);
      const resetBtn = row.querySelector('.emp-catalog-reset-theme');
      const def = DEFAULT_EMPLOYEE_TYPE_CATALOG.find(t => t.id === row.dataset.typeId);
      if (resetBtn) resetBtn.disabled = def && def.themeId === themeId;
    });
  });

  card.querySelectorAll('.emp-catalog-save').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('.emp-catalog-row');
      const data = readRow(row);
      const r = updateEmployeeTypeCatalogEntry(btn.dataset.typeId, data);
      if (!r.ok) {
        toast(r.error, true);
        return;
      }
      applyEmployeeTypeColorStyles();
      refreshEmployeeTypeOptionStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      toast(`Type « ${r.entry.label} » enregistré`);
      persistAndRender();
    };
  });

  card.querySelectorAll('.emp-catalog-label, .emp-catalog-group').forEach(input => {
    input.oninput = () => {
      const row = input.closest('.emp-catalog-row');
      const preview = row.querySelector('.emp-catalog-preview');
      if (preview && input.classList.contains('emp-catalog-label')) {
        preview.textContent = input.value.trim() || '…';
      }
    };
  });

  card.querySelectorAll('.emp-catalog-reset-theme').forEach(btn => {
    btn.onclick = () => {
      resetEmployeeTypeTheme(btn.dataset.typeId);
      applyEmployeeTypeColorStyles();
      refreshEmployeeTypeOptionStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
    };
  });

  card.querySelectorAll('.emp-catalog-delete').forEach(btn => {
    btn.onclick = () => {
      const typeDef = getEmployeeTypeDefById(btn.dataset.typeId);
      const label = typeDef ? typeDef.label : 'ce type';
      if (!confirm(`Supprimer le type « ${label} » ?`)) return;
      const r = removeEmployeeTypeCatalogEntry(btn.dataset.typeId);
      if (!r.ok) {
        toast(r.error, true);
        return;
      }
      applyEmployeeTypeColorStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
      toast('Type supprimé');
    };
  });

  const addBtn = card.querySelector('#emp-catalog-add-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      const label = ($('#emp-catalog-add-label')?.value || '').trim();
      const group = ($('#emp-catalog-add-group')?.value || '').trim();
      const themeId = card.querySelector('#emp-catalog-add-theme-value')?.value;
      const r = addEmployeeTypeCatalogEntry(label, group, themeId);
      if (!r.ok) {
        toast(r.error, true);
        return;
      }
      applyEmployeeTypeColorStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
      toast(`Type « ${r.entry.label} » ajouté`);
    };
  }

  const resetAllBtn = card.querySelector('#emp-type-themes-reset-all');
  if (resetAllBtn) {
    resetAllBtn.onclick = () => {
      if (!confirm('Réinitialiser les thèmes de tous les types ?')) return;
      resetAllEmployeeTypeThemes();
      applyEmployeeTypeColorStyles();
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
      toast('Thèmes réinitialisés');
    };
  }
}

function mountEmployeeTypeCatalogSection(root, options = {}) {
  const catalog = getEmployeeTypeCatalog();
  const defaultAddThemeId = getDefaultThemeIdForCatalogIndex(catalog.length);

  const card = document.createElement('div');
  card.className = 'form-card employees-legend-card settings-section';
  if (options.sectionId) card.id = options.sectionId;
  card.innerHTML = `
    <h3>Types de salariés</h3>
    <div class="employees-type-legend">${renderEmployeeTypeLegendGroups()}</div>
    <p class="muted">Couleur visible sur le nom en vue Semaine. Choisissez un thème pour chaque type, modifiez les libellés ou ajoutez de nouveaux types.</p>
    <div class="employees-type-catalog">
      <h4>Gestion des types</h4>
      <table class="list emp-catalog-table">
        <thead>
          <tr>
            <th>Aperçu</th>
            <th>Libellé</th>
            <th>Groupe</th>
            <th>Thème</th>
            <th>Utilisation</th>
            <th class="emp-catalog-actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${catalog.map(renderEmployeeTypeCatalogRow).join('')}
        </tbody>
      </table>
      <div class="emp-catalog-add">
        <h4>Ajouter un type</h4>
        <div class="emp-catalog-add-row">
          <label>Libellé <input type="text" id="emp-catalog-add-label" maxlength="60" placeholder="Ex. Auxiliaire"></label>
          <label>Groupe <input type="text" id="emp-catalog-add-group" maxlength="40" placeholder="Ex. Autre" value="Autre"></label>
          <div class="emp-catalog-add-theme">
            <span class="emp-catalog-add-theme-label">Thème</span>
            <div id="emp-catalog-add-theme">${renderThemeSwatchPicker(defaultAddThemeId, 'emp-catalog-add-theme-value')}</div>
          </div>
          <button type="button" class="primary" id="emp-catalog-add-btn">+ Ajouter</button>
        </div>
      </div>
      <div class="employees-type-colors-actions">
        <button type="button" class="nav" id="emp-type-themes-reset-all">Réinitialiser tous les thèmes</button>
      </div>
    </div>`;
  root.appendChild(card);
  bindEmployeeTypeCatalogEditor(card);
  bindThemePicker(card.querySelector('#emp-catalog-add-theme'));
  return card;
}

function renderEmployeesEditor(root) {
  const defaultTypeId = getDefaultEmployeeTypeId();

  const hint = document.createElement('div');
  hint.className = 'form-card settings-hint-card';
  hint.innerHTML = `
    <h3>Types de salariés</h3>
    <div class="employees-type-legend">${renderEmployeeTypeLegendGroups()}</div>
    <p class="muted">Gérer les types et couleurs :
      <button type="button" class="nav settings-goto" data-tab="settings" data-hash="cfg-emp-types">Configuration → Types de salariés</button>
    </p>`;
  root.appendChild(hint);
  bindSettingsNavLinks(hint);

  const addCard = document.createElement('div');
  addCard.className = 'form-card employees-add-card';
  addCard.innerHTML = `
    <h3>Ajouter un salarié</h3>
    <p class="muted">Le nouveau salarié apparaît dans le planning avec des patterns vides (6 semaines-types).</p>
    <div class="employees-add-row">
      <label>Nom <input type="text" id="emp-add-name" placeholder="Prénom ou nom complet" maxlength="60"></label>
      <label>Type
        <select id="emp-add-type" class="emp-type-select ${employeeTypeSelectClass(defaultTypeId)}">
          ${renderEmployeeTypeOptions(defaultTypeId)}
        </select>
      </label>
      <button type="button" class="primary" id="emp-add-btn">+ Ajouter</button>
    </div>`;
  root.appendChild(addCard);

  const listCard = document.createElement('div');
  listCard.className = 'form-card employees-list-card';
  listCard.innerHTML = `
    <h3>Salariés (${STATE.employees.length})</h3>
    <p class="muted">Glissez la poignée ⋮⋮ ou utilisez ↑ / ↓ pour définir l'ordre d'affichage (planning, listes). Modifiez le nom ou le type. Ouvrez « Infos » pour les coordonnées, la <b>fin de contrat</b> et les données personnelles (exportées dans le JSON).</p>`;

  if (STATE.employees.length === 0) {
    listCard.innerHTML += `<p class="muted">Aucun salarié pour l'instant.</p>`;
  } else {
    listCard.innerHTML += `
      <div class="employees-team-preview" aria-label="Aperçu couleurs de l'équipe">
        ${STATE.employees.map(emp => {
          const type = getEmployeeType(emp);
          return `<span class="employees-team-chip ${employeeTypeClass(emp)}" title="${escapeHtml(type)}">${escapeHtml(emp)}</span>`;
        }).join('')}
      </div>`;

    const tbl = document.createElement('table');
    tbl.className = 'list employees-list';
    tbl.innerHTML = `
      <thead>
        <tr>
          <th class="emp-order-col" title="Glisser pour réordonner">Ordre</th>
          <th>Nom</th>
          <th>Type</th>
          <th class="emp-actions-col">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${STATE.employees.map((emp, idx) => {
          const info = getEmployeeInfo(emp);
          const open = (STATE.ui.employeeDetailsOpen || []).includes(emp);
          const last = idx === STATE.employees.length - 1;
          return `
          <tr class="emp-summary-row" data-emp="${escapeHtml(emp)}" data-emp-idx="${idx}">
            <td class="emp-order-col">
              <span class="emp-drag-handle" draggable="true" title="Glisser pour déplacer" aria-label="Déplacer ${escapeHtml(emp)}">⋮⋮</span>
              <div class="emp-order-buttons">
                <button type="button" class="emp-move-btn" data-dir="up" data-idx="${idx}"${idx === 0 ? ' disabled' : ''} aria-label="Monter ${escapeHtml(emp)}">↑</button>
                <button type="button" class="emp-move-btn" data-dir="down" data-idx="${idx}"${last ? ' disabled' : ''} aria-label="Descendre ${escapeHtml(emp)}">↓</button>
              </div>
            </td>
            <td class="emp-name-cell ${employeeTypeClass(emp)}">
              <div class="emp-name-wrap">
                <input type="text" class="emp-rename-input" data-idx="${idx}"
                       value="${escapeHtml(emp)}" maxlength="60" aria-label="Nom de ${escapeHtml(emp)}">
                ${info.contractEndDate
                  ? `<span class="emp-contract-end-badge" title="Fin de contrat le ${escapeHtml(frFormatNumeric(info.contractEndDate))}">Fin ${escapeHtml(frFormatNumeric(info.contractEndDate))}</span>`
                  : ''}
              </div>
            </td>
            <td>
              <select class="emp-type-select ${employeeTypeSelectClass(getEmployeeTypeId(emp))}" data-emp="${escapeHtml(emp)}" aria-label="Type de ${escapeHtml(emp)}">
                ${renderEmployeeTypeOptions(getEmployeeTypeId(emp))}
              </select>
            </td>
            <td class="emp-actions-col">
              <button type="button" class="nav emp-save-btn" data-idx="${idx}">Enregistrer</button>
              <button type="button" class="nav emp-info-toggle" data-emp="${escapeHtml(emp)}" aria-expanded="${open}">
                ${open ? 'Infos ▲' : 'Infos ▼'}
              </button>
            </td>
          </tr>
          <tr class="emp-details-row${open ? '' : ' hidden'}" data-emp="${escapeHtml(emp)}">
            <td colspan="4">
              <div class="emp-info-panel">
                <div class="emp-info-grid">
                  ${EMPLOYEE_INFO_FIELDS.map(f => renderEmployeeInfoFieldHtml(emp, f, info)).join('')}
                </div>
                <p class="muted emp-contract-end-help">
                  Si une <b>fin de contrat</b> est renseignée, toutes les présences (plein et spéciale)
                  <em>après</em> cette date sont retirées du planning à l'enregistrement.
                  Le jour de fin reste modifiable.
                </p>
                <div class="emp-info-actions">
                  <button type="button" class="primary emp-info-save" data-emp="${escapeHtml(emp)}">Enregistrer les infos</button>
                </div>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>`;
    listCard.appendChild(tbl);
    bindEmployeeListReorder(listCard);
  }
  root.appendChild(listCard);

  const submitAdd = () => {
    const input = $('#emp-add-name');
    const type = $('#emp-add-type').value;
    const r = addEmployee(input.value, type);
    if (!r.ok) {
      toast(r.error, true);
      return;
    }
    toast(`Salarié « ${r.name} » ajouté`);
    persistAndRender();
  };

  $('#emp-add-btn').onclick = submitAdd;
  $('#emp-add-name').onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitAdd();
    }
  };

  listCard.querySelectorAll('.emp-type-select').forEach(sel => {
    syncEmployeeTypeSelectStyle(sel);
    sel.onchange = () => {
      syncEmployeeTypeSelectStyle(sel);
      syncEmployeeListRowColors(sel.closest('tr'), sel.value);
      setEmployeeType(sel.dataset.emp, sel.value);
      persistAndRender();
      toast(`Type « ${getEmployeeTypeLabelById(sel.value)} » enregistré pour ${sel.dataset.emp}`);
    };
  });

  const addTypeSel = $('#emp-add-type');
  if (addTypeSel) {
    addTypeSel.onchange = () => syncEmployeeTypeSelectStyle(addTypeSel);
  }

  listCard.querySelectorAll('.emp-save-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const oldName = STATE.employees[idx];
      if (!oldName) return;
      const row = btn.closest('tr');
      const input = row.querySelector('.emp-rename-input');
      const r = renameEmployee(oldName, input.value);
      if (!r.ok) {
        toast(r.error, true);
        input.value = oldName;
        return;
      }
      const typeSel = row.querySelector('.emp-type-select');
      if (typeSel && r.name !== oldName) {
        typeSel.dataset.emp = r.name;
        typeSel.setAttribute('aria-label', `Type de ${r.name}`);
      }
      toast(r.name === oldName ? 'Aucun changement' : `Renommé en « ${r.name} »`);
      persistAndRender();
    };
  });

  listCard.querySelectorAll('.emp-rename-input').forEach(input => {
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.closest('tr').querySelector('.emp-save-btn').click();
      }
    };
  });

  listCard.querySelectorAll('.emp-info-toggle').forEach(btn => {
    btn.onclick = () => {
      const emp = btn.dataset.emp;
      if (!STATE.ui.employeeDetailsOpen) STATE.ui.employeeDetailsOpen = [];
      const open = STATE.ui.employeeDetailsOpen.includes(emp);
      if (open) {
        STATE.ui.employeeDetailsOpen = STATE.ui.employeeDetailsOpen.filter(e => e !== emp);
      } else {
        STATE.ui.employeeDetailsOpen.push(emp);
      }
      persistAndRender();
    };
  });

  listCard.querySelectorAll('.emp-info-save').forEach(btn => {
    btn.onclick = () => {
      const emp = btn.dataset.emp;
      const panel = btn.closest('.emp-info-panel');
      if (!panel) return;
      const info = readEmployeeInfoFromPanel(panel);
      setEmployeeInfo(emp, info);
      let cleared = 0;
      if (info.contractEndDate) {
        cleared = enforceEmployeeContractEnd(emp).cleared;
      }
      saveState();
      if (sessionInitialized) markSessionDirty();
      let msg = `Informations enregistrées pour ${emp}`;
      if (info.contractEndDate) {
        msg += cleared > 0
          ? ` — ${cleared} présence${cleared > 1 ? 's' : ''} retirée${cleared > 1 ? 's' : ''} après le ${frFormatNumeric(info.contractEndDate)}`
          : ` — fin de contrat le ${frFormatNumeric(info.contractEndDate)}`;
      }
      toast(msg);
      persistAndRender();
    };
  });
}

function bindEmployeeListReorder(listCard) {
  const tbody = listCard.querySelector('table.employees-list tbody');
  if (!tbody) return;

  let dragFromIdx = null;

  tbody.querySelectorAll('.emp-drag-handle').forEach(handle => {
    handle.addEventListener('dragstart', (e) => {
      const row = handle.closest('.emp-summary-row');
      if (!row) return;
      dragFromIdx = parseInt(row.dataset.empIdx, 10);
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFromIdx));
    });
    handle.addEventListener('dragend', () => {
      dragFromIdx = null;
      tbody.querySelectorAll('.emp-summary-row').forEach(r => {
        r.classList.remove('is-dragging', 'emp-drop-target');
      });
    });
  });

  tbody.querySelectorAll('.emp-summary-row').forEach(row => {
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tbody.querySelectorAll('.emp-summary-row.emp-drop-target').forEach(r => {
        if (r !== row) r.classList.remove('emp-drop-target');
      });
      row.classList.add('emp-drop-target');
    });
    row.addEventListener('dragleave', (e) => {
      if (!row.contains(e.relatedTarget)) row.classList.remove('emp-drop-target');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('emp-drop-target');
      const fromIdx = dragFromIdx != null
        ? dragFromIdx
        : parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = parseInt(row.dataset.empIdx, 10);
      if (Number.isNaN(fromIdx) || Number.isNaN(toIdx) || fromIdx === toIdx) return;
      const r = reorderEmployee(fromIdx, toIdx);
      if (!r.ok) {
        toast(r.error || 'Réordonnancement impossible.', true);
        return;
      }
      persistAndRender();
    });
  });

  listCard.querySelectorAll('.emp-move-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.idx, 10);
      const toIdx = btn.dataset.dir === 'up' ? idx - 1 : idx + 1;
      if (toIdx < 0 || toIdx >= STATE.employees.length) return;
      reorderEmployee(idx, toIdx);
      persistAndRender();
    };
  });
}

function bindSettingsNavLinks(root) {
  if (!root) return;
  root.querySelectorAll('.settings-goto').forEach(btn => {
    btn.onclick = () => goToTab(btn.dataset.tab || 'settings', btn.dataset.hash || '');
  });
}

function renderSettingsEditor(root) {
  const header = document.createElement('div');
  header.className = 'controls settings-header';
  header.innerHTML = `
    <div class="label">Configuration</div>
    <div class="help-text">
      Paramètres globaux de l'application : types et couleurs, ancrage du cycle patterns,
      informations pharmacie pour les contrats PDF.
    </div>`;
  root.appendChild(header);

  const toc = document.createElement('nav');
  toc.className = 'settings-toc';
  toc.setAttribute('aria-label', 'Sections de configuration');
  toc.innerHTML = `
    <a href="#cfg-emp-types" class="settings-toc-link">Types de salariés</a>
    <a href="#cfg-conge-types" class="settings-toc-link">Modes de congés</a>
    <a href="#cfg-pattern-anchor" class="settings-toc-link">Ancrage cycle</a>
    <a href="#cfg-contract-party" class="settings-toc-link">Pharmacie &amp; employeur</a>
    <a href="#cfg-users" class="settings-toc-link auth-admin-only">Comptes utilisateurs</a>
    <a href="#cfg-related" class="settings-toc-link">Autres réglages</a>`;
  root.appendChild(toc);

  toc.querySelectorAll('.settings-toc-link').forEach(link => {
    link.onclick = (e) => {
      e.preventDefault();
      const id = link.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  mountEmployeeTypeCatalogSection(root, { sectionId: 'cfg-emp-types' });
  mountCongeTypeCatalogSection(root, { sectionId: 'cfg-conge-types' });
  mountPatternAnchorPanel(root, { sectionId: 'cfg-pattern-anchor', idPrefix: 'cfg-pat-anchor', compactHelp: true });

  mountContractPartySection(root, { sectionId: 'cfg-contract-party' });

  if (typeof renderAdminUsersSection === 'function') {
    renderAdminUsersSection(root);
  }

  const related = document.createElement('div');
  related.className = 'form-card settings-related-card settings-section';
  related.id = 'cfg-related';
  related.innerHTML = `
    <h3>Autres réglages</h3>
    <p class="muted">Ces éléments se gèrent dans leurs onglets dédiés :</p>
    <div class="settings-related-grid">
      <button type="button" class="settings-related-item settings-goto" data-tab="patterns">
        <span class="settings-related-icon">🧩</span>
        <span class="settings-related-label">Modèle de cycle (patterns)</span>
        <span class="settings-related-desc">Grille 6 semaines-types et import vers le planning</span>
      </button>
      <button type="button" class="settings-related-item settings-goto" data-tab="feries">
        <span class="settings-related-icon">🎉</span>
        <span class="settings-related-label">Jours fériés</span>
        <span class="settings-related-desc">Ponts et jours offerts personnalisés</span>
      </button>
      <button type="button" class="settings-related-item settings-goto" data-tab="gardes">
        <span class="settings-related-icon">🏥</span>
        <span class="settings-related-label">Jours de garde</span>
        <span class="settings-related-desc">Périodes de garde affichées dans le planning</span>
      </button>
      <button type="button" class="settings-related-item settings-goto" data-tab="pantecotes">
        <span class="settings-related-icon">🤝</span>
        <span class="settings-related-label">${SOLIDARITE_LABELS}</span>
        <span class="settings-related-desc">Heures travaillées et récupérées par journée de solidarité</span>
      </button>
      <button type="button" class="settings-related-item settings-goto" data-tab="contract">
        <span class="settings-related-icon">📄</span>
        <span class="settings-related-label">Contrats PDF</span>
        <span class="settings-related-desc">Journées travaillées par salarié</span>
      </button>
      <button type="button" class="settings-related-item settings-goto" data-tab="cdi">
        <span class="settings-related-icon">📋</span>
        <span class="settings-related-label">CDI</span>
        <span class="settings-related-desc">Semaines de demi-journées travaillées</span>
      </button>
    </div>`;
  root.appendChild(related);
  bindSettingsNavLinks(related);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
