/* Relevé d'activité prévisionnel — version simple et robuste.
   - L'onglet s'ouvre instantanément (aucun calcul au chargement -> jamais bloqué).
   - Le document s'ouvre dans une nouvelle fenêtre autonome avec son bouton Imprimer.
   - Boutons en onclick inline + fonctions globales -> aucun branchement fragile. */
'use strict';

const RAP_MAX_DAYS = 400; /* garde-fou contre une période démesurée */

function formatReleveHours(h) {
  const n = Math.round((Number(h) || 0) * 100) / 100;
  return n.toFixed(2).replace('.', ',');
}

function releveEmployees() {
  const filter = STATE.ui.filtersEmp;
  const pool = Array.isArray(filter) && filter.length ? filter : STATE.employees;
  return STATE.employees.filter((e) => pool.includes(e));
}

function rapGetPeriod() {
  const startEl = document.getElementById('rap-start');
  const endEl = document.getElementById('rap-end');
  const start = (startEl && startEl.value) || STATE.ui.relevePeriodStart || '';
  const end = (endEl && endEl.value) || STATE.ui.relevePeriodEnd || '';
  return { start, end };
}

function rapSavePeriod() {
  const { start, end } = rapGetPeriod();
  if (start) STATE.ui.relevePeriodStart = start;
  if (end) STATE.ui.relevePeriodEnd = end;
  saveState();
  return { start, end };
}

/* Valide la période : renvoie {ok, start, end, msg} */
function rapValidatePeriod() {
  const { start, end } = rapSavePeriod();
  if (!start || !end) return { ok: false, msg: 'Choisissez une date de début et une date de fin.' };
  if (start > end) return { ok: false, msg: 'La date de début doit précéder la date de fin.' };
  if (diffDays(start, end) > RAP_MAX_DAYS) {
    return { ok: false, msg: `Période trop longue (max ${RAP_MAX_DAYS} jours). Réduisez l'intervalle.` };
  }
  return { ok: true, start, end };
}

/* --- Données --- */
function buildEmployeeReleve(emp, periodStart, periodEnd, state = STATE) {
  const presence = getEmployeePresenceRange(emp, periodStart, periodEnd, state);
  if (!presence) return null;

  const rows = [];
  let totalPrev = 0;
  let d = fromISO(presence.start);
  const last = fromISO(presence.end);

  while (d <= last) {
    const iso = toISO(d);
    const prev = computePlanningDayHours(emp, iso, state);
    totalPrev += prev;
    rows.push({
      day: DAY_NAMES_SHORT[d.getDay()],
      date: frFormatNumeric(iso),
      prev,
      obs: prev > 0 ? formatReleveHours(prev) : '',
    });
    d = addDays(d, 1);
  }

  return {
    emp,
    matricule: getEmployeeMatricule(emp, state),
    presenceStart: presence.start,
    presenceEnd: presence.end,
    rows,
    totalPrev,
  };
}

function buildAllReleves(periodStart, periodEnd, employees, state = STATE) {
  const list = [];
  for (const emp of employees) {
    const r = buildEmployeeReleve(emp, periodStart, periodEnd, state);
    if (r) list.push(r);
  }
  return list;
}

/* --- Rendu HTML --- */
function releveTableHtml(releve) {
  const body = releve.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.day)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td class="num">${formatReleveHours(row.prev)}</td>
      <td class="num">0,00</td>
      <td>${escapeHtml(row.obs)}</td>
    </tr>`).join('');

  return `
    <table class="rap-simple-table">
      <thead>
        <tr>
          <th>Jour</th><th>Date</th><th>H. prévues</th><th>H. réalisées</th><th>Observations</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td class="num"><strong>${formatReleveHours(releve.totalPrev)}</strong></td>
          <td class="num"><strong>0,00</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
}

function releveBlockHtml(releve, periodStart, periodEnd) {
  const pharmacy = getPharmacyInfo();
  const title = pharmacy.name ? escapeHtml(pharmacy.name) : 'Relevé d\'activité';
  return `
    <section class="rap-sheet">
      <header class="rap-head">
        <div class="rap-brand">${title}</div>
        <h1>Relevé d'activité prévisionnel</h1>
        <p>Période du ${escapeHtml(frFormatNumeric(periodStart))} au ${escapeHtml(frFormatNumeric(periodEnd))}</p>
      </header>
      <div class="rap-emp">
        <strong>${escapeHtml(releve.matricule)}</strong> — ${escapeHtml(releve.emp)}<br>
        <span class="muted">Présence : ${escapeHtml(frFormatNumeric(releve.presenceStart))} → ${escapeHtml(frFormatNumeric(releve.presenceEnd))}</span>
      </div>
      ${releveTableHtml(releve)}
    </section>`;
}

