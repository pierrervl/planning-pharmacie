/* CDI — interface et export PDF */
'use strict';

function cdiCellClass(worked) {
  return worked ? 'cdi-cell worked' : 'cdi-cell';
}

function renderCdiWeekGrid(emp, week) {
  const rows = [
    { shift: 'matin', label: 'M' },
    { shift: 'aprem', label: 'A' },
  ];
  let body = '';
  for (const row of rows) {
    body += `<tr>
      <th class="cdi-shift-label">${row.label}</th>`;
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const worked = week.days[dayIdx][row.shift];
      body += `<td class="${cdiCellClass(worked)}"
        data-cdi-emp="${escapeHtml(emp)}"
        data-cdi-week="${escapeHtml(week.id)}"
        data-cdi-day="${dayIdx}"
        data-cdi-shift="${row.shift}"
        title="${CDI_DAY_LABELS[dayIdx]} — ${row.shift === 'matin' ? 'Matin' : 'Après-midi'} — clic pour ${worked ? 'retirer' : 'ajouter'}"></td>`;
    }
    body += `</tr>`;
  }
  const halfDays = countCdiWeekHalfDays(week);
  return `
    <div class="cdi-week-card" data-week-id="${escapeHtml(week.id)}">
      <div class="cdi-week-head">
        <label class="cdi-week-label-field">Libellé
          <input type="text" class="cdi-week-label-input" data-week-id="${escapeHtml(week.id)}"
                 value="${escapeHtml(week.label)}" maxlength="60" placeholder="Ex. Semaine 1">
        </label>
        <span class="cdi-week-summary muted">${halfDays} demi-journée${halfDays > 1 ? 's' : ''}</span>
        <button type="button" class="nav del cdi-week-del" data-week-id="${escapeHtml(week.id)}">Supprimer</button>
      </div>
      <div class="cdi-week-grid-wrap">
        <table class="cdi-week-grid">
          <thead>
            <tr>
              <th class="cdi-shift-label"></th>
              ${CDI_DAY_LABELS.map(d => `<th>${d}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;
}

function bindCdiWeekGrids(root, emp) {
  root.querySelectorAll('.cdi-cell').forEach(cell => {
    cell.onclick = () => {
      const weekId = cell.dataset.cdiWeek;
      const dayIdx = parseInt(cell.dataset.cdiDay, 10);
      const shift = cell.dataset.cdiShift;
      toggleCdiShift(emp, weekId, dayIdx, shift);
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
    };
  });

  root.querySelectorAll('.cdi-week-label-input').forEach(input => {
    input.onchange = () => {
      updateCdiWeekLabel(emp, input.dataset.weekId, input.value);
      saveState();
      if (sessionInitialized) markSessionDirty();
    };
  });

  root.querySelectorAll('.cdi-week-del').forEach(btn => {
    btn.onclick = () => {
      const week = getCdiWeeks(emp).find(w => w.id === btn.dataset.weekId);
      const label = week ? week.label : 'cette semaine';
      if (!confirm(`Supprimer « ${label} » ?`)) return;
      removeCdiWeek(emp, btn.dataset.weekId);
      saveState();
      if (sessionInitialized) markSessionDirty();
      persistAndRender();
      toast('Semaine supprimée');
    };
  });
}

function persistCdiMetaFromDom() {
  STATE.ui.cdiDocTitle = ($('#cdi-doc-title')?.value || '').trim()
    || 'Planning CDI — demi-journées travaillées';
  saveState();
}

