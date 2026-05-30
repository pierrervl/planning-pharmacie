/* Éditeurs patterns, affectations, congés, fériés */
'use strict';

const PATTERN_DAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

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
  const curMon = mondayOf(fromISO(STATE.ui.currentDate || todayISO()));
  const defaultAnchorYear = STATE.ui.patternAnchorEditYear ?? getISOWeekYear(curMon);
  const defaultAnchorWeek = STATE.ui.patternAnchorEditWeek ?? getISOWeek(curMon);
  const defaultAnchorPattern = STATE.ui.patternAnchorEditName ?? getPatternWeekNameForMonday(curMon);

  const ctrl = document.createElement('div');
  ctrl.className = 'controls pattern-controls';
  ctrl.innerHTML = `
    <div class="label">Modèle de cycle — 6 semaines</div>
    <div class="help-text">
      Modèle indépendant du planning affiché : chaque salarié, demi-journées M/A, 6 semaines-types
      (<b>S1 → S2 → S3 → S1' → S2' → S3'</b>). Clic = plein ↔ repos.
      Tous les salariés sont listés ici (filtres latéraux ignorés).
      L'ancrage sert <b>uniquement à l'import</b> : S1 = semaine ISO ${anchorSummary.isoWeek} (${anchorSummary.isoYear}), lundi ${anchorSummary.anchorLabel}.
    </div>
    <div class="spacer"></div>
    <label>Affichage :
      <select id="pat-layout">
        <option value="unified" ${layout === 'unified' ? 'selected' : ''}>1 tableau — 6 semaines</option>
        <option value="split" ${layout === 'split' ? 'selected' : ''}>6 tableaux — 1 par semaine</option>
      </select>
    </label>
  `;
  root.appendChild(ctrl);

  const anchorPanel = document.createElement('div');
  anchorPanel.className = 'form-card pattern-anchor-panel no-print';
  anchorPanel.innerHTML = `
    <h3>Ancrage calendaire (pour l'import)</h3>
    <p class="muted">
      Indique quelle semaine ISO correspond à quelle semaine du cycle (S1, S2, S3…).
      <strong>Cela ne modifie pas le planning en vue Semaine</strong> — seul un import explicite
      (ci-dessous ou bouton ↓ Importer par semaine) recopie le modèle dans les cellules.
    </p>
    <p class="pattern-anchor-current">
      <strong>Actuellement :</strong> S1 = semaine ISO <b>${anchorSummary.isoWeek}</b> (${anchorSummary.isoYear})
      — lundi ${anchorSummary.anchorLabel}
    </p>
    <div class="form-grid pattern-anchor-grid">
      <label>Année ISO
        <input type="number" id="pat-anchor-year" min="2020" max="2100" value="${defaultAnchorYear}">
      </label>
      <label>Semaine ISO
        <input type="number" id="pat-anchor-week" min="1" max="53" value="${defaultAnchorWeek}">
      </label>
      <label>Semaine du cycle
        <select id="pat-anchor-pattern">
          ${PATTERN_CYCLE_WEEKS.map(p =>
            `<option value="${patternEscapeAttr(p)}"${p === defaultAnchorPattern ? ' selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </label>
      <button type="button" class="primary" id="pat-anchor-apply">Enregistrer l'ancrage</button>
    </div>
    <p class="muted pattern-anchor-preview" id="pat-anchor-preview"></p>
  `;
  root.appendChild(anchorPanel);
  attachPatternAnchorHandlers(anchorPanel);

  const importPanel = document.createElement('div');
  importPanel.className = 'form-card pattern-import-panel no-print';
  importPanel.innerHTML = `
    <h3>Importer le cycle vers le planning</h3>
    <p class="muted">
      Recopie les 6 semaines-types (S1…S3') sur une période calendaire, pour tous les salariés,
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

function renderPatternEditorCell(emp, pname, dayIdx, shift, weekBoundary) {
  const v = getPatternWeekValue(emp, pname, dayIdx, shift);
  const shiftCls = shift === 'matin' ? 'shift-matin' : 'shift-aprem';
  const cls = ['cell', 'editable', 'pattern-cell', patternCellDisplayClass(v), shiftCls];
  if (weekBoundary && shift === 'matin') cls.push('week-start');
  const title = `${emp} — semaine ${pname} — ${PATTERN_DAY_LABELS[dayIdx]} — ${shift === 'matin' ? 'Matin' : 'Après-midi'} — clic : plein ↔ repos`;
  return `<td class="${cls.join(' ')}" data-pat-emp="${patternEscapeAttr(emp)}" data-pat-name="${patternEscapeAttr(pname)}" data-pat-day="${dayIdx}" data-pat-shift="${shift}" title="${patternEscapeAttr(title)}"></td>`;
}

function buildPatternTableHeader(thead, weekNames, headRows) {
  const showM = STATE.ui.filterShift !== 'aprem';
  const showA = STATE.ui.filterShift !== 'matin';
  const colsPerDay = (showM ? 1 : 0) + (showA ? 1 : 0);

  const trWeeks = document.createElement('tr');
  trWeeks.innerHTML = `<th class="empname" rowspan="${headRows}">Nom</th>`;
  for (const pname of weekNames) {
    trWeeks.innerHTML += `<th class="week-band" colspan="${colsPerDay * 7}">Semaine ${pname}</th>`;
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

function buildPatternTableBody(tbody, visibleEmps, weekNames) {
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
    });
    tbody.appendChild(tr);
  }
}

function attachPatternCellHandlers(container) {
  container.querySelectorAll('td.pattern-cell[data-pat-emp]').forEach(el => {
    el.onclick = () => {
      const emp = el.dataset.patEmp;
      const pname = el.dataset.patName;
      const dayIdx = parseInt(el.dataset.patDay, 10);
      const shift = el.dataset.patShift;
      const cur = getPatternWeekValue(emp, pname, dayIdx, shift);
      setPatternWeekValue(emp, pname, dayIdx, shift, cur === 1 ? 0 : 1);
      persistAndRender();
    };
  });
}

function renderPatternsUnified(root, visibleEmps) {
  const wrap = document.createElement('div');
  wrap.className = 'planning-wrap';
  const tbl = document.createElement('table');
  tbl.className = 'planning';

  const thead = document.createElement('thead');
  buildPatternTableHeader(thead, PATTERN_CYCLE_WEEKS, 3);

  const tbody = document.createElement('tbody');
  buildPatternTableBody(tbody, visibleEmps, PATTERN_CYCLE_WEEKS);

  tbl.appendChild(thead);
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  root.appendChild(wrap);
  attachPatternCellHandlers(wrap);
}

function renderPatternsSplit(root, visibleEmps) {
  const wrap = document.createElement('div');
  wrap.className = 'patterns-split';

  for (const pname of PATTERN_CYCLE_WEEKS) {
    const card = document.createElement('div');
    card.className = 'form-card pattern-week-card';
    card.innerHTML = `<h3>Semaine-type <span class="pname">${pname}</span></h3>`;

    const inner = document.createElement('div');
    inner.className = 'planning-wrap';
    const tbl = document.createElement('table');
    tbl.className = 'planning';

    const thead = document.createElement('thead');
    buildPatternTableHeader(thead, [pname], 3);

    const tbody = document.createElement('tbody');
    buildPatternTableBody(tbody, visibleEmps, [pname]);

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

function attachPatternAnchorHandlers(panel) {
  const yearEl = panel.querySelector('#pat-anchor-year');
  const weekEl = panel.querySelector('#pat-anchor-week');
  const patternEl = panel.querySelector('#pat-anchor-pattern');
  const previewEl = panel.querySelector('#pat-anchor-preview');
  const applyBtn = panel.querySelector('#pat-anchor-apply');

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
          ${PATTERN_CYCLE_WEEKS.map(p => `<option value="${p}">${p} (début de cycle)</option>`).join('')}
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

const CONGE_TYPES = ['CP','RTT','Maladie','Formation','Sans solde','Récupération'];

function renderCongesEditor(root) {
  // formulaire d'ajout
  const form = document.createElement('div');
  form.className = 'form-card';
  form.innerHTML = `
    <h3>Ajouter un congé / absence</h3>
    <div class="form-grid">
      <div class="field">
        <label>Salarié</label>
        <select id="cg-emp">
          ${STATE.employees.map(e => `<option>${e}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Type</label>
        <select id="cg-type">
          ${CONGE_TYPES.map(t => `<option>${t}</option>`).join('')}
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
    const c = {
      id: 'cg_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
      emp: $('#cg-emp').value,
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
      const typeCls = 'type-' + c.type.replace(' ', '-');
      h += `<tr>
        <td>${c.emp}</td>
        <td><span class="type-badge ${typeCls}">${c.type}</span></td>
        <td>${frFormatNumeric(c.start)}</td>
        <td>${frFormatNumeric(c.end)}</td>
        <td>${days}</td>
        <td>${c.comment || ''}</td>
        <td><button class="del" data-id="${c.id}">Supprimer</button></td>
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
      Indique les dates où la pharmacie assure la garde (week-ends, jours fériés, etc.).
      Les jours de garde apparaissent dans le planning avec un en-tête de colonne rouge clair.
    </div>
    <div class="spacer"></div>
    <label>Année : <input type="number" id="gd-year" value="${STATE.ui.yearShown}" min="2020" max="2100" style="width:90px"></label>
  `;
  root.appendChild(ctrl);

  const form = document.createElement('div');
  form.className = 'form-card';
  form.innerHTML = `
    <h3>Ajouter un jour de garde</h3>
    <div class="form-grid">
      <div class="field">
        <label>Date</label>
        <input type="text" class="fr-date" id="gd-date" data-iso="${todayISO()}" value="${frFormatNumeric(todayISO())}">
      </div>
      <div class="field">
        <label>Libellé</label>
        <input type="text" id="gd-label" placeholder="ex : Garde de week-end">
      </div>
      <button class="primary" id="gd-add">+ Ajouter</button>
    </div>
  `;
  root.appendChild(form);

  $('#gd-add').onclick = () => {
    const d = readFrDateInput($('#gd-date'));
    const l = ($('#gd-label').value || '').trim() || 'Garde';
    if (!d) return;
    const existing = STATE.gardes.find(g => g.date === d);
    if (existing) {
      existing.label = l;
    } else {
      STATE.gardes.push({
        id: 'gd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        date: d,
        label: l
      });
    }
    STATE.gardes.sort((a, b) => a.date.localeCompare(b.date));
    persistAndRender();
    toast('Jour de garde enregistré');
  };

  const card = document.createElement('div');
  card.className = 'form-card';
  const year = STATE.ui.yearShown;
  const allGardes = collectGardesForYear(year);
  let h = `<h3>Jours de garde ${year} (${allGardes.length})</h3>`;
  if (allGardes.length === 0) {
    h += `<p class="muted">Aucun jour de garde pour ${year}.</p>`;
  } else {
    h += `<table class="list"><thead><tr>
      <th>Date</th><th>Jour</th><th>Libellé</th><th></th>
    </tr></thead><tbody>`;
    for (const g of allGardes) {
      const d = fromISO(g.date);
      h += `<tr>
        <td>${g.date}</td>
        <td>${DAY_NAMES_LONG[d.getDay()]}</td>
        <td>${g.label || 'Garde'}</td>
        <td><button class="del" data-gd-rm="${g.id}">Retirer</button></td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }
  card.innerHTML = h;
  root.appendChild(card);

  $('#gd-year').onchange = (e) => { STATE.ui.yearShown = parseInt(e.target.value, 10); persistAndRender(); };
  root.querySelectorAll('[data-gd-rm]').forEach(b => {
    b.onclick = () => {
      STATE.gardes = STATE.gardes.filter(g => g.id !== b.dataset.gdRm);
      persistAndRender();
    };
  });
}

/* ===========================================================================
   ÉDITEUR ÉQUIPE — ajout / renommage salariés
   ========================================================================= */

function renderEmployeesEditor(root) {
  const legendCard = document.createElement('div');
  legendCard.className = 'form-card employees-legend-card';
  legendCard.innerHTML = `
    <h3>Types de salariés</h3>
    <div class="employees-type-legend">
      <div class="employees-type-group">
        <span class="employees-type-group-label">Pharmacien — vert</span>
        <div class="employees-type-group-chips">
          <span class="employees-type-chip emp-type-pharm-etudiant">Pharmacien étudiant</span>
          <span class="employees-type-chip emp-type-pharm-salarie">Pharmacien salarié</span>
          <span class="employees-type-chip emp-type-pharm-remplacant">Pharmacien remplaçant</span>
        </div>
      </div>
      <div class="employees-type-group">
        <span class="employees-type-group-label">Préparateur — violet</span>
        <div class="employees-type-group-chips">
          <span class="employees-type-chip emp-type-prep-etudiant">Préparateur étudiant</span>
          <span class="employees-type-chip emp-type-prep-salarie">Préparateur salarié</span>
        </div>
      </div>
    </div>
    <p class="muted">Étudiant = teinte claire · Salarié = teinte plus soutenue. Couleur visible sur le nom en vue Semaine.</p>`;
  root.appendChild(legendCard);

  const addCard = document.createElement('div');
  addCard.className = 'form-card employees-add-card';
  addCard.innerHTML = `
    <h3>Ajouter un salarié</h3>
    <p class="muted">Le nouveau salarié apparaît dans le planning avec des patterns vides (6 semaines-types).</p>
    <div class="employees-add-row">
      <label>Nom <input type="text" id="emp-add-name" placeholder="Prénom ou nom complet" maxlength="60"></label>
      <label>Type
        <select id="emp-add-type" class="emp-type-select ${employeeTypeSelectClass('Pharmacien salarié')}">
          ${renderEmployeeTypeOptions('Pharmacien salarié')}
        </select>
      </label>
      <button type="button" class="primary" id="emp-add-btn">+ Ajouter</button>
    </div>`;
  root.appendChild(addCard);

  const listCard = document.createElement('div');
  listCard.className = 'form-card employees-list-card';
  listCard.innerHTML = `
    <h3>Salariés (${STATE.employees.length})</h3>
    <p class="muted">Modifiez le nom ou le type. Aperçu des couleurs ci-dessous · le type est enregistré automatiquement.</p>`;

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
          <th>Nom</th>
          <th>Type</th>
          <th class="emp-actions-col">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${STATE.employees.map((emp, idx) => `
          <tr data-emp="${escapeHtml(emp)}">
            <td class="emp-name-cell ${employeeTypeClass(emp)}">
              <input type="text" class="emp-rename-input" data-idx="${idx}"
                     value="${escapeHtml(emp)}" maxlength="60" aria-label="Nom de ${escapeHtml(emp)}">
            </td>
            <td>
              <select class="emp-type-select ${employeeTypeSelectClass(getEmployeeType(emp))}" data-emp="${escapeHtml(emp)}" aria-label="Type de ${escapeHtml(emp)}">
                ${renderEmployeeTypeOptions(getEmployeeType(emp))}
              </select>
            </td>
            <td class="emp-actions-col">
              <button type="button" class="nav emp-save-btn" data-idx="${idx}">Enregistrer</button>
            </td>
          </tr>`).join('')}
      </tbody>`;
    listCard.appendChild(tbl);
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
      toast(`Type « ${sel.value} » enregistré pour ${sel.dataset.emp}`);
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
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