/* Document HTML autonome pour la nouvelle fenêtre */
function rapStandaloneDocument(releves, start, end) {
  const css = `
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 24px; background: #f5f5f5; }
    .rap-toolbar { position: sticky; top: 0; background: #fff; border: 1px solid #ccc; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 12px; align-items: center; }
    .rap-toolbar button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .rap-print { background: #2563eb; color: #fff; }
    .rap-close { background: #e5e7eb; color: #111; }
    .rap-sheet { background: #fff; max-width: 800px; margin: 0 auto 24px; padding: 24px;
      border: 1px solid #ccc; border-radius: 8px; }
    .rap-head { border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 12px; }
    .rap-head h1 { font-size: 18px; margin: 8px 0 4px; text-transform: uppercase; }
    .rap-head p { margin: 0; font-size: 12px; }
    .rap-brand { font-weight: 700; font-size: 14px; }
    .rap-emp { margin-bottom: 12px; font-size: 13px; }
    .muted { color: #666; }
    table.rap-simple-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .rap-simple-table th, .rap-simple-table td { border: 1px solid #999; padding: 4px 8px; text-align: left; }
    .rap-simple-table th { background: #eee; }
    .rap-simple-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .rap-simple-table tfoot td { background: #f3f3f3; font-weight: bold; }
    @media print {
      body { background: #fff; padding: 0; }
      .rap-toolbar { display: none; }
      .rap-sheet { border: none; border-radius: 0; max-width: none; margin: 0; padding: 0; page-break-after: always; }
      .rap-sheet:last-child { page-break-after: auto; }
      @page { size: A4 portrait; margin: 14mm; }
    }`;

  const sheets = releves.map((r) => releveBlockHtml(r, start, end)).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Relevé d'activité — ${escapeHtml(frFormatNumeric(start))} au ${escapeHtml(frFormatNumeric(end))}</title>
    <style>${css}</style></head>
    <body>
      <div class="rap-toolbar">
        <button type="button" class="rap-print" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button>
        <button type="button" class="rap-close" onclick="window.close()">Fermer</button>
        <span class="muted">${releves.length} salarié(s)</span>
      </div>
      ${sheets}
    </body></html>`;
}

/* --- Action principale : générer le document --- */
function rapGenerate() {
  const v = rapValidatePeriod();
  if (!v.ok) { toast(v.msg, true); return; }

  let releves;
  try {
    releves = buildAllReleves(v.start, v.end, releveEmployees());
  } catch (err) {
    console.error('Relevé — génération', err);
    toast('Erreur lors de la génération : ' + (err.message || err), true);
    return;
  }
  if (!releves.length) { toast('Aucun salarié présent sur cette période.', true); return; }

  const html = rapStandaloneDocument(releves, v.start, v.end);
  const w = window.open('', '_blank');
  if (w && w.document) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  } else {
    /* Popup bloquée : repli sur l'aperçu intégré */
    toast('Fenêtre bloquée par le navigateur — affichage intégré.', true);
    rapShowPreview();
  }
}

/* Conservé pour le bouton 🖨 global de la barre d'outils */
function printReleveActivite() {
  rapGenerate();
}

/* --- Aperçu intégré (sur clic uniquement) --- */
function rapShowPreview() {
  const preview = document.getElementById('rap-preview');
  if (!preview) return;
  const v = rapValidatePeriod();
  if (!v.ok) { preview.innerHTML = `<h3>Aperçu</h3><p class="muted">${escapeHtml(v.msg)}</p>`; return; }

  try {
    const releves = buildAllReleves(v.start, v.end, releveEmployees());
    if (!releves.length) {
      preview.innerHTML = '<h3>Aperçu</h3><p class="muted">Aucun salarié présent sur cette période.</p>';
      return;
    }
    preview.innerHTML = '<h3>Aperçu</h3>' + releves.map((r) => `
      <div class="rap-preview-block">
        <h4>${escapeHtml(r.matricule)} — ${escapeHtml(r.emp)}</h4>
        ${releveTableHtml(r)}
      </div>`).join('');
  } catch (err) {
    console.error('Relevé — aperçu', err);
    preview.innerHTML = `<h3>Aperçu</h3><p class="muted" style="color:var(--warn)">Erreur : ${escapeHtml(err.message || String(err))}</p>`;
  }
}

/* --- Bouton "Mois en cours" --- */
function rapSetCurrentMonth() {
  const startEl = document.getElementById('rap-start');
  const endEl = document.getElementById('rap-end');
  if (!startEl || !endEl) return;
  const n = new Date();
  startEl.value = toISO(new Date(n.getFullYear(), n.getMonth(), 1, 12));
  endEl.value = toISO(new Date(n.getFullYear(), n.getMonth() + 1, 0, 12));
  rapSavePeriod();
  toast('Période réglée sur le mois en cours.');
}

function rapOnDateChange() {
  rapSavePeriod();
}

/* --- Rendu de l'onglet (léger, aucun calcul) --- */
function renderReleveActiviteEditor(root) {
  const now = new Date();
  const start = STATE.ui.relevePeriodStart
    || toISO(new Date(now.getFullYear(), now.getMonth(), 1, 12));
  const end = STATE.ui.relevePeriodEnd
    || toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12));

  root.innerHTML = `
    <div class="controls">
      <div class="label">Relevé d'activité prévisionnel</div>
      <p class="help-text">Choisissez une période, puis cliquez sur <b>Générer le relevé</b> :
        le document s'ouvre dans une nouvelle fenêtre prête à imprimer ou enregistrer en PDF.</p>
    </div>
    <div class="form-card">
      <h3>Période</h3>
      <div class="rap-fields">
        <label>Du <input type="date" id="rap-start" value="${start}" onchange="rapOnDateChange()"></label>
        <label>Au <input type="date" id="rap-end" value="${end}" onchange="rapOnDateChange()"></label>
        <button type="button" class="nav" onclick="rapSetCurrentMonth()">Mois en cours</button>
        <button type="button" class="nav" onclick="rapShowPreview()">Aperçu</button>
        <button type="button" class="primary-btn" onclick="rapGenerate()">Générer le relevé</button>
      </div>
    </div>
    <div class="form-card" id="rap-preview"><h3>Aperçu</h3><p class="muted">Cliquez sur « Aperçu » pour afficher le détail ici.</p></div>`;
}
