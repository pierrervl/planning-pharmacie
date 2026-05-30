/* Contrat — interface et export PDF (impression) */
'use strict';

function buildEmployeeInfoRowsHtml(emp) {
  const info = getEmployeeInfo(emp);
  const type = getEmployeeType(emp);
  let rows = `
    <tr><th>Nom</th><td>${escapeHtml(emp)}</td></tr>
    <tr><th>Type</th><td>${escapeHtml(type)}</td></tr>`;
  for (const f of EMPLOYEE_INFO_FIELDS) {
    rows += `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(formatEmployeeInfoDisplay(f, info[f.key]))}</td></tr>`;
  }
  return rows;
}

function persistContractMetaFromDom() {
  STATE.ui.contractDocTitle = ($('#contract-doc-title')?.value || '').trim()
    || 'Planning des journées de travail';
  const partyPanel = $('#contract-party-panel');
  if (partyPanel) {
    setPharmacyInfo(readPartyInfoFromPanel(partyPanel, 'pharmacy', PHARMACY_INFO_FIELDS));
    setEmployerInfo(readPartyInfoFromPanel(partyPanel, 'employer', EMPLOYER_INFO_FIELDS));
  }
  saveState();
}

function mountContractPartySection(root, options = {}) {
  const pharmacy = getPharmacyInfo();
  const employer = getEmployerInfo();
  const panelId = options.panelId || 'contract-party-panel';

  const partyCard = document.createElement('div');
  partyCard.className = 'form-card contract-party-card no-print settings-section';
  if (options.sectionId) partyCard.id = options.sectionId;
  partyCard.innerHTML = `
    <h3>Pharmacie &amp; employeur</h3>
    <p class="muted">Ces informations apparaissent dans le bloc « Employeur » des contrats PDF.</p>
    <div class="contract-party-columns" id="${escapeHtml(panelId)}">
      <div class="contract-party-col">
        <h4>Établissement</h4>
        <div class="contract-party-grid">
          ${PHARMACY_INFO_FIELDS.map(f => renderPartyInfoFieldHtml('pharmacy', f, pharmacy)).join('')}
        </div>
      </div>
      <div class="contract-party-col">
        <h4>Employeur</h4>
        <div class="contract-party-grid">
          ${EMPLOYER_INFO_FIELDS.map(f => renderPartyInfoFieldHtml('employer', f, employer)).join('')}
        </div>
      </div>
    </div>
    <button type="button" class="primary contract-party-save" id="contract-party-save">Enregistrer pharmacie &amp; employeur</button>`;
  root.appendChild(partyCard);

  $('#contract-party-save').onclick = () => {
    persistContractMetaFromDom();
    toast('Pharmacie et employeur enregistrés');
  };
  partyCard.querySelectorAll('[data-party]').forEach(el => {
    el.onchange = persistContractMetaFromDom;
  });
  return partyCard;
}