function renderCdiEditor(root) {
  if (STATE.employees.length === 0) {
    root.innerHTML = `
      <div class="form-card">
        <h3>CDI</h3>
        <p class="muted">Ajoutez d'abord des salariés dans l'onglet Équipe.</p>
      </div>`;
    return;
  }

  const emp = STATE.ui.cdiEmp && STATE.employees.includes(STATE.ui.cdiEmp)
    ? STATE.ui.cdiEmp
    : STATE.employees[0];
  STATE.ui.cdiEmp = emp;

  const weeks = getCdiWeeks(emp);
  const totalHalf = countCdiTotalHalfDays(weeks);
  const docTitle = STATE.ui.cdiDocTitle || 'Planning CDI — demi-journées travaillées';

  const ctrl = document.createElement('div');
  ctrl.className = 'controls cdi-controls no-print';
  ctrl.innerHTML = `
    <div class="label">CDI — demi-journées travaillées</div>
    <div class="help-text">
      Sélectionnez un salarié, ajoutez autant de semaines que nécessaire et indiquez les demi-journées travaillées
      (M = matin, A = après-midi). Clic sur une cellule pour activer ou retirer une demi-journée.
    </div>`;
  root.appendChild(ctrl);

  const metaCard = document.createElement('div');
  metaCard.className = 'form-card cdi-meta-card no-print';
  metaCard.innerHTML = `
    <div class="contract-select-row">
      <label>Salarié concerné
        <select id="cdi-emp-select">
          ${STATE.employees.map(e =>
            `<option value="${escapeHtml(e)}"${e === emp ? ' selected' : ''}>${escapeHtml(e)}</option>`
          ).join('')}
        </select>
      </label>
      <label>Titre du document
        <input type="text" id="cdi-doc-title" value="${escapeHtml(docTitle)}" maxlength="120">
      </label>
    </div>`;
  root.appendChild(metaCard);

  const infoCard = document.createElement('div');
  infoCard.className = 'form-card contract-info-card';
  infoCard.innerHTML = `
    <h3>Salarié sélectionné</h3>
    <p class="muted no-print">Coordonnées modifiables dans <b>Équipe → Infos</b>.</p>
    <table class="contract-info-table">
      <tbody>${buildEmployeeInfoRowsHtml(emp)}</tbody>
    </table>`;
  root.appendChild(infoCard);

  const weeksCard = document.createElement('div');
  weeksCard.className = 'form-card cdi-weeks-card no-print';
  weeksCard.innerHTML = `
    <div class="cdi-weeks-head">
      <h3>Semaines (${weeks.length})</h3>
      <span class="muted cdi-total-summary">${totalHalf} demi-journée${totalHalf > 1 ? 's' : ''} au total</span>
      <button type="button" class="primary" id="cdi-week-add">+ Ajouter une semaine</button>
    </div>
    <p class="muted">Chaque semaine représente un modèle de présence (7 jours × matin / après-midi). Ajoutez-en autant que nécessaire.</p>`;

  if (weeks.length === 0) {
    weeksCard.innerHTML += `<p class="muted cdi-empty-weeks">Aucune semaine pour l'instant — cliquez sur « + Ajouter une semaine ».</p>`;
  } else {
    const list = document.createElement('div');
    list.className = 'cdi-weeks-list';
    list.innerHTML = weeks.map(w => renderCdiWeekGrid(emp, w)).join('');
    weeksCard.appendChild(list);
  }
  root.appendChild(weeksCard);

  const printCard = document.createElement('div');
  printCard.className = 'form-card cdi-print-preview';
  printCard.innerHTML = `<h3>Aperçu</h3>`;
  if (weeks.length === 0) {
    printCard.innerHTML += `<p class="muted">Aucune semaine à afficher.</p>`;
  } else {
    printCard.innerHTML += weeks.map(w => {
      const halfDays = countCdiWeekHalfDays(w);
      let rows = '';
      for (const row of [{ shift: 'matin', label: 'Matin' }, { shift: 'aprem', label: 'Après-midi' }]) {
        rows += `<tr><th>${row.label}</th>`;
        for (let i = 0; i < 7; i++) {
          const on = w.days[i][row.shift];
          rows += `<td class="cdi-preview-cell${on ? ' on' : ''}">${on ? '●' : '—'}</td>`;
        }
        rows += `</tr>`;
      }
      return `
        <div class="cdi-preview-week">
          <h4>${escapeHtml(w.label)} <span class="muted">(${halfDays} demi-journée${halfDays > 1 ? 's' : ''})</span></h4>
          <table class="list cdi-preview-table">
            <thead><tr><th></th>${CDI_DAY_LABELS.map(d => `<th>${d}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');
  }
  root.appendChild(printCard);

  const actions = document.createElement('div');
  actions.className = 'contract-print-actions no-print';
  actions.innerHTML = `
    <button type="button" class="primary-btn" id="cdi-pdf-btn">📄 Générer le PDF</button>
    <span class="muted">Format portrait · enregistrez via « Microsoft Print to PDF » ou équivalent.</span>`;
  root.appendChild(actions);

  $('#cdi-emp-select').onchange = (e) => {
    persistCdiMetaFromDom();
    STATE.ui.cdiEmp = e.target.value;
    persistAndRender();
  };

  $('#cdi-doc-title').onchange = persistCdiMetaFromDom;

  $('#cdi-week-add').onclick = () => {
    const r = addCdiWeek(emp);
    saveState();
    if (sessionInitialized) markSessionDirty();
    persistAndRender();
    toast(`« ${r.week.label} » ajoutée`);
  };

  bindCdiWeekGrids(weeksCard, emp);

  $('#cdi-pdf-btn').onclick = () => printCdiPdf();
}

function printCdiPdf() {
  persistCdiMetaFromDom();

  const emp = STATE.ui.cdiEmp && STATE.employees.includes(STATE.ui.cdiEmp)
    ? STATE.ui.cdiEmp
    : STATE.employees[0];
  if (!emp) {
    toast('Aucun salarié sélectionné.', true);
    return;
  }

  const weeks = getCdiWeeks(emp);
  if (weeks.length === 0) {
    toast('Ajoutez au moins une semaine avant de générer le PDF.', true);
    return;
  }

  const totalHalf = countCdiTotalHalfDays(weeks);
  const docTitle = STATE.ui.cdiDocTitle || 'Planning CDI — demi-journées travaillées';
  const pharmacy = getPharmacyInfo();
  const employer = getEmployerInfo();
  const empInfo = getEmployeeInfo(emp);
  const empType = getEmployeeType(emp);

  const styleEl = document.createElement('style');
  styleEl.id = 'cdi-print-page-style';
  styleEl.textContent = `
    @page { size: A4 portrait; margin: 14mm 16mm; }
    @media print {
      html, body { background: #fff !important; }
    }`;

  const weeksHtml = weeks.map(w => {
    const halfDays = countCdiWeekHalfDays(w);
    let rows = '';
    for (const row of [{ shift: 'matin', label: 'Matin' }, { shift: 'aprem', label: 'Après-midi' }]) {
      rows += `<tr><th>${row.label}</th>`;
      for (let i = 0; i < 7; i++) {
        const on = w.days[i][row.shift];
        rows += `<td class="cdi-pdf-cell${on ? ' on' : ''}">${on ? 'Travaillé' : '—'}</td>`;
      }
      rows += `</tr>`;
    }
    return `
      <section class="cdi-pdf-week">
        <h3 class="cdi-pdf-week-title">${escapeHtml(w.label)}</h3>
        <p class="cdi-pdf-week-sub">${halfDays} demi-journée${halfDays > 1 ? 's' : ''} travaillée${halfDays > 1 ? 's' : ''}</p>
        <table class="cp-table cdi-pdf-table">
          <thead>
            <tr><th></th>${CDI_DAY_LABELS.map(d => `<th>${d}</th>`).join('')}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }).join('');

  const root = document.createElement('div');
  root.id = 'cdi-print-root';
  root.className = 'cdi-print-root';
  root.innerHTML = `
    <article class="cp-doc">
      <header class="cp-header">
        <div class="cp-header-top">
          <div class="cp-brand">
            ${pharmacy.name ? `<div class="cp-brand-name">${escapeHtml(pharmacy.name)}</div>` : ''}
            ${pharmacy.address ? `<div class="cp-brand-sub">${escapeHtml(pharmacy.address)}</div>` : ''}
          </div>
          <div class="cp-doc-meta">
            <div class="cp-doc-date">${escapeHtml(frFormat(new Date()))}</div>
          </div>
        </div>
        <h1 class="cp-title">${escapeHtml(docTitle)}</h1>
        <p class="cp-period">${weeks.length} semaine${weeks.length > 1 ? 's' : ''} · ${totalHalf} demi-journée${totalHalf > 1 ? 's' : ''} au total</p>
      </header>

      <div class="cp-parties">
        ${buildEmployerPrintBlock(pharmacy, employer)}
        ${buildPrintPartyBlock('Salarié', emp, [
          { label: 'Type', value: empType },
          ...partyInfoLines(EMPLOYEE_INFO_FIELDS, empInfo),
        ])}
      </div>

      <section class="cp-schedule cdi-pdf-schedule">
        <div class="cp-block-head cp-schedule-head">
          <span class="cp-block-title">Demi-journées travaillées</span>
          <span class="cp-block-sub">M = matin · A = après-midi</span>
        </div>
        ${weeksHtml}
      </section>

      <footer class="cp-footer">
        <p class="cp-legal">
          Document établi en deux exemplaires. Chaque partie reconnaît avoir pris connaissance
          du planning des demi-journées travaillées ci-dessus.
        </p>
        <div class="cp-signatures">
          <div class="cp-sig">
            <p class="cp-sig-label">L'employeur</p>
            <p class="cp-sig-hint">${escapeHtml(employer.name || pharmacy.name || '')}</p>
            <div class="cp-sig-line"></div>
            <p class="cp-sig-date">Date et signature</p>
          </div>
          <div class="cp-sig">
            <p class="cp-sig-label">Le salarié</p>
            <p class="cp-sig-hint">${escapeHtml(emp)}</p>
            <div class="cp-sig-line"></div>
            <p class="cp-sig-date">Date et signature</p>
          </div>
        </div>
      </footer>
    </article>`;

  document.head.appendChild(styleEl);
  document.body.appendChild(root);
  document.body.classList.add('printing-cdi');

  const cleanup = () => {
    root.remove();
    styleEl.remove();
    document.body.classList.remove('printing-cdi');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