function renderContractEditor(root) {
  if (STATE.employees.length === 0) {
    root.innerHTML = `
      <div class="form-card">
        <h3>Contrat</h3>
        <p class="muted">Ajoutez d'abord des salariés dans l'onglet Équipe.</p>
      </div>`;
    return;
  }

  const emp = STATE.ui.contractEmp && STATE.employees.includes(STATE.ui.contractEmp)
    ? STATE.ui.contractEmp
    : STATE.employees[0];
  STATE.ui.contractEmp = emp;

  const days = sortContractDays(getContractDays(emp));
  const totalH = contractDaysTotalHours(days);
  const docTitle = STATE.ui.contractDocTitle || 'Planning des journées de travail';

  const ctrl = document.createElement('div');
  ctrl.className = 'controls contract-controls no-print';
  ctrl.innerHTML = `
    <div class="label">Contrat — jours travaillés</div>
    <div class="help-text">
      Sélectionnez un salarié, ajoutez les journées prévues, puis générez un PDF (<b>format portrait</b>).
      Pharmacie et employeur :
      <button type="button" class="nav settings-goto" data-tab="settings" data-hash="cfg-contract-party">Configuration</button>
    </div>`;
  root.appendChild(ctrl);
  bindSettingsNavLinks(ctrl);

  const metaCard = document.createElement('div');
  metaCard.className = 'form-card contract-meta-card no-print';
  metaCard.innerHTML = `
    <div class="contract-select-row">
      <label>Salarié concerné
        <select id="contract-emp-select">
          ${STATE.employees.map(e =>
            `<option value="${escapeHtml(e)}"${e === emp ? ' selected' : ''}>${escapeHtml(e)}</option>`
          ).join('')}
        </select>
      </label>
      <label>Titre du document
        <input type="text" id="contract-doc-title" value="${escapeHtml(docTitle)}" maxlength="120">
      </label>
    </div>`;
  root.appendChild(metaCard);

  const partyHint = document.createElement('div');
  partyHint.className = 'form-card settings-hint-card no-print';
  partyHint.innerHTML = `
    <p class="muted">Pharmacie et employeur (bloc PDF) :
      <button type="button" class="nav settings-goto" data-tab="settings" data-hash="cfg-contract-party">Configuration → Pharmacie &amp; employeur</button>
    </p>`;
  root.appendChild(partyHint);
  bindSettingsNavLinks(partyHint);

  const infoCard = document.createElement('div');
  infoCard.className = 'form-card contract-info-card';
  infoCard.innerHTML = `
    <h3>Salarié sélectionné</h3>
    <p class="muted no-print">Coordonnées modifiables dans <b>Équipe → Infos</b>.</p>
    <table class="contract-info-table">
      <tbody>${buildEmployeeInfoRowsHtml(emp)}</tbody>
    </table>`;
  root.appendChild(infoCard);

  const addCard = document.createElement('div');
  addCard.className = 'form-card contract-add-card no-print';
  addCard.innerHTML = `
    <h3>Ajouter une journée</h3>
    <div class="contract-add-row">
      <label>Date
        <input type="text" class="fr-date" id="contract-day-date" data-iso="${todayISO()}" value="${frFormatNumeric(todayISO())}">
      </label>
      <label>Durée (heures)
        <input type="number" id="contract-day-hours" min="0.25" max="24" step="0.25" value="7">
      </label>
      <label>Commentaire <span class="muted">(optionnel)</span>
        <input type="text" id="contract-day-note" maxlength="80" placeholder="Ex. matin, remplacement…">
      </label>
      <button type="button" class="primary" id="contract-day-add">+ Ajouter</button>
    </div>`;
  root.appendChild(addCard);

  const daysCard = document.createElement('div');
  daysCard.className = 'form-card contract-days-card';
  daysCard.innerHTML = `<h3>Planning des heures</h3>`;

  if (days.length === 0) {
    daysCard.innerHTML += `<p class="muted">Aucune journée ajoutée pour l'instant.</p>`;
  } else {
    daysCard.innerHTML += `
      <table class="list contract-days-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Jour</th>
            <th>Durée</th>
            <th>Commentaire</th>
            <th class="contract-actions-col no-print">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${days.map(d => {
            const dt = fromISO(d.date);
            return `
            <tr data-day-id="${escapeHtml(d.id)}">
              <td>${escapeHtml(frFormatNumeric(d.date))}</td>
              <td>${escapeHtml(DAY_NAMES_LONG[dt.getDay()])}</td>
              <td>${formatContractHours(d.hours)} h</td>
              <td>${escapeHtml(d.note || '—')}</td>
              <td class="contract-actions-col no-print">
                <button type="button" class="nav contract-day-del" data-id="${escapeHtml(d.id)}">✕</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th colspan="3">${formatContractHours(totalH)} h · ${days.length} journée${days.length > 1 ? 's' : ''}</th>
          </tr>
        </tfoot>
      </table>`;
  }
  root.appendChild(daysCard);

  const actions = document.createElement('div');
  actions.className = 'contract-print-actions no-print';
  actions.innerHTML = `
    <button type="button" class="primary-btn" id="contract-pdf-btn">📄 Générer le PDF</button>
    <span class="muted">Format portrait · enregistrez via « Microsoft Print to PDF » ou équivalent.</span>`;
  root.appendChild(actions);

  $('#contract-emp-select').onchange = (e) => {
    persistContractMetaFromDom();
    STATE.ui.contractEmp = e.target.value;
    persistAndRender();
  };

  $('#contract-doc-title').onchange = persistContractMetaFromDom;

  const submitDay = () => {
    persistContractMetaFromDom();
    const dateIso = readFrDateInput($('#contract-day-date'));
    const hours = parseFloat($('#contract-day-hours').value);
    const note = $('#contract-day-note').value;
    if (!dateIso) {
      toast('Indiquez une date valide.', true);
      return;
    }
    const r = addContractDay(emp, dateIso, hours, note);
    if (!r.ok) {
      toast(r.error, true);
      return;
    }
    $('#contract-day-note').value = '';
    persistAndRender();
    toast('Journée ajoutée');
  };

  $('#contract-day-add').onclick = submitDay;
  $('#contract-day-hours').onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitDay(); }
  };

  daysCard.querySelectorAll('.contract-day-del').forEach(btn => {
    btn.onclick = () => {
      removeContractDay(emp, btn.dataset.id);
      persistAndRender();
      toast('Journée supprimée');
    };
  });

  $('#contract-pdf-btn').onclick = () => printContractPdf();
}

function buildPrintInfoLine(row) {
  const wide = !!row.wide;
  return `
    <div class="cp-line${wide ? ' cp-line-wide' : ''}">
      <span class="cp-line-label">${escapeHtml(row.label)}</span>
      <span class="cp-line-value">${escapeHtml(row.value)}</span>
    </div>`;
}

function buildPrintPartyBlock(title, subtitle, lines) {
  const body = lines.length
    ? lines.map(buildPrintInfoLine).join('')
    : '<p class="cp-empty">—</p>';
  return `
    <section class="cp-block">
      <div class="cp-block-head">
        <span class="cp-block-title">${escapeHtml(title)}</span>
        ${subtitle ? `<span class="cp-block-sub">${escapeHtml(subtitle)}</span>` : ''}
      </div>
      <div class="cp-block-body">${body}</div>
    </section>`;
}

function buildEmployerPrintBlock(pharmacy, employer) {
  let body = '';
  if (pharmacy.name) {
    body += `<div class="cp-establishment-name">${escapeHtml(pharmacy.name)}</div>`;
  }
  for (const row of partyInfoLines(PHARMACY_INFO_FIELDS, pharmacy)) {
    if (row.label === 'Nom de la pharmacie') continue;
    body += buildPrintInfoLine(row);
  }
  const empPersonLines = partyInfoLines(EMPLOYER_INFO_FIELDS, employer);
  if (empPersonLines.length) {
    body += '<div class="cp-subsection-label">Représentant légal</div>';
    for (const row of empPersonLines) body += buildPrintInfoLine(row);
  }
  if (!body) body = '<p class="cp-empty">—</p>';
  const subtitle = employer.name || pharmacy.name || '';
  return `
    <section class="cp-block cp-block-employer">
      <div class="cp-block-head">
        <span class="cp-block-title">Employeur</span>
        ${subtitle ? `<span class="cp-block-sub">${escapeHtml(subtitle)}</span>` : ''}
      </div>
      <div class="cp-block-body">${body}</div>
    </section>`;
}

function printContractPdf() {
  persistContractMetaFromDom();

  const emp = STATE.ui.contractEmp && STATE.employees.includes(STATE.ui.contractEmp)
    ? STATE.ui.contractEmp
    : STATE.employees[0];
  if (!emp) {
    toast('Aucun salarié sélectionné.', true);
    return;
  }

  const days = sortContractDays(getContractDays(emp));
  if (days.length === 0) {
    toast('Ajoutez au moins une journée avant de générer le PDF.', true);
    return;
  }

  const totalH = contractDaysTotalHours(days);
  const docTitle = STATE.ui.contractDocTitle || 'Planning des journées de travail';
  const pharmacy = getPharmacyInfo();
  const employer = getEmployerInfo();
  const empInfo = getEmployeeInfo(emp);
  const empType = getEmployeeType(emp);

  const periodStart = frFormatNumeric(days[0].date);
  const periodEnd = frFormatNumeric(days[days.length - 1].date);

  const styleEl = document.createElement('style');
  styleEl.id = 'contract-print-page-style';
  styleEl.textContent = `
    @page { size: A4 portrait; margin: 14mm 16mm; }
    @media print {
      html, body { background: #fff !important; }
    }`;

  const root = document.createElement('div');
  root.id = 'contract-print-root';
  root.className = 'contract-print-root';
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
        <p class="cp-period">Période couverte : ${escapeHtml(periodStart)} → ${escapeHtml(periodEnd)}</p>
      </header>

      <div class="cp-parties">
        ${buildEmployerPrintBlock(pharmacy, employer)}
        ${buildPrintPartyBlock('Salarié', emp, [
          { label: 'Type', value: empType },
          ...partyInfoLines(EMPLOYEE_INFO_FIELDS, empInfo),
        ])}
      </div>

      <section class="cp-schedule">
        <div class="cp-block-head cp-schedule-head">
          <span class="cp-block-title">Planning des heures</span>
          <span class="cp-block-sub">${days.length} journée${days.length > 1 ? 's' : ''} · ${formatContractHours(totalH)} h au total</span>
        </div>
        <table class="cp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Jour</th>
              <th class="cp-col-hours">Durée</th>
              <th>Commentaire</th>
            </tr>
          </thead>
          <tbody>
            ${days.map(d => {
              const dt = fromISO(d.date);
              return `
              <tr>
                <td>${escapeHtml(frFormatNumeric(d.date))}</td>
                <td>${escapeHtml(DAY_NAMES_LONG[dt.getDay()])}</td>
                <td class="cp-col-hours">${formatContractHours(d.hours)} h</td>
                <td>${escapeHtml(d.note || '')}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2"><strong>Total</strong></td>
              <td class="cp-col-hours"><strong>${formatContractHours(totalH)} h</strong></td>
              <td><strong>${days.length} journée${days.length > 1 ? 's' : ''}</strong></td>
            </tr>
          </tfoot>
        </table>
      </section>

      <footer class="cp-footer">
        <p class="cp-legal">
          Document établi en deux exemplaires. Chaque partie reconnaît avoir pris connaissance
          du planning des journées de travail ci-dessus.
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
  document.body.classList.add('printing-contract');

  const cleanup = () => {
    root.remove();
    styleEl.remove();
    document.body.classList.remove('printing-contract');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
