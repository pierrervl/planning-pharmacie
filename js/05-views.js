/* Vues + panneau latéral */
'use strict';

/* ===========================================================================
   5. RENDU — DISPATCHER PRINCIPAL
   ========================================================================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const VALID_TABS = ['week', 'emp-overview', 'emp-detail', 'patterns', 'planning-requests', 'reunions', 'employees', 'conges', 'contract', 'cdi', 'releve', 'feries', 'gardes', 'pantecotes', 'settings', 'help', 'rgpd'];

const TAB_GROUPS = {
  planning: ['week', 'patterns', 'planning-requests', 'reunions'],
  analyse:  ['emp-overview', 'emp-detail'],
  equipe:   ['conges', 'employees', 'contract', 'cdi', 'releve'],
  journees: ['feries', 'gardes', 'pantecotes'],
  config:   ['help', 'settings', 'rgpd'],
};

function goToTab(tab, hash) {
  if (VALID_TABS.includes(tab)) STATE.ui.currentTab = tab;
  if (hash) STATE.ui.settingsScrollHash = hash;
  persistAndRender({ skipCloud: true });
}

function groupForTab(tab) {
  for (const [group, tabs] of Object.entries(TAB_GROUPS)) {
    if (tabs.includes(tab)) return group;
  }
  return 'planning';
}

function syncNavTabs() {
  const group = groupForTab(STATE.ui.currentTab);
  $$('#nav-groups button').forEach(b => {
    b.classList.toggle('active', b.dataset.group === group);
  });
  /* Menu latéral : tous les onglets autorisés restent visibles, regroupés par rubrique. */
  $$('#tabs button[data-tab]').forEach(b => {
    b.hidden = b.dataset.tab === 'rgpd' && typeof shouldShowRgpdTab === 'function' && !shouldShowRgpdTab();
    const active = b.dataset.tab === STATE.ui.currentTab;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  syncNavGroupVisibility();
}

/* Masque une rubrique quand aucun de ses onglets n'est visible (rôle employé, RGPD…). */
function syncNavGroupVisibility() {
  $$('#tabs [data-nav-group]').forEach(g => {
    const visible = [...g.querySelectorAll('button[data-tab]')]
      .some(b => !b.hidden && b.style.display !== 'none');
    g.hidden = !visible;
  });
}

function applyConfigTabLayout() {
  const sidebar = document.getElementById('sidebar');
  const main = document.querySelector('.main');
  if (!sidebar || !main) return;
  /* Les filtres et la légende ne concernent que la vue Semaine : panneau
     masqué ailleurs, et fermé tant que l'utilisateur ne l'ouvre pas. */
  const panel = getSidePanel();
  const hide = !panel;
  sidebar.hidden = hide;
  sidebar.dataset.panel = panel || '';
  main.classList.toggle('main-no-sidebar', hide);
}

function decorateWeekReunions(wrap, days) {
  if (typeof buildReunionIndex !== 'function' || !days.length) return;
  decorateReunionCells(wrap, buildReunionIndex(toISO(days[0]), toISO(days[days.length - 1])));
}

function getSidePanel() {
  if (STATE.ui.currentTab !== 'week') return null;
  const p = STATE.ui.sidePanel;
  return p === 'filters' || p === 'legend' ? p : null;
}

function toggleSidePanel(panel) {
  STATE.ui.sidePanel = STATE.ui.sidePanel === panel ? null : panel;
  persistAndRender({ skipCloud: true });
}

/* Nombre de restrictions actives (salariés masqués, demi-journée, statuts masqués). */
function countActivePlanningFilters() {
  const hiddenEmps = STATE.employees.filter(e => !(STATE.ui.filtersEmp || []).includes(e)).length;
  const shift = STATE.ui.filterShift && STATE.ui.filterShift !== 'both' ? 1 : 0;
  const hiddenTypes = getPlanningFilterTypes().filter(t => !(STATE.ui.filterTypes || []).includes(t)).length;
  return { hiddenEmps, shift, hiddenTypes, total: hiddenEmps + shift + hiddenTypes };
}

function resetPlanningFilters() {
  STATE.ui.filtersEmp = STATE.employees.slice();
  STATE.ui.filterShift = 'both';
  STATE.ui.filterTypes = getPlanningFilterTypes().slice();
}

function render() {
  if (typeof applyAppTheme === 'function') applyAppTheme();
  syncNavTabs();
  if (typeof needsRgpdAcceptance === 'function' && needsRgpdAcceptance()) {
    STATE.ui.currentTab = 'rgpd';
  } else if (STATE.ui.currentTab === 'rgpd') {
    STATE.ui.currentTab = 'week';
  }
  if (typeof ensureEmployeeTabAllowed === 'function') ensureEmployeeTabAllowed();
  if (!VALID_TABS.includes(STATE.ui.currentTab)) {
    STATE.ui.currentTab = STATE.ui.currentTab === 'employee' ? 'emp-detail' : 'week';
  }

  const content = $('#content');
  content.innerHTML = '';
  switch (STATE.ui.currentTab) {
    case 'week':           renderWeekView(content); break;
    case 'emp-overview':   renderEmployeeOverviewView(content); break;
    case 'emp-detail':     renderEmployeeDetailView(content); break;
    case 'patterns':       renderPatternsEditor(content); break;
    case 'planning-requests': renderPlanningRequestsEditor(content); break;
    case 'employees':      renderEmployeesEditor(content); break;
    case 'contract':       renderContractEditor(content); break;
    case 'cdi':            renderCdiEditor(content); break;
    case 'releve':         renderReleveView(content); break;
    case 'conges':         renderCongesEditor(content); break;
    case 'feries':         renderFeriesEditor(content); break;
    case 'gardes':         renderGardesEditor(content); break;
    case 'reunions':       renderReunionsEditor(content); break;
    case 'pantecotes':     renderPantecotesEditor(content); break;
    case 'settings':       renderSettingsEditor(content); break;
    case 'help':           renderHelpEditor(content); break;
    case 'rgpd':           if (typeof renderRgpdEditor === 'function') renderRgpdEditor(content); break;
  }
  renderSidebar();
  initFrDateInputs(content);
  if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
  if (typeof applyRgpdGate === 'function') applyRgpdGate();
  applyConfigTabLayout();
  if (STATE.ui.settingsScrollHash) {
    const hash = STATE.ui.settingsScrollHash;
    STATE.ui.settingsScrollHash = '';
    requestAnimationFrame(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (typeof updateTopbarAppearance === 'function') updateTopbarAppearance();
  if (typeof applyAdminReadOnlyUi === 'function') applyAdminReadOnlyUi();
}

/* ===========================================================================
   6. VUE SEMAINE
   ========================================================================= */

/* Vue semaine : semaine courante + N semaines suivantes */
const WEEK_VIEW_EXTRA = 2; /* +2 semaines = 3 semaines au total */
const WEEK_PRINT_WEEKS_PER_PAGE = 3;
/* Impression mode Détail : 2 semaines empilées, fenêtre glissante (S1+S2, S2+S3…) */
const WEEK_DETAIL_PRINT_WEEKS_PER_PAGE = 2;
const WEEK_DETAIL_PRINT_SLIDE = 1;

function shortEmpName(fullName) {
  const first = fullName.trim().split(/\s+/)[0];
  if (first.length <= 8) return first;
  return first.slice(0, 7) + '…';
}

function weekParityClass(d) {
  return getISOWeek(d) % 2 === 0 ? 'week-even' : 'week-odd';
}

function buildDaysForPrintRange(startIso, endIso) {
  const startMon = mondayOf(fromISO(startIso));
  const endSun = addDays(mondayOf(fromISO(endIso)), 6);
  const days = [];
  let d = new Date(startMon);
  while (d <= endSun) {
    days.push(new Date(d));
    d = addDays(d, 1);
  }
  return days;
}

function chunkDaysForPrint(days, weeksPerPage) {
  const size = weeksPerPage * 7;
  const chunks = [];
  for (let i = 0; i < days.length; i += size) {
    chunks.push(days.slice(i, i + size));
  }
  return chunks;
}

/* Découpe en semaines (7 jours) pour l'impression détail ------------------- */
function splitDaysIntoWeeks(days) {
  const weeks = [];
  for (let i = 0; i + 6 < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

/* Fenêtre glissante : [[S1,S2], [S2,S3], …] — une page = 2 semaines empilées */
function chunkWeeksForDetailPrint(weeks, weeksPerPage = WEEK_DETAIL_PRINT_WEEKS_PER_PAGE, slide = WEEK_DETAIL_PRINT_SLIDE) {
  if (!weeks.length) return [];
  if (weeks.length <= weeksPerPage) return [weeks.slice()];
  const pages = [];
  const step = Math.max(1, slide);
  for (let i = 0; i + weeksPerPage - 1 < weeks.length; i += step) {
    pages.push(weeks.slice(i, i + weeksPerPage));
    if (step >= weeks.length) break;
  }
  return pages;
}

function renderShiftCell(emp, iso, shift, d, weekBoundary, options = {}) {
  const { editable = true, forPrint = false, weekCellDisplay = STATE.ui.weekCellDisplay || 'cross' } = options;
  const showHours = weekCellDisplay === 'hours';
  const afterContract = isAfterEmployeeContractEnd(emp, iso);
  const c = computeCell(emp, iso, shift);
  const requestMode = typeof isEmployeeRequestMode === 'function' && isEmployeeRequestMode();
  const linkedEmp = typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;
  const canRequest = requestMode && canRequestPlanningFor(emp) && !afterContract && !forPrint;
  const canEdit = editable && !afterContract && !requestMode
    && (typeof canEditPlanning !== 'function' || canEditPlanning());
  const shiftCls = shift === 'matin' ? 'shift-matin' : 'shift-aprem';
  const pendingReq = typeof getPendingPlanningChangeRequest === 'function'
    ? getPendingPlanningChangeRequest(emp, iso, shift) : null;
  const passesFilter = forPrint || cellPassesTypeFilter(c) || !!pendingReq;
  const cls = ['cell', 'week-planning-cell', cellDisplayClass(c), shiftCls, weekParityClass(d)];
  if (canEdit || canRequest) cls.unshift('editable');
  if (canRequest) cls.push('requestable');
  if (!passesFilter) cls.push('filtered-out');
  if (c.ferie) cls.push('ferie');
  if (afterContract) cls.push('post-contract');
  if (weekBoundary && shift === 'matin') cls.push('week-start');

  if (pendingReq) cls.push('request-pending');

  const hint = canEdit ? ' — clic : plein ↔ repos · clic droit : orange → rouge → vert' : '';
  const requestHint = canRequest
    ? (typeof isTeamLeader === 'function' && isTeamLeader()
      ? ' — clic : proposer une modification (case violette)'
      : (typeof employeeNamesMatch === 'function' && employeeNamesMatch(emp, linkedEmp)
        ? ' — clic : proposer une modification (votre ligne)'
        : ''))
    : '';
  const adminReqHint = pendingReq && canEdit && !canRequest ? ' — clic : traiter la demande en attente' : '';
  const contractHint = afterContract ? ' — après fin de contrat' : '';
  let title = `${emp} — ${frFormat(d)} — ${shift === 'matin' ? 'Matin' : 'Après-midi'} — ${cellStatusLabel(c)}`;
  let inner = '';

  if (pendingReq) {
    title += pendingReq.present
      ? ` — demande : ${formatPatternTime(pendingReq.start)} → ${formatPatternTime(pendingReq.end)} (${formatContractHours(pendingReq.hours)} h)`
      : ' — demande : non présent (0 h)';
    if (showHours) {
      if (pendingReq.present && pendingReq.hours > 0) {
        inner = `<span class="pattern-cell-hours">${formatContractHours(pendingReq.hours)}</span>`;
      } else if (!pendingReq.present) {
        inner = `<span class="pattern-cell-hours">0</span>`;
      }
    }
  } else if (c.full && showHours) {
    const slot = getPlanningCellSlot(emp, iso, shift);
    const h = getPlanningCellHours(emp, iso, shift);
    if (h != null) {
      title += ` — ${formatPatternTime(slot.start)} → ${formatPatternTime(slot.end)} (${formatContractHours(h)} h)`;
      inner = `<span class="pattern-cell-hours">${formatContractHours(h)}</span>`;
    }
  }

  title += (c.ferie ? ` (${c.ferieLabel})` : '') +
           (c.garde ? ` (${c.gardeLabel})` : '') + contractHint + hint + requestHint + adminReqHint;
  if (pendingReq) title += ' — en attente de validation';
  if (canEdit && (c.special || c.specialRed)) {
    title += ' · clic droit : modifier les horaires';
  }
  const data = forPrint ? '' : ` data-emp="${emp}" data-date="${iso}" data-shift="${shift}"`;
  return `<td class="${cls.join(' ')}"${data} title="${title}">${inner}</td>`;
}

/* Effectif par demi-journée — dégradé 3 couleurs (2 = rouge, 3 = jaune, 4 = vert) */
function countPresences(employees, dateIso, shift) {
  let n = 0;
  for (const emp of employees) {
    if (isAfterEmployeeContractEnd(emp, dateIso)) continue;
    if (computeCell(emp, dateIso, shift).full) n++;
  }
  return n;
}

function presenceCountColor(n) {
  const cMin = [248, 105, 107];  /* #F8696B — effectif faible */
  const cMid = [255, 235, 132];  /* #FFEB84 — effectif moyen */
  const cMax = [99, 190, 123];   /* #63BE7B — effectif OK */
  const min = 2, mid = 3, max = 4;

  function lerp(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  }
  function rgb(c) {
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  if (n <= min) return rgb(cMin);
  if (n >= max) return rgb(cMax);
  if (n <= mid) return rgb(lerp(cMin, cMid, (n - min) / (mid - min)));
  return rgb(lerp(cMid, cMax, (n - mid) / (max - mid)));
}

function renderSumCell(n, shift, shiftLabel, weekBoundary, d) {
  const shiftCls = shift === 'matin' ? 'shift-matin' : 'shift-aprem';
  const bg = presenceCountColor(n);
  const title = `${shiftLabel} — ${n} présent${n > 1 ? 's' : ''} (rouge ≤2 · jaune 3 · vert ≥4)`;
  const weekCls = (weekBoundary && shift === 'matin' ? ' week-start' : '') + ' ' + weekParityClass(d);
  return `<td class="cell sum-cell ${shiftCls}${weekCls}" style="background:${bg}" title="${title}">${n}</td>`;
}

function renderHoursTotalCell(hours, { title = '', extraClass = '', patternMismatch = false } = {}) {
  const txt = formatContractHours(hours);
  const t = title || `${txt} h travaillées`;
  const mismatchCls = patternMismatch ? ' hours-pattern-mismatch' : '';
  return `<td class="cell hours-total-cell ${extraClass}${mismatchCls}" title="${t}"><span class="hours-total-value">${txt}</span></td>`;
}

function renderWeekHoursTotalCell(emp, weekMon, extraClass = '') {
  const cmp = compareWeekHoursToPattern(emp, weekMon);
  const isoWeek = getISOWeek(weekMon);
  return renderHoursTotalCell(cmp.actual, {
    extraClass,
    patternMismatch: !cmp.match,
    title: weekHoursPatternMismatchTitle(emp, isoWeek, cmp),
  });
}

function createWeekPlanningTable(days, { editable = true, showImportRow = true, forPrint = false, weekCellDisplay } = {}) {
  const requestMode = typeof isEmployeeRequestMode === 'function' && isEmployeeRequestMode();
  if (requestMode) {
    showImportRow = false;
    editable = true;
  }
  const displayMode = weekCellDisplay || STATE.ui.weekCellDisplay || 'cross';
  const showM = STATE.ui.filterShift !== 'aprem';
  const showA = STATE.ui.filterShift !== 'matin';
  const colsPerDay = (showM ? 1 : 0) + (showA ? 1 : 0);
  const numWeeks = Math.ceil(days.length / 7);
  const months = groupDaysByCalendarMonth(days);
  const headRows = showImportRow ? 5 : 4;
  const cellOpts = { editable, forPrint, weekCellDisplay: displayMode };
  const visibleEmps = STATE.employees.filter(e => (STATE.ui.filtersEmp || STATE.employees).includes(e));
  const reuIdx = typeof buildReunionIndex === 'function'
    ? buildReunionIndex(toISO(days[0]), toISO(days[days.length - 1])) : null;

  const wrap = document.createElement('div');
  wrap.className = 'planning-wrap week-display-' + displayMode + (forPrint ? ' planning-wrap-print' : '');
  const tbl = document.createElement('table');
  tbl.className = 'planning' + (forPrint ? ' planning-print' : '');

  const thead = document.createElement('thead');
  const trPattern = document.createElement('tr');
  trPattern.innerHTML = `<th class="empname" rowspan="${headRows}">Nom</th>`;
  for (let w = 0; w < numWeeks; w++) {
    const weekMon = days[w * 7];
    const pName = getPatternWeekNameForMonday(weekMon);
    trPattern.innerHTML += `<th class="pattern-ref ${weekParityClass(weekMon)}" colspan="${colsPerDay * 7}">${pName}</th>`;
    trPattern.innerHTML += `<th class="hours-col hours-col-week" rowspan="${headRows}" title="Heures travaillées — fond rouge si écart avec le pattern de la semaine">H./sem.</th>`;
  }
  for (const m of months) {
    trPattern.innerHTML += `<th class="hours-col hours-col-month" rowspan="${headRows}" title="Heures travaillées en ${MONTH_NAMES[m.month]} ${m.year}">${monthShortLabel(m.year, m.month)}</th>`;
  }
  thead.appendChild(trPattern);

  const trWeeks = document.createElement('tr');
  for (let w = 0; w < numWeeks; w++) {
    const weekMon = days[w * 7];
    trWeeks.innerHTML += `<th class="week-band ${weekParityClass(weekMon)}" colspan="${colsPerDay * 7}">Sem. ${getISOWeek(weekMon)}</th>`;
  }
  thead.appendChild(trWeeks);

  if (showImportRow) {
    const trImport = document.createElement('tr');
    trImport.className = 'week-import-row';
    for (let w = 0; w < numWeeks; w++) {
      const weekMon = days[w * 7];
      const weekIso = toISO(weekMon);
      const pName = getPatternWeekNameForMonday(weekMon);
      const isoWk = getISOWeek(weekMon);
      trImport.innerHTML += `
        <th class="week-import ${weekParityClass(weekMon)}" colspan="${colsPerDay * 7}">
          <button type="button" class="week-import-btn no-print" data-week-mon="${weekIso}" data-pat="${pName}" data-iso-week="${isoWk}">
            ↓ Importer ${pName}
          </button>
        </th>`;
    }
    thead.appendChild(trImport);
  }

  const trDays = document.createElement('tr');
  days.forEach((d, dayIdx) => {
    const iso = toISO(d);
    const fr = getFerieLabel(iso);
    const gd = getGardeLabel(iso);
    const today = (iso === todayISO());
    const cls = ['day-header', 'day-group', weekParityClass(d)];
    if (fr) cls.push('is-ferie');
    if (gd) cls.push('is-garde');
    if (today) cls.push('is-today');
    if (dayIdx % 7 === 0 && dayIdx > 0) cls.push('week-start');
    trDays.innerHTML += `
      <th class="${cls.join(' ')}" colspan="${colsPerDay}">
        <span class="date-lbl">${DAY_NAMES_ABBR[d.getDay()]}</span>
        <span class="date-num">${d.getDate()}/${d.getMonth() + 1}</span>
        ${fr ? `<span class="ferie-name">${shortFerieLabel(fr)}</span>` : ''}
        ${gd ? `<span class="garde-name">${shortGardeLabel(gd)}</span>` : ''}
        ${reuIdx ? reunionHeaderHtml(iso, reuIdx) : ''}
      </th>`;
  });
  thead.appendChild(trDays);

  const trShifts = document.createElement('tr');
  days.forEach((d, dayIdx) => {
    const weekBoundary = dayIdx % 7 === 0 && dayIdx > 0;
    const parity = weekParityClass(d);
    if (showM) trShifts.innerHTML += `<th class="shift-col matin ${parity}${weekBoundary ? ' week-start' : ''}">M</th>`;
    if (showA) trShifts.innerHTML += `<th class="shift-col ${parity}">A</th>`;
  });
  thead.appendChild(trShifts);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  const linkedEmp = typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;
  for (const emp of visibleEmps) {
    const tr = document.createElement('tr');
    tr.className = 'emp-row';
    if (requestMode && linkedEmp && typeof employeeNamesMatch === 'function' && employeeNamesMatch(emp, linkedEmp)) {
      tr.classList.add('planning-own-row');
    }
    tr.innerHTML = `<td class="empname ${employeeTypeClass(emp)}" title="${emp} — ${getEmployeeType(emp)}">${forPrint ? emp : shortEmpName(emp)}</td>`;
    for (let w = 0; w < numWeeks; w++) {
      for (let di = 0; di < 7; di++) {
        const dayIdx = w * 7 + di;
        const d = days[dayIdx];
        const iso = toISO(d);
        const weekBoundary = di === 0 && w > 0;
        const parity = weekParityClass(d);
        if (showM) tr.innerHTML += renderShiftCell(emp, iso, 'matin', d, weekBoundary, cellOpts);
        else tr.innerHTML += `<td class="cell vide empty shift-matin ${parity}${weekBoundary ? ' week-start' : ''}" style="opacity:.15"></td>`;
        if (showA) tr.innerHTML += renderShiftCell(emp, iso, 'aprem', d, weekBoundary, cellOpts);
        else tr.innerHTML += `<td class="cell vide empty shift-aprem ${parity}" style="opacity:.15"></td>`;
      }
      const weekMon = days[w * 7];
      tr.innerHTML += renderWeekHoursTotalCell(emp, weekMon, `hours-col-week ${weekParityClass(weekMon)}`);
    }
    for (const m of months) {
      const startIso = toISO(m.days[0]);
      const endIso = toISO(m.days[m.days.length - 1]);
      const monthH = computePlanningHoursForPeriod(emp, startIso, endIso);
      tr.innerHTML += renderHoursTotalCell(monthH, {
        extraClass: 'hours-col-month',
        title: `${emp} — ${MONTH_NAMES[m.month]} ${m.year} — ${formatContractHours(monthH)} h travaillées`,
      });
    }
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);

  const tfoot = document.createElement('tfoot');
  const trSum = document.createElement('tr');
  trSum.className = 'sum-row';
  trSum.innerHTML = `<td class="empname sum-label" title="Effectif par demi-journée">Eff.</td>`;
  for (let w = 0; w < numWeeks; w++) {
    for (let di = 0; di < 7; di++) {
      const dayIdx = w * 7 + di;
      const d = days[dayIdx];
      const iso = toISO(d);
      const weekBoundary = di === 0 && w > 0;
      const parity = weekParityClass(d);
      if (showM) {
        trSum.innerHTML += renderSumCell(countPresences(visibleEmps, iso, 'matin'), 'matin', 'Matin', weekBoundary, d);
      } else {
        trSum.innerHTML += `<td class="cell sum-cell shift-matin ${parity}${weekBoundary ? ' week-start' : ''}" style="opacity:.15"></td>`;
      }
      if (showA) {
        trSum.innerHTML += renderSumCell(countPresences(visibleEmps, iso, 'aprem'), 'aprem', 'Après-midi', weekBoundary, d);
      } else {
        trSum.innerHTML += `<td class="cell sum-cell shift-aprem ${parity}" style="opacity:.15"></td>`;
      }
    }
    const weekMon = days[w * 7];
    const weekStart = toISO(weekMon);
    const weekEnd = toISO(days[w * 7 + 6]);
    const teamWeekH = visibleEmps.reduce((s, emp) => s + computePlanningHoursForPeriod(emp, weekStart, weekEnd), 0);
    trSum.innerHTML += renderHoursTotalCell(Math.round(teamWeekH * 100) / 100, {
      extraClass: `hours-col-week sum-row-hours ${weekParityClass(weekMon)}`,
      title: `Total équipe — semaine ${getISOWeek(weekMon)} — ${formatContractHours(teamWeekH)} h`,
    });
  }
  for (const m of months) {
    const startIso = toISO(m.days[0]);
    const endIso = toISO(m.days[m.days.length - 1]);
    const teamMonthH = visibleEmps.reduce((s, emp) => s + computePlanningHoursForPeriod(emp, startIso, endIso), 0);
    trSum.innerHTML += renderHoursTotalCell(Math.round(teamMonthH * 100) / 100, {
      extraClass: 'hours-col-month sum-row-hours',
      title: `Total équipe — ${MONTH_NAMES[m.month]} ${m.year} — ${formatContractHours(teamMonthH)} h`,
    });
  }
  tfoot.appendChild(trSum);
  tbl.appendChild(tfoot);
  wrap.appendChild(tbl);
  return wrap;
}

function attachWeekTableHandlers(wrap) {
  const requestMode = typeof isEmployeeRequestMode === 'function' && isEmployeeRequestMode();
  const linkedEmp = typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;

  if (requestMode) {
    const needsLinkedEmp = !(typeof isTeamLeader === 'function' && isTeamLeader());
    if (needsLinkedEmp && !linkedEmp) return;
    wrap.querySelectorAll('td.cell[data-emp]').forEach(el => {
      if (!canRequestPlanningFor(el.dataset.emp)) return;
      el.classList.add('editable', 'requestable');
      el.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const emp = el.dataset.emp;
        const iso = el.dataset.date;
        const shift = el.dataset.shift;
        if (!iso || !shift) return;
        if (isAfterEmployeeContractEnd(emp, iso)) {
          toast(`Après la fin de contrat (${frFormatNumeric(getEmployeeContractEndDate(emp))})`, true);
          return;
        }
        openEmployeePlanningChangeRequest(emp, iso, shift);
      };
      el.oncontextmenu = (e) => e.preventDefault();
    });
    return;
  }

  wrap.querySelectorAll('td.cell.editable[data-emp]').forEach(el => {
    el.onclick = (e) => {
      const emp = el.dataset.emp;
      const iso = el.dataset.date;
      const shift = el.dataset.shift;
      if (isAfterEmployeeContractEnd(emp, iso)) {
        toast(`Après la fin de contrat (${frFormatNumeric(getEmployeeContractEndDate(emp))})`, true);
        return;
      }
      if (el.classList.contains('request-pending')
        && typeof openAdminPlanningChangeRequest === 'function') {
        e.preventDefault();
        e.stopPropagation();
        openAdminPlanningChangeRequest(emp, iso, shift);
        return;
      }
      const cur = getPlanningValue(emp, iso, shift);
      setPlanningValue(emp, iso, shift, nextPlanningValueOnLeftClick(cur, e));
      persistAndRender();
    };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      const emp = el.dataset.emp;
      const iso = el.dataset.date;
      const shift = el.dataset.shift;
      if (isAfterEmployeeContractEnd(emp, iso)) {
        toast(`Après la fin de contrat (${frFormatNumeric(getEmployeeContractEndDate(emp))})`, true);
        return;
      }
      if (el.classList.contains('request-pending')
        && typeof openAdminPlanningChangeRequest === 'function') {
        openAdminPlanningChangeRequest(emp, iso, shift);
        return;
      }
      const cur = getPlanningValue(emp, iso, shift);
      const next = nextPlanningValueOnRightClick(cur);
      setPlanningValue(emp, iso, shift, next);
      saveState();
      if (isPlanningSpecialVal(next)) {
        promptPlanningCellHours({ emp, iso, shift, onDone: persistAndRender });
      } else {
        persistAndRender();
      }
    };
    el.ondblclick = (e) => {
      e.preventDefault();
      const emp = el.dataset.emp;
      const iso = el.dataset.date;
      const shift = el.dataset.shift;
      if (isAfterEmployeeContractEnd(emp, iso)) return;
      if (el.classList.contains('request-pending')) return;
      const cur = getPlanningValue(emp, iso, shift);
      if (!isPlanningSpecialVal(cur)) return;
      promptPlanningCellHours({ emp, iso, shift, onDone: persistAndRender });
    };
  });

  wrap.querySelectorAll('.week-import-btn').forEach(btn => {
    btn.onclick = () => {
      const weekMon = btn.dataset.weekMon;
      const pName = btn.dataset.pat;
      const isoWk = btn.dataset.isoWeek;
      const emps = STATE.employees.slice();
      const runImport = (mode) => {
        importPatternWeek(weekMon, emps, mode);
        persistAndRender();
        toast(`Pattern ${pName} importé pour la semaine ${isoWk}`);
      };
      if (!weekHasPlanningData(weekMon, emps)) {
        runImport('overwrite');
        return;
      }
      showPlanningImportDialog({
        title: `Importer ${pName} — semaine ${isoWk}`,
        message: 'Cette semaine contient déjà des présences dans le planning.',
        onChoose: runImport
      });
    };
  });
}

function buildPrintLegendEl({ detail = false } = {}) {
  const leg = document.createElement('div');
  leg.className = 'print-legend' + (detail ? ' print-legend-detail' : '');
  let congeSpans = '';
  for (const ct of getCongeTypeCatalog()) {
    const cls = congeTypeCssClass(ct.id);
    congeSpans += `<span><i class="lg ${cls}"></i> ${escapeHtml(ct.label)}</span>`;
  }
  const note = detail
    ? 'Barres = horaires réels · Eff./h = effectif par heure (rouge ≤2 · jaune 3 · vert ≥4)'
    : 'M = matin · A = après-midi · Effectif en bas de grille';
  leg.innerHTML = `
    <span><i class="lg plein"></i> Présent</span>
    <span><i class="lg special"></i> Présence orange</span>
    <span><i class="lg special-red"></i> Présence rouge</span>
    <span><i class="lg rest"></i> Repos</span>
    <span><i class="lg empty"></i> Non défini</span>
    ${congeSpans}
    <span><i class="lg ferie"></i> Férié (rayures)</span>
    <span><i class="lg garde"></i> Garde (en-tête rouge clair)</span>
    <span class="print-legend-note">${note}</span>`;
  return leg;
}

function syncWeekPrintDatesFromDom() {
  const s = readFrDateInput($('#wk-print-start'));
  const e = readFrDateInput($('#wk-print-end'));
  if (s) STATE.ui.weekPrintStart = s;
  if (e) STATE.ui.weekPrintEnd = e;
  saveState();
  return { startIso: STATE.ui.weekPrintStart, endIso: STATE.ui.weekPrintEnd };
}

function openWeekPrintDocument(root, { detail = false } = {}) {
  document.body.appendChild(root);
  document.body.classList.add('printing-week');
  if (detail) document.body.classList.add('printing-week-detail');

  const cleanup = () => {
    root.remove();
    document.body.classList.remove('printing-week', 'printing-week-detail');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

function printWeekDetailPeriod(startIso, endIso) {
  const allDays = buildDaysForPrintRange(startIso, endIso);
  const weeks = splitDaysIntoWeeks(allDays);
  if (!weeks.length) {
    toast('Aucune semaine complète à imprimer pour cette période.', true);
    return;
  }
  const pages = chunkWeeksForDetailPrint(weeks);
  const visibleEmps = STATE.employees.filter(e => (STATE.ui.filtersEmp || STATE.employees).includes(e));
  const sharedBounds = getWeekDetailTimeBounds(visibleEmps, allDays);
  const empCount = visibleEmps.length;
  const numWeeks = weeks.length;

  const root = document.createElement('div');
  root.id = 'week-print-root';
  root.className = 'week-print-root week-print-root-detail';

  pages.forEach((pageWeeks, pageIdx) => {
    const page = document.createElement('section');
    page.className = 'print-detail-page' + (pageIdx < pages.length - 1 ? ' page-break-after' : '');

    const meta = document.createElement('header');
    meta.className = 'print-doc-header print-detail-header';
    const wkNums = pageWeeks.map(w => getISOWeek(w[0]));
    const wkLabel = wkNums.length === 1
      ? `Semaine ${wkNums[0]}`
      : `Semaines ${wkNums[0]} + ${wkNums[wkNums.length - 1]}`;
    const rangeLabel = `${frFormat(pageWeeks[0][0])} → ${frFormat(pageWeeks[pageWeeks.length - 1][6])}`;
    meta.innerHTML = `
      <div class="print-detail-header-row">
        <h1>Planning — vue détail</h1>
        <span class="print-detail-page-num">Feuille ${pageIdx + 1}/${pages.length}</span>
      </div>
      <p>${wkLabel} · ${rangeLabel}
         · ${empCount} salarié${empCount > 1 ? 's' : ''}
         · ${formatPatternTime(minutesToTime(sharedBounds.startMin))}–${formatPatternTime(minutesToTime(sharedBounds.endMin))}
         · imprimé le ${frFormat(new Date())}</p>`;
    page.appendChild(meta);
    page.appendChild(buildPrintLegendEl({ detail: true }));

    const stack = document.createElement('div');
    stack.className = 'print-detail-stack';

    pageWeeks.forEach((weekDays, wi) => {
      const slot = document.createElement('div');
      slot.className = 'print-detail-week-slot';
      const isoWk = getISOWeek(weekDays[0]);
      const pName = getPatternWeekNameForMonday(weekDays[0]);
      const label = document.createElement('div');
      label.className = 'print-detail-week-label';
      label.innerHTML = `<strong>Semaine ${isoWk}</strong>
        <span class="print-detail-week-pat">${escapeHtml(pName)}</span>
        <span class="muted">${frFormat(weekDays[0])} → ${frFormat(weekDays[6])}</span>`;
      slot.appendChild(label);
      slot.appendChild(createWeekDetailView(weekDays, {
        editable: false,
        forPrint: true,
        timeBounds: sharedBounds,
        compactMeta: true,
      }));
      stack.appendChild(slot);
      if (wi === 0 && pageWeeks.length > 1) {
        const sep = document.createElement('div');
        sep.className = 'print-detail-week-sep';
        sep.setAttribute('aria-hidden', 'true');
        stack.appendChild(sep);
      }
    });

    page.appendChild(stack);
    root.appendChild(page);
  });

  /* Bandeau récap en tête de doc (écran / première page) */
  if (pages.length > 1) {
    const firstP = root.querySelector('.print-detail-header p');
    if (firstP) {
      firstP.insertAdjacentHTML('beforeend',
        ` · période ${frFormat(fromISO(startIso))} → ${frFormat(fromISO(endIso))} (${numWeeks} sem.)`);
    }
  }

  openWeekPrintDocument(root, { detail: true });
}

function printWeekPeriod() {
  if ($('#wk-print-start')) syncWeekPrintDatesFromDom();
  const startIso = STATE.ui.weekPrintStart;
  const endIso = STATE.ui.weekPrintEnd;
  if (!startIso || !endIso) {
    toast('Indique une période d\'impression (Du / Au).', true);
    return;
  }
  if (startIso > endIso) {
    toast('La date de début doit être antérieure ou égale à la date de fin.', true);
    return;
  }

  if ((STATE.ui.weekCellDisplay || 'cross') === 'detail') {
    printWeekDetailPeriod(startIso, endIso);
    return;
  }

  const allDays = buildDaysForPrintRange(startIso, endIso);
  const chunks = chunkDaysForPrint(allDays, WEEK_PRINT_WEEKS_PER_PAGE);
  const numWeeks = Math.ceil(allDays.length / 7);
  const empCount = STATE.employees.filter(e => STATE.ui.filtersEmp.includes(e)).length;

  const root = document.createElement('div');
  root.id = 'week-print-root';
  root.className = 'week-print-root';

  const meta = document.createElement('header');
  meta.className = 'print-doc-header';
  meta.innerHTML = `
    <h1>Planning personnel — vue semaine</h1>
    <p>${frFormat(fromISO(startIso))} → ${frFormat(fromISO(endIso))}
       · ${numWeeks} semaine${numWeeks > 1 ? 's' : ''}
       · ${empCount} salarié${empCount > 1 ? 's' : ''}
       · imprimé le ${frFormat(new Date())}</p>`;
  root.appendChild(meta);
  root.appendChild(buildPrintLegendEl());

  chunks.forEach((chunkDays, i) => {
    const block = document.createElement('section');
    block.className = 'print-week-block' + (i < chunks.length - 1 ? ' page-break-after' : '');
    const wkFrom = getISOWeek(chunkDays[0]);
    const wkTo = getISOWeek(chunkDays[chunkDays.length - 1]);
    const sub = document.createElement('p');
    sub.className = 'print-block-label';
    sub.textContent = chunks.length > 1
      ? `Semaines ${wkFrom}${wkFrom !== wkTo ? ' – ' + wkTo : ''} (${frFormat(chunkDays[0])} → ${frFormat(chunkDays[chunkDays.length - 1])})`
      : '';
    if (sub.textContent) block.appendChild(sub);
    block.appendChild(createWeekPlanningTable(chunkDays, {
      editable: false,
      showImportRow: false,
      forPrint: true,
      weekCellDisplay: STATE.ui.weekCellDisplay || 'cross',
    }));
    root.appendChild(block);
  });

  openWeekPrintDocument(root, { detail: false });
}

/* Vue détail : barres horaires positionnées début→fin + effectif / heure */
function renderWeekDetailShiftBlock(emp, iso, shift, c, options = {}) {
  const { editable = true, forPrint = false, startMin, endMin, span } = options;
  const afterContract = isAfterEmployeeContractEnd(emp, iso);
  const requestMode = typeof isEmployeeRequestMode === 'function' && isEmployeeRequestMode();
  const canRequest = requestMode && canRequestPlanningFor(emp) && !afterContract && !forPrint;
  const canEdit = editable && !afterContract && !requestMode
    && (typeof canEditPlanning !== 'function' || canEditPlanning());
  const pendingReq = typeof getPendingPlanningChangeRequest === 'function'
    ? getPendingPlanningChangeRequest(emp, iso, shift) : null;

  let slotStart = null;
  let slotEnd = null;
  let hours = null;
  let present = false;
  let blockClass = cellDisplayClass(c);

  if (pendingReq) {
    present = !!pendingReq.present;
    if (present) {
      slotStart = pendingReq.start;
      slotEnd = pendingReq.end;
      hours = pendingReq.hours;
    }
    blockClass = 'request-pending';
  } else if (c.full) {
    present = true;
    const slot = getPlanningCellSlot(emp, iso, shift);
    slotStart = slot.start;
    slotEnd = slot.end;
    hours = getPlanningCellHours(emp, iso, shift);
  }

  if (!present || !slotStart || !slotEnd) return '';

  const a = timeToMinutes(slotStart);
  const b = timeToMinutes(slotEnd);
  if (a == null || b == null || b <= a || span <= 0) return '';

  const left = ((a - startMin) / span) * 100;
  const width = ((b - a) / span) * 100;
  if (width <= 0) return '';

  const hint = canEdit ? ' — clic : plein ↔ repos · clic droit : orange → rouge → vert' : '';
  const requestHint = canRequest
    ? (typeof isTeamLeader === 'function' && isTeamLeader()
      ? ' — clic : proposer une modification'
      : ' — clic : proposer une modification')
    : '';
  const adminReqHint = pendingReq && canEdit && !canRequest ? ' — clic : traiter la demande' : '';
  const contractHint = afterContract ? ' — après fin de contrat' : '';
  let title = `${emp} — ${frFormat(fromISO(iso))} — ${shift === 'matin' ? 'Matin' : 'Après-midi'}`;
  if (pendingReq) {
    title += pendingReq.present
      ? ` — demande : ${formatPatternTime(slotStart)} → ${formatPatternTime(slotEnd)} (${formatContractHours(hours)} h)`
      : ' — demande : non présent';
  } else {
    title += ` — ${cellStatusLabel(c)} — ${formatPatternTime(slotStart)} → ${formatPatternTime(slotEnd)}`;
    if (hours != null) title += ` (${formatContractHours(hours)} h)`;
  }
  title += contractHint + hint + requestHint + adminReqHint;
  if (pendingReq) title += ' — en attente de validation';

  const interactive = (canEdit || canRequest) && !forPrint;
  const cls = [
    'week-detail-block',
    blockClass,
    shift === 'matin' ? 'shift-matin' : 'shift-aprem',
  ];
  if (interactive) cls.push('editable');
  if (canRequest) cls.push('requestable');
  if (c.ferie) cls.push('ferie');
  if (afterContract) cls.push('post-contract');

  const label = `${formatPatternTime(slotStart)}–${formatPatternTime(slotEnd)}`;
  const data = forPrint ? '' : ` data-emp="${escapeHtml(emp)}" data-date="${iso}" data-shift="${shift}"`;
  const style = `left:${Math.max(0, left).toFixed(3)}%;width:${Math.min(100 - Math.max(0, left), width).toFixed(3)}%`;
  const tag = forPrint ? 'span' : 'button';
  const typeAttr = forPrint ? '' : ' type="button"';
  const tabAttr = forPrint || interactive ? '' : ' tabindex="-1"';
  return `<${tag}${typeAttr} class="${cls.join(' ')}" style="${style}"${data} title="${escapeHtml(title)}"${tabAttr}>
    <span class="week-detail-block-label">${escapeHtml(label)}</span>
  </${tag}>`;
}

function createWeekDetailView(days, { editable = true, forPrint = false, timeBounds = null, compactMeta = false } = {}) {
  const requestMode = typeof isEmployeeRequestMode === 'function' && isEmployeeRequestMode();
  if (requestMode && !forPrint) editable = true;
  if (forPrint) editable = false;
  const showM = STATE.ui.filterShift !== 'aprem';
  const showA = STATE.ui.filterShift !== 'matin';
  const shifts = [];
  if (showM) shifts.push('matin');
  if (showA) shifts.push('aprem');

  const visibleEmps = STATE.employees.filter(e => (STATE.ui.filtersEmp || STATE.employees).includes(e));
  const bounds = timeBounds || getWeekDetailTimeBounds(visibleEmps, days);
  const { startMin, endMin } = bounds;
  const span = endMin - startMin;
  const hourStarts = [];
  for (let m = startMin; m < endMin; m += 60) hourStarts.push(m);

  const weekMon = days[0];
  const pName = getPatternWeekNameForMonday(weekMon);
  const isoWeek = getISOWeek(weekMon);

  const wrap = document.createElement('div');
  wrap.className = 'planning-wrap week-detail-wrap' + (forPrint ? ' planning-wrap-print week-detail-print' : '');

  if (!compactMeta) {
    const meta = document.createElement('div');
    meta.className = 'week-detail-meta';
    meta.innerHTML = `
      <span class="week-detail-meta-pat">${escapeHtml(pName)}</span>
      <span class="week-detail-meta-week">Semaine ${isoWeek}</span>
      <span class="week-detail-meta-range muted">${formatPatternTime(minutesToTime(startMin))} → ${formatPatternTime(minutesToTime(endMin))}</span>`;
    wrap.appendChild(meta);
  }

  const scroller = document.createElement('div');
  scroller.className = 'week-detail-scroll';

  const tbl = document.createElement('table');
  tbl.className = 'planning week-detail-table';

  const thead = document.createElement('thead');
  const trDays = document.createElement('tr');
  trDays.innerHTML = `<th class="empname week-detail-corner" rowspan="2">Nom</th>`;
  days.forEach((d) => {
    const iso = toISO(d);
    const fr = getFerieLabel(iso);
    const gd = getGardeLabel(iso);
    const today = iso === todayISO();
    const cls = ['day-header', 'day-group', 'week-detail-day', weekParityClass(d)];
    if (fr) cls.push('is-ferie');
    if (gd) cls.push('is-garde');
    if (today) cls.push('is-today');
    trDays.innerHTML += `
      <th class="${cls.join(' ')}" colspan="${hourStarts.length}">
        <span class="date-lbl">${DAY_NAMES_ABBR[d.getDay()]}</span>
        <span class="date-num">${d.getDate()}/${d.getMonth() + 1}</span>
        ${fr ? `<span class="ferie-name">${shortFerieLabel(fr)}</span>` : ''}
        ${gd ? `<span class="garde-name">${shortGardeLabel(gd)}</span>` : ''}
        ${typeof buildReunionIndex === 'function' ? reunionHeaderHtml(iso, buildReunionIndex(iso, iso)) : ''}
      </th>`;
  });
  trDays.innerHTML += `<th class="hours-col hours-col-week" rowspan="2" title="Heures travaillées — fond rouge si écart avec le pattern">H./sem.</th>`;
  thead.appendChild(trDays);

  const trHours = document.createElement('tr');
  trHours.className = 'week-detail-hours-row';
  days.forEach((d) => {
    const parity = weekParityClass(d);
    hourStarts.forEach((hm, hi) => {
      const h = Math.floor(hm / 60);
      const edge = hi === 0 ? ' week-detail-hour-first' : '';
      trHours.innerHTML += `<th class="week-detail-hour ${parity}${edge}">${h}h</th>`;
    });
  });
  thead.appendChild(trHours);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  const linkedEmp = typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;
  const blockOpts = { editable, forPrint, startMin, endMin, span };

  for (const emp of visibleEmps) {
    const tr = document.createElement('tr');
    tr.className = 'emp-row week-detail-emp-row';
    if (requestMode && linkedEmp && typeof employeeNamesMatch === 'function' && employeeNamesMatch(emp, linkedEmp)) {
      tr.classList.add('planning-own-row');
    }
    tr.innerHTML = `<td class="empname ${employeeTypeClass(emp)}" title="${escapeHtml(emp)} — ${escapeHtml(getEmployeeType(emp))}">${escapeHtml(shortEmpName(emp))}</td>`;

    days.forEach((d) => {
      const iso = toISO(d);
      const afterContract = isAfterEmployeeContractEnd(emp, iso);
      const parity = weekParityClass(d);
      const fr = getFerieLabel(iso);
      let blocksHtml = '';
      let statusNote = '';

      for (const shift of shifts) {
        const c = computeCell(emp, iso, shift);
        const pendingReq = typeof getPendingPlanningChangeRequest === 'function'
          ? getPendingPlanningChangeRequest(emp, iso, shift) : null;
        const passesFilter = forPrint || cellPassesTypeFilter(c) || !!pendingReq;
        if (!passesFilter) continue;
        blocksHtml += renderWeekDetailShiftBlock(emp, iso, shift, c, blockOpts);
        if (!c.full && !pendingReq?.present) {
          if (c.status === 'rest' && !statusNote) statusNote = 'Repos';
          else if (c.status === 'empty' && !statusNote) statusNote = '';
          else if (isCongeTypeLabel(c.status) && !statusNote) statusNote = c.status;
        }
      }

      const dayCls = ['week-detail-daycell', parity];
      if (fr) dayCls.push('ferie');
      if (afterContract) dayCls.push('post-contract');
      if (iso === todayISO()) dayCls.push('is-today');

      const noteHtml = (!blocksHtml && statusNote)
        ? `<span class="week-detail-status">${escapeHtml(statusNote)}</span>`
        : '';

      const hourLines = hourStarts.map((_, hi) =>
        `<span class="week-detail-gridline${hi === 0 ? ' first' : ''}" style="left:${(hi / hourStarts.length) * 100}%"></span>`
      ).join('');

      tr.innerHTML += `
        <td class="${dayCls.join(' ')}" colspan="${hourStarts.length}">
          <div class="week-detail-track">
            ${hourLines}
            ${blocksHtml}
            ${noteHtml}
          </div>
        </td>`;
    });

    tr.innerHTML += renderWeekHoursTotalCell(emp, weekMon, `hours-col-week ${weekParityClass(weekMon)}`);
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);

  const tfoot = document.createElement('tfoot');
  const trSum = document.createElement('tr');
  trSum.className = 'sum-row week-detail-sum-row';
  trSum.innerHTML = `<td class="empname sum-label" title="Effectif présent par heure">Eff./h</td>`;

  days.forEach((d) => {
    const iso = toISO(d);
    const parity = weekParityClass(d);
    hourStarts.forEach((hm, hi) => {
      const n = countPresencesInHour(visibleEmps, iso, hm, hm + 60);
      const bg = presenceCountColor(n);
      const hLabel = `${Math.floor(hm / 60)}h–${Math.floor(hm / 60) + 1}h`;
      const title = `${frFormat(d)} · ${hLabel} — ${n} présent${n > 1 ? 's' : ''} (rouge ≤2 · jaune 3 · vert ≥4)`;
      const edge = hi === 0 ? ' week-detail-hour-first' : '';
      trSum.innerHTML += `<td class="cell sum-cell week-detail-hour-sum ${parity}${edge}" style="background:${bg}" title="${title}">${n}</td>`;
    });
  });

  const weekStart = toISO(weekMon);
  const weekEnd = toISO(days[days.length - 1]);
  let teamWeekH = 0;
  for (const emp of visibleEmps) {
    teamWeekH += computePlanningHoursForPeriod(emp, weekStart, weekEnd);
  }
  trSum.innerHTML += renderHoursTotalCell(Math.round(teamWeekH * 100) / 100, {
    extraClass: `hours-col-week sum-row-hours ${weekParityClass(weekMon)}`,
    title: `Total équipe — sem. ${isoWeek} — ${formatContractHours(teamWeekH)} h`,
  });
  tfoot.appendChild(trSum);
  tbl.appendChild(tfoot);

  scroller.appendChild(tbl);
  wrap.appendChild(scroller);
  return wrap;
}

function attachWeekDetailHandlers(wrap) {
  const requestMode = typeof isEmployeeRequestMode === 'function' && isEmployeeRequestMode();
  const linkedEmp = typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;

  if (requestMode) {
    const needsLinkedEmp = !(typeof isTeamLeader === 'function' && isTeamLeader());
    if (needsLinkedEmp && !linkedEmp) return;
    wrap.querySelectorAll('.week-detail-block[data-emp]').forEach(el => {
      if (!canRequestPlanningFor(el.dataset.emp)) return;
      el.classList.add('editable', 'requestable');
      el.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const emp = el.dataset.emp;
        const iso = el.dataset.date;
        const shift = el.dataset.shift;
        if (!iso || !shift) return;
        if (isAfterEmployeeContractEnd(emp, iso)) {
          toast(`Après la fin de contrat (${frFormatNumeric(getEmployeeContractEndDate(emp))})`, true);
          return;
        }
        openEmployeePlanningChangeRequest(emp, iso, shift);
      };
      el.oncontextmenu = (e) => e.preventDefault();
    });
    return;
  }

  wrap.querySelectorAll('.week-detail-block.editable[data-emp]').forEach(el => {
    el.onclick = (e) => {
      e.preventDefault();
      const emp = el.dataset.emp;
      const iso = el.dataset.date;
      const shift = el.dataset.shift;
      if (isAfterEmployeeContractEnd(emp, iso)) {
        toast(`Après la fin de contrat (${frFormatNumeric(getEmployeeContractEndDate(emp))})`, true);
        return;
      }
      if (el.classList.contains('request-pending')
        && typeof openAdminPlanningChangeRequest === 'function') {
        e.stopPropagation();
        openAdminPlanningChangeRequest(emp, iso, shift);
        return;
      }
      const cur = getPlanningValue(emp, iso, shift);
      setPlanningValue(emp, iso, shift, nextPlanningValueOnLeftClick(cur, e));
      persistAndRender();
    };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      const emp = el.dataset.emp;
      const iso = el.dataset.date;
      const shift = el.dataset.shift;
      if (isAfterEmployeeContractEnd(emp, iso)) {
        toast(`Après la fin de contrat (${frFormatNumeric(getEmployeeContractEndDate(emp))})`, true);
        return;
      }
      if (el.classList.contains('request-pending')
        && typeof openAdminPlanningChangeRequest === 'function') {
        openAdminPlanningChangeRequest(emp, iso, shift);
        return;
      }
      const cur = getPlanningValue(emp, iso, shift);
      const next = nextPlanningValueOnRightClick(cur);
      setPlanningValue(emp, iso, shift, next);
      saveState();
      if (isPlanningSpecialVal(next)) {
        promptPlanningCellHours({ emp, iso, shift, onDone: persistAndRender });
      } else {
        persistAndRender();
      }
    };
    el.ondblclick = (e) => {
      e.preventDefault();
      const emp = el.dataset.emp;
      const iso = el.dataset.date;
      const shift = el.dataset.shift;
      if (isAfterEmployeeContractEnd(emp, iso)) return;
      if (el.classList.contains('request-pending')) return;
      const cur = getPlanningValue(emp, iso, shift);
      if (!isPlanningSpecialVal(cur)) return;
      promptPlanningCellHours({ emp, iso, shift, onDone: persistAndRender });
    };
  });
}

function renderWeekView(root) {
  const current = fromISO(STATE.ui.currentDate);
  const monday  = mondayOf(current);
  const displayMode = STATE.ui.weekCellDisplay || 'cross';
  const detailMode = displayMode === 'detail';
  const numWeeks = detailMode ? 1 : 1 + WEEK_VIEW_EXTRA;
  const days    = [];
  for (let i = 0; i < numWeeks * 7; i++) days.push(addDays(monday, i));
  const lastDay = days[days.length - 1];
  const isoWeek = getISOWeek(monday);
  const isoYear = getISOWeekYear(monday);
  const anchorMon = getPatternAnchorMonday();
  const requestMode = typeof isEmployeeRequestMode === 'function' && isEmployeeRequestMode();

  const ctrl = document.createElement('div');
  ctrl.className = 'controls';
  ctrl.innerHTML = `
    <div class="navbtns">
      <button class="nav" id="wk-prev">‹ Semaine</button>
      <button class="nav" id="wk-today">Aujourd'hui</button>
      <button class="nav" id="wk-next">Semaine ›</button>
    </div>
    <div class="label">${frFormat(monday)} → ${frFormat(lastDay)}</div>
    <div class="week-num">${detailMode
      ? `Vue détail · S${isoWeek} · ${isoYear}`
      : `${numWeeks} semaines · S${isoWeek}–S${getISOWeek(lastDay)} · ${isoYear}`}</div>
    <div class="spacer"></div>
    <label>Aller à : <input type="text" class="fr-date" id="wk-jump" data-iso="${STATE.ui.currentDate}" value="${frFormatNumeric(STATE.ui.currentDate)}"></label>
    <span class="help-text no-print">${requestMode
      ? (typeof getPlanningRequestHelpText === 'function' ? getPlanningRequestHelpText() : 'Cliquez sur une demi-journée pour proposer une modification en <b>violet</b>')
      : detailMode
        ? `Chaque barre = une demi-journée, calée sur ses horaires · ligne <b>Eff./h</b> = effectif par heure${typeof countPendingPlanningRequests === 'function' && countPendingPlanningRequests() ? ' · barres <b>violettes</b> : demandes en attente' : ''}`
        : `Semaine pattern (S1…) · ancrage S1 = semaine du ${frFormat(anchorMon)} · clic = plein ↔ repos · clic droit = orange → rouge → vert · durées selon Patterns${typeof countPendingPlanningRequests === 'function' && countPendingPlanningRequests() ? ' · <b>cases violettes</b> : clic pour traiter une demande' : ''}`}</span>
  `;
  root.appendChild(ctrl);

  if (typeof isEmployee === 'function' && isEmployee() && !getLinkedEmployeeName()) {
    const warn = document.createElement('div');
    warn.className = 'form-card';
    warn.innerHTML = '<p class="muted">Votre compte n\'est pas lié à un salarié. Contactez l\'administrateur pour associer votre profil afin de proposer vos propres modifications.</p>';
    root.appendChild(warn);
  } else if (requestMode && typeof isEmployee === 'function' && isEmployee()
    && !(typeof isTeamLeader === 'function' && isTeamLeader())) {
    const linked = getLinkedEmployeeName();
    const resolved = STATE.employees.find(e => typeof isEmployeeRow === 'function' && isEmployeeRow(e));
    if (linked && !resolved) {
      const warn = document.createElement('div');
      warn.className = 'form-card';
      warn.innerHTML = `<p class="muted">Votre profil est lié à « ${escapeHtml(linked)} », mais ce nom ne correspond à aucun salarié du planning. Contactez l'administrateur.</p>`;
      root.appendChild(warn);
    }
  }

  const sidePanel = getSidePanel();
  const activeFilters = countActivePlanningFilters();
  const viewBar = document.createElement('div');
  viewBar.className = 'week-view-bar no-print';
  viewBar.innerHTML = `
    <span class="week-view-bar-label">Affichage</span>
    <div class="week-display-switch" role="group" aria-label="Mode d'affichage du planning">
      <button type="button" class="week-display-btn${displayMode === 'cross' ? ' active' : ''}" data-week-display="cross" aria-pressed="${displayMode === 'cross'}">Croix</button>
      <button type="button" class="week-display-btn${displayMode === 'hours' ? ' active' : ''}" data-week-display="hours" aria-pressed="${displayMode === 'hours'}">Heures</button>
      <button type="button" class="week-display-btn${displayMode === 'detail' ? ' active' : ''}" data-week-display="detail" aria-pressed="${displayMode === 'detail'}">Détail</button>
    </div>
    <div class="week-tools">
      ${activeFilters.total ? '<button type="button" class="week-tool-reset" data-filters-reset>Réinitialiser les filtres</button>' : ''}
      <button type="button" class="week-tool-btn${sidePanel === 'filters' ? ' active' : ''}" data-side-panel="filters" aria-pressed="${sidePanel === 'filters'}" aria-controls="sidebar">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
        Filtres${activeFilters.total ? ` <span class="week-tool-badge" title="${activeFilters.total} filtre(s) actif(s)">${activeFilters.total}</span>` : ''}
      </button>
      <button type="button" class="week-tool-btn${sidePanel === 'legend' ? ' active' : ''}" data-side-panel="legend" aria-pressed="${sidePanel === 'legend'}" aria-controls="sidebar">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2" y="2.5" width="4" height="4" rx="1" fill="currentColor"/><rect x="2" y="9.5" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8.5 4.5h5.5M8.5 11.5h5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        Légende
      </button>
    </div>`;
  root.appendChild(viewBar);

  viewBar.querySelectorAll('[data-side-panel]').forEach(btn => {
    btn.onclick = () => toggleSidePanel(btn.dataset.sidePanel);
  });
  const resetBtn = viewBar.querySelector('[data-filters-reset]');
  if (resetBtn) resetBtn.onclick = () => { resetPlanningFilters(); persistAndRender({ skipCloud: true }); };

  if (STATE.employees.length && !STATE.employees.some(e => (STATE.ui.filtersEmp || []).includes(e))) {
    const hint = document.createElement('p');
    hint.className = 'week-filter-empty no-print';
    hint.innerHTML = 'Aucun salarié affiché : tous sont masqués par les filtres. <button type="button" class="link-btn">Afficher tout le monde</button>';
    hint.querySelector('button').onclick = () => { STATE.ui.filtersEmp = STATE.employees.slice(); persistAndRender({ skipCloud: true }); };
    root.appendChild(hint);
  }

  viewBar.querySelectorAll('[data-week-display]').forEach(btn => {
    btn.onclick = () => {
      const mode = btn.dataset.weekDisplay;
      if (mode === STATE.ui.weekCellDisplay) return;
      STATE.ui.weekCellDisplay = mode;
      saveState();
      persistAndRender();
    };
  });

  if (detailMode) {
    const wrap = createWeekDetailView(days, { editable: true });
    root.appendChild(wrap);
    attachWeekDetailHandlers(wrap);
    decorateWeekReunions(wrap, days);
  } else {
    const wrap = createWeekPlanningTable(days, { editable: true, showImportRow: !requestMode });
    root.appendChild(wrap);
    attachWeekTableHandlers(wrap);
    decorateWeekReunions(wrap, days);
  }

  if (!requestMode) {
  const printStart = STATE.ui.weekPrintStart || toISO(monday);
  const printEnd = STATE.ui.weekPrintEnd || toISO(lastDay);
  const printPanel = document.createElement('div');
  printPanel.className = 'form-card week-print-panel no-print';
  const printHint = detailMode
    ? `Mode <b>Détail</b> : paysage, 1 semaine en largeur, ${WEEK_DETAIL_PRINT_WEEKS_PER_PAGE} semaines empilées par feuille (fenêtre glissante : S1+S2, S2+S3…).`
    : `Format paysage, ${WEEK_PRINT_WEEKS_PER_PAGE} semaines par page.`;
  printPanel.innerHTML = `
    <h3>Impression</h3>
    <p class="muted">${printHint}</p>
    <div class="week-print-fields">
      <label>Du <input type="text" class="fr-date" id="wk-print-start" data-iso="${printStart}" value="${frFormatNumeric(printStart)}"></label>
      <label>Au <input type="text" class="fr-date" id="wk-print-end" data-iso="${printEnd}" value="${frFormatNumeric(printEnd)}"></label>
      <button type="button" class="primary-btn" id="wk-print-run">🖨 Imprimer la période</button>
      <button type="button" class="nav" id="wk-print-sync" title="Reprendre les dates de l'écran">↻ Écran actuel</button>
    </div>`;
  root.appendChild(printPanel);

  const persistPrintDates = () => {
    const s = readFrDateInput($('#wk-print-start'));
    const e = readFrDateInput($('#wk-print-end'));
    if (s) STATE.ui.weekPrintStart = s;
    if (e) STATE.ui.weekPrintEnd = e;
    saveState();
  };
  $('#wk-print-start').addEventListener('blur', persistPrintDates);
  $('#wk-print-end').addEventListener('blur', persistPrintDates);
  $('#wk-print-start').addEventListener('frdate-select', persistPrintDates);
  $('#wk-print-end').addEventListener('frdate-select', persistPrintDates);
  $('#wk-print-run').onclick = () => printWeekPeriod();
  $('#wk-print-sync').onclick = () => {
    STATE.ui.weekPrintStart = toISO(monday);
    /* En détail : proposer au moins 3 semaines pour illustrer la fenêtre glissante */
    STATE.ui.weekPrintEnd = toISO(detailMode ? addDays(monday, 7 * 3 - 1) : lastDay);
    persistAndRender();
  };
  }

  $('#wk-prev').onclick  = () => { STATE.ui.currentDate = toISO(addDays(current, -7)); persistAndRender(); };
  $('#wk-next').onclick  = () => { STATE.ui.currentDate = toISO(addDays(current, 7)); persistAndRender(); };
  $('#wk-today').onclick = () => { STATE.ui.currentDate = todayISO(); persistAndRender(); };
  const wkJump = $('#wk-jump');
  const goToWeekDate = (iso) => {
    if (iso) {
      STATE.ui.currentDate = iso;
      persistAndRender();
    }
  };
  wkJump.onblur = () => goToWeekDate(readFrDateInput(wkJump));
  wkJump.addEventListener('frdate-select', (e) => goToWeekDate(e.detail.iso));
  wkJump.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      wkJump.blur();
    }
  };
}

/* Vérifie si une cellule passe le filtre de type ----------------------- */
function cellPassesTypeFilter(c) {
  const f = STATE.ui.filterTypes;
  if (c.full) return f.includes('work');
  if (c.status === 'rest') return f.includes('rest');
  if (c.status === 'empty') return f.includes('empty');
  if (isCongeTypeLabel(c.status)) return f.includes(c.status);
  return true;
}

/* ===========================================================================
   7. VUE SALARIÉ — bilan période (travail + congés)
   ========================================================================= */

function periodOverlapDays(aStart, aEnd, bStart, bEnd) {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  if (s > e) return 0;
  return diffDays(s, e) + 1;
}

function computePeriodTotals(emp, startIso, endIso) {
  let workShifts = 0, workDays = 0, restShifts = 0, undefinedShifts = 0;
  let feriesOnWork = 0;
  const byCongeType = {};
  for (const ct of getCongeTypeCatalog()) byCongeType[ct.label] = 0;
  let d = fromISO(startIso);
  const last = fromISO(endIso);
  while (d <= last) {
    const iso = toISO(d);
    const cm = computeCell(emp, iso, 'matin');
    const ca = computeCell(emp, iso, 'aprem');
    let workedToday = false;
    for (const c of [cm, ca]) {
      if (c.full) { workShifts++; workedToday = true; }
      else if (c.status === 'rest') restShifts++;
      else if (c.status === 'empty') undefinedShifts++;
      else if (byCongeType[c.status] !== undefined) byCongeType[c.status]++;
    }
    if (workedToday) workDays++;
    if ((cm.ferie || ca.ferie) && (cm.full || ca.full)) feriesOnWork++;
    d = addDays(d, 1);
  }
  const half = (n) => Math.ceil(n / 2);
  return {
    workShifts, workDays, restShifts, undefinedShifts,
    workHours: computePlanningHoursForPeriod(emp, startIso, endIso),
    cp: half(byCongeType['CP'] || 0),
    rtt: half(byCongeType['RTT'] || 0),
    maladie: half(byCongeType['Maladie'] || 0),
    formation: half(byCongeType['Formation'] || 0),
    sansSolde: half(byCongeType['Sans solde'] || 0),
    recup: half(byCongeType['Récupération'] || 0),
    byCongeType: Object.fromEntries(Object.entries(byCongeType).map(([k, v]) => [k, half(v)])),
    feriesOnWork,
    calendarDays: diffDays(startIso, endIso) + 1
  };
}

function congesForEmployeePeriod(emp, startIso, endIso) {
  return STATE.conges
    .filter(c => c.emp === emp && c.end >= startIso && c.start <= endIso)
    .map(c => ({
      ...c,
      daysInPeriod: periodOverlapDays(c.start, c.end, startIso, endIso)
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function summarizeCongesByType(congesList) {
  const byType = {};
  for (const c of congesList) {
    byType[c.type] = (byType[c.type] || 0) + c.daysInPeriod;
  }
  return byType;
}

function renderEmployeeOverviewView(root) {
  const period = appendEmpPeriodBar(root, { showEmployeeSelect: false });
  if (period.invalid) {
    appendEmpPeriodError(root);
    return;
  }
  root.appendChild(buildEmployeeComparisonChart(period.startIso, period.endIso));
  root.appendChild(buildEmployeeOverviewTable(period.startIso, period.endIso));
}

function renderEmployeeDetailView(root) {
  const period = appendEmpPeriodBar(root, { showEmployeeSelect: true });
  if (period.invalid) {
    appendEmpPeriodError(root);
    return;
  }
  const emp = STATE.ui.employeeView || STATE.employees[0];
  root.appendChild(buildEmployeeSummaryTables(emp, period.startIso, period.endIso));
}

function appendEmpPeriodBar(root, { showEmployeeSelect = false } = {}) {
  const emp = STATE.ui.employeeView || STATE.employees[0];
  const startIso = STATE.ui.employeePeriodStart ||
    toISO(new Date(new Date().getFullYear(), 0, 1, 12));
  const endIso = STATE.ui.employeePeriodEnd || todayISO();

  const bar = document.createElement('div');
  bar.className = 'emp-period-bar no-print';
  const empOpts = showEmployeeSelect
    ? STATE.employees.map(e =>
        `<option value="${e}" ${e === emp ? 'selected' : ''}>${e}</option>`
      ).join('')
    : '';

  bar.innerHTML = `
    <div class="emp-period-inner">
      <div class="emp-period-block emp-period-dates">
        <span class="emp-period-label">Période</span>
        <div class="emp-period-fields">
          <label>Du <input type="text" class="fr-date" id="e-period-start" data-iso="${startIso}" value="${frFormatNumeric(startIso)}"></label>
          <label>Au <input type="text" class="fr-date" id="e-period-end" data-iso="${endIso}" value="${frFormatNumeric(endIso)}"></label>
          <button type="button" class="primary-btn" id="e-refresh">Actualiser</button>
        </div>
      </div>
      ${showEmployeeSelect ? `
      <div class="emp-period-block emp-period-emp">
        <span class="emp-period-label">Salarié</span>
        <select id="e-emp">${empOpts}</select>
      </div>` : ''}
    </div>
    <p class="emp-period-hint muted">${frFormat(fromISO(startIso))} → ${frFormat(fromISO(endIso))}</p>`;

  root.appendChild(bar);
  attachEmpPeriodHandlers(showEmployeeSelect);
  return { startIso, endIso, invalid: startIso > endIso };
}

function appendEmpPeriodError(root) {
  const err = document.createElement('p');
  err.className = 'muted emp-summary-error';
  err.textContent = 'La date de début doit être antérieure ou égale à la date de fin.';
  root.appendChild(err);
}

function attachEmpPeriodHandlers(showEmployeeSelect) {
  const persistPeriod = () => {
    const s = readFrDateInput($('#e-period-start'));
    const e = readFrDateInput($('#e-period-end'));
    if (s) STATE.ui.employeePeriodStart = s;
    if (e) STATE.ui.employeePeriodEnd = e;
    saveState();
  };

  $('#e-period-start').addEventListener('blur', persistPeriod);
  $('#e-period-end').addEventListener('blur', persistPeriod);
  $('#e-period-start').addEventListener('frdate-select', () => { persistPeriod(); persistAndRender(); });
  $('#e-period-end').addEventListener('frdate-select', () => { persistPeriod(); persistAndRender(); });

  $('#e-refresh').onclick = () => {
    syncFrDateInputFromValue($('#e-period-start'));
    syncFrDateInputFromValue($('#e-period-end'));
    persistPeriod();
    persistAndRender();
  };

  if (showEmployeeSelect) {
    $('#e-emp').onchange = (e) => {
      STATE.ui.employeeView = e.target.value;
      persistAndRender();
    };
  }
}

function buildEmployeeOverviewTable(startIso, endIso) {
  const card = document.createElement('div');
  card.className = 'form-card emp-overview-table-card';
  const chartEmps = STATE.ui.employeeChartEmps || [];
  const selected = STATE.employees.filter(e => chartEmps.includes(e));

  if (selected.length === 0) {
    card.innerHTML = `<h3>Tableau comparatif</h3><p class="muted">Cochez des salariés dans le graphique ci-dessus.</p>`;
    return card;
  }

  let rows = '';
  for (const emp of selected) {
    const t = computePeriodTotals(emp, startIso, endIso);
    const congesDays = congesForEmployeePeriod(emp, startIso, endIso)
      .reduce((n, c) => n + c.daysInPeriod, 0);
    rows += `<tr>
      <td><b>${emp}</b></td>
      <td class="num"><b>${formatContractHours(t.workHours)}</b></td>
      <td class="num">${t.workDays}</td>
      <td class="num">${t.workShifts}</td>
      <td class="num">${t.cp}</td>
      <td class="num">${t.rtt}</td>
      <td class="num">${t.maladie}</td>
      <td class="num">${congesDays}</td>
    </tr>`;
  }
  const totalHours = selected.reduce((s, emp) =>
    s + computePeriodTotals(emp, startIso, endIso).workHours, 0);

  card.innerHTML = `
    <h3>Tableau comparatif</h3>
    <p class="muted">Salariés cochés dans le graphique · cliquez sur un nom pour ouvrir le détail</p>
    <table class="list emp-summary-table emp-overview-table">
      <thead><tr>
        <th>Salarié</th>
        <th class="num">Heures trav.</th>
        <th class="num">Jours trav.</th>
        <th class="num">Demi-j.</th>
        <th class="num">CP</th>
        <th class="num">RTT</th>
        <th class="num">Maladie</th>
        <th class="num">Congés</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="emp-overview-total">
        <td><b>Total</b></td>
        <td class="num"><b>${formatContractHours(totalHours)}</b></td>
        <td colspan="6"></td>
      </tr></tfoot>
    </table>`;

  card.querySelectorAll('tbody tr').forEach((tr, i) => {
    const emp = selected[i];
    tr.style.cursor = 'pointer';
    tr.title = `Voir le détail de ${emp}`;
    tr.onclick = () => {
      STATE.ui.employeeView = emp;
      STATE.ui.currentTab = 'emp-detail';
      persistAndRender();
    };
  });

  return card;
}

function buildEmployeeComparisonChart(startIso, endIso) {
  const card = document.createElement('div');
  card.className = 'form-card emp-chart-card';

  const chartEmps = STATE.ui.employeeChartEmps || [];
  let pickers = `<div class="emp-chart-pickers"><span class="pickers-label">Afficher dans le graphique :</span><div class="emp-chart-checks">`;
  for (const emp of STATE.employees) {
    const checked = chartEmps.includes(emp) ? 'checked' : '';
    pickers += `<label class="emp-chart-check"><input type="checkbox" data-chart-emp="${emp}" ${checked}> ${shortEmpName(emp)}</label>`;
  }
  pickers += `</div>
    <div class="emp-chart-quick">
      <button type="button" class="nav" id="chart-sel-all">Tous</button>
      <button type="button" class="nav" id="chart-sel-none">Aucun</button>
    </div></div>`;

  const metrics = [
    { key: 'workHours', label: 'Heures travaillées', color: 'var(--accent)', fmt: formatContractHours },
    { key: 'workDays', label: 'Jours travaillés', color: 'var(--accent)' },
    { key: 'cp', label: 'CP', color: 'var(--cp)' },
    { key: 'rtt', label: 'RTT', color: 'var(--rtt)' },
    { key: 'maladie', label: 'Maladie', color: 'var(--mal)' },
    { key: 'congesDays', label: 'Congés enregistrés', color: 'var(--form)' }
  ];

  const selected = STATE.employees.filter(e => chartEmps.includes(e));
  if (selected.length === 0) {
    card.innerHTML = pickers + `<p class="muted">Cochez au moins un salarié pour afficher le graphique.</p>`;
    attachChartPickerHandlers(card);
    return card;
  }

  const rows = selected.map(emp => {
    const t = computePeriodTotals(emp, startIso, endIso);
    const congesDays = congesForEmployeePeriod(emp, startIso, endIso)
      .reduce((n, c) => n + c.daysInPeriod, 0);
    return { emp, short: shortEmpName(emp), ...t, congesDays };
  });

  const maxByKey = {};
  for (const m of metrics) {
    maxByKey[m.key] = Math.max(1, ...rows.map(r => r[m.key] || 0));
  }

  let chartsHtml = `<h3>Graphique comparatif</h3>`;
  chartsHtml += `<div class="emp-chart-grid">`;
  for (const m of metrics) {
    chartsHtml += `<div class="emp-chart-metric"><h4><span class="dot" style="background:${m.color}"></span>${m.label}</h4><div class="emp-chart-rows">`;
    for (const r of rows) {
      const val = r[m.key] || 0;
      const pct = Math.round((val / maxByKey[m.key]) * 100);
      const valLbl = m.fmt ? m.fmt(val) : val;
      chartsHtml += `
        <div class="emp-chart-row" title="${r.emp} — ${m.label} : ${valLbl}">
          <span class="emp-chart-name">${r.short}</span>
          <div class="emp-chart-track"><div class="emp-chart-bar" style="width:${pct}%;background:${m.color}"></div></div>
          <span class="emp-chart-val">${valLbl}</span>
        </div>`;
    }
    chartsHtml += `</div></div>`;
  }
  chartsHtml += `</div>`;

  card.innerHTML = pickers + chartsHtml;
  attachChartPickerHandlers(card);
  return card;
}

function attachChartPickerHandlers(card) {
  card.querySelectorAll('[data-chart-emp]').forEach(cb => {
    cb.onchange = () => {
      const emp = cb.dataset.chartEmp;
      if (!STATE.ui.employeeChartEmps) STATE.ui.employeeChartEmps = [];
      if (cb.checked) {
        if (!STATE.ui.employeeChartEmps.includes(emp)) STATE.ui.employeeChartEmps.push(emp);
      } else {
        STATE.ui.employeeChartEmps = STATE.ui.employeeChartEmps.filter(x => x !== emp);
      }
      persistAndRender();
    };
  });
  const allBtn = card.querySelector('#chart-sel-all');
  const noneBtn = card.querySelector('#chart-sel-none');
  if (allBtn) allBtn.onclick = () => {
    STATE.ui.employeeChartEmps = STATE.employees.slice();
    persistAndRender();
  };
  if (noneBtn) noneBtn.onclick = () => {
    STATE.ui.employeeChartEmps = [];
    persistAndRender();
  };
}

function buildEmployeeSummaryTables(emp, startIso, endIso) {
  const wrap = document.createElement('div');
  wrap.className = 'emp-summary-wrap';

  const startLbl = frFormat(fromISO(startIso));
  const endLbl = frFormat(fromISO(endIso));
  const totals = computePeriodTotals(emp, startIso, endIso);
  const congesList = congesForEmployeePeriod(emp, startIso, endIso);
  const byType = summarizeCongesByType(congesList);
  const congesTotalDays = congesList.reduce((n, c) => n + c.daysInPeriod, 0);

  const synth = document.createElement('div');
  synth.className = 'form-card emp-detail-card';
  const absenceRows = [
    ['CP', totals.cp], ['RTT', totals.rtt], ['Maladie', totals.maladie],
    ['Formation', totals.formation], ['Sans solde', totals.sansSolde], ['Récupération', totals.recup]
  ].filter(([, v]) => v > 0);

  let absenceHtml = absenceRows.length
    ? absenceRows.map(([lbl, v]) => `<tr><td>${lbl}</td><td class="num">${v}</td></tr>`).join('')
    : `<tr><td colspan="2" class="muted">Aucune absence sur la période</td></tr>`;

  synth.innerHTML = `
    <h3>Détail — ${emp}</h3>
    <p class="muted">${startLbl} → ${endLbl} · ${totals.calendarDays} jours calendaires</p>
    <div class="emp-detail-grid">
      <table class="list emp-summary-table emp-detail-block">
        <thead><tr><th colspan="2">Travail</th></tr></thead>
        <tbody>
          <tr class="row-highlight"><td>Heures travaillées</td><td class="num"><b>${formatContractHours(totals.workHours)}</b></td></tr>
          <tr class="row-highlight"><td>Demi-journées travaillées</td><td class="num"><b>${totals.workShifts}</b></td></tr>
          <tr class="row-highlight"><td>Jours travaillés</td><td class="num"><b>${totals.workDays}</b></td></tr>
          <tr><td>Repos</td><td class="num">${totals.restShifts}</td></tr>
          <tr><td>Non renseigné</td><td class="num">${totals.undefinedShifts}</td></tr>
          <tr><td>Fériés sur jour travaillé</td><td class="num">${totals.feriesOnWork}</td></tr>
        </tbody>
      </table>
      <table class="list emp-summary-table emp-detail-block">
        <thead><tr><th colspan="2">Absences (planning)</th></tr></thead>
        <tbody>${absenceHtml}</tbody>
      </table>
    </div>
  `;
  wrap.appendChild(synth);

  const congCard = document.createElement('div');
  congCard.className = 'form-card';
  let congBody = `<h3>Congés enregistrés</h3>`;
  if (congesList.length === 0) {
    congBody += `<p class="muted">Aucun congé sur cette période.</p>`;
  } else {
    congBody += `<p class="muted">${congesTotalDays} jour${congesTotalDays > 1 ? 's' : ''} au total (intersection avec la période)</p>`;
    congBody += `<table class="list emp-summary-table"><thead><tr>
      <th>Type</th><th>Du</th><th>Au</th><th class="num">Jours</th><th>Commentaire</th>
    </tr></thead><tbody>`;
    for (const c of congesList) {
      const typeCls = 'type-' + c.type.replace(/\s+/g, '-');
      congBody += `<tr>
        <td><span class="type-badge ${typeCls}">${c.type}</span></td>
        <td>${frFormatNumeric(c.start)}</td>
        <td>${frFormatNumeric(c.end)}</td>
        <td class="num"><b>${c.daysInPeriod}</b></td>
        <td>${c.comment || ''}</td>
      </tr>`;
    }
    congBody += `</tbody></table>`;
    const types = Object.keys(byType).sort();
    if (types.length > 0) {
      congBody += `<table class="list emp-summary-table emp-summary-by-type"><thead><tr>
        <th>Type</th><th class="num">Jours (période)</th>
      </tr></thead><tbody>`;
      for (const t of types) {
        congBody += `<tr><td>${t}</td><td class="num"><b>${byType[t]}</b></td></tr>`;
      }
      congBody += `</tbody></table>`;
    }
  }
  congCard.innerHTML = congBody;
  wrap.appendChild(congCard);

  return wrap;
}

/* ===========================================================================
   7bis. RELEVÉ D'HEURES (Équipe) — ÉTAPE 1 : total des heures par salarié
   ========================================================================= */

/* Période du relevé (par défaut : mois courant) */
function getRelevePeriod() {
  const now = new Date();
  const defStart = toISO(new Date(now.getFullYear(), now.getMonth(), 1, 12));
  const defEnd = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12));
  return {
    startIso: STATE.ui.relevePeriodStart || defStart,
    endIso: STATE.ui.relevePeriodEnd || defEnd,
  };
}

function releveMonthTitle(startIso, endIso) {
  const s = fromISO(startIso);
  const e = fromISO(endIso);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}`;
  }
  return `${frFormatNumeric(startIso)} → ${frFormatNumeric(endIso)}`;
}

function renderReleveView(root) {
  const { startIso, endIso } = getRelevePeriod();

  const bar = document.createElement('div');
  bar.className = 'emp-period-bar no-print';
  bar.innerHTML = `
    <div class="emp-period-inner">
      <div class="emp-period-block emp-period-dates">
        <span class="emp-period-label">Période</span>
        <div class="emp-period-fields">
          <label>Du <input type="text" class="fr-date" id="rel-start" data-iso="${startIso}" value="${frFormatNumeric(startIso)}"></label>
          <label>Au <input type="text" class="fr-date" id="rel-end" data-iso="${endIso}" value="${frFormatNumeric(endIso)}"></label>
          <button type="button" class="primary-btn" id="rel-refresh">Actualiser</button>
        </div>
      </div>
      <div class="emp-period-block">
        <span class="emp-period-label">Mois</span>
        <div class="emp-period-fields">
          <button type="button" class="nav" id="rel-prev-month">‹ Mois</button>
          <button type="button" class="nav" id="rel-this-month">Mois courant</button>
          <button type="button" class="nav" id="rel-next-month">Mois ›</button>
        </div>
      </div>
    </div>
    <p class="emp-period-hint muted">${frFormat(fromISO(startIso))} → ${frFormat(fromISO(endIso))}</p>`;
  root.appendChild(bar);

  if (startIso > endIso) {
    appendEmpPeriodError(root);
    attachRelevePeriodHandlers();
    return;
  }

  const card = document.createElement('div');
  card.className = 'form-card';
  let rows = '';
  let total = 0;
  for (const emp of STATE.employees) {
    const h = computePlanningHoursForPeriod(emp, startIso, endIso);
    total += h;
    rows += `<tr>
      <td><b>${escapeHtml(emp)}</b></td>
      <td class="num">${formatContractHours(h)}</td>
    </tr>`;
  }
  card.innerHTML = `
    <h3>Relevé d'heures — ${releveMonthTitle(startIso, endIso)}</h3>
    <p class="muted">Total des heures planifiées par salarié sur la période sélectionnée.</p>
    <table class="list emp-summary-table">
      <thead><tr><th>Salarié</th><th class="num">Heures travaillées</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="row-highlight">
        <td><b>Total</b></td>
        <td class="num"><b>${formatContractHours(Math.round(total * 100) / 100)}</b></td>
      </tr></tfoot>
    </table>`;
  root.appendChild(card);

  attachRelevePeriodHandlers();
}

function attachRelevePeriodHandlers() {
  const persist = () => {
    const s = readFrDateInput($('#rel-start'));
    const e = readFrDateInput($('#rel-end'));
    if (s) STATE.ui.relevePeriodStart = s;
    if (e) STATE.ui.relevePeriodEnd = e;
    saveState();
  };
  const setMonth = (year, month) => {
    STATE.ui.relevePeriodStart = toISO(new Date(year, month, 1, 12));
    STATE.ui.relevePeriodEnd = toISO(new Date(year, month + 1, 0, 12));
    persistAndRender();
  };

  const startEl = $('#rel-start');
  const endEl = $('#rel-end');
  if (startEl) {
    startEl.addEventListener('blur', persist);
    startEl.addEventListener('frdate-select', () => { persist(); persistAndRender(); });
  }
  if (endEl) {
    endEl.addEventListener('blur', persist);
    endEl.addEventListener('frdate-select', () => { persist(); persistAndRender(); });
  }

  const refresh = $('#rel-refresh');
  if (refresh) refresh.onclick = () => {
    syncFrDateInputFromValue($('#rel-start'));
    syncFrDateInputFromValue($('#rel-end'));
    persist();
    persistAndRender();
  };

  const prev = $('#rel-prev-month');
  const next = $('#rel-next-month');
  const cur = $('#rel-this-month');
  if (prev) prev.onclick = () => {
    const s = fromISO(getRelevePeriod().startIso);
    setMonth(s.getFullYear(), s.getMonth() - 1);
  };
  if (next) next.onclick = () => {
    const s = fromISO(getRelevePeriod().startIso);
    setMonth(s.getFullYear(), s.getMonth() + 1);
  };
  if (cur) cur.onclick = () => {
    const now = new Date();
    setMonth(now.getFullYear(), now.getMonth());
  };
}

/* Panneau latéral — une section à la fois (filtres OU légende), vue Semaine uniquement */
function renderSidebar() {
  const side = $('#sidebar');
  const panel = getSidePanel();
  if (!panel) { side.innerHTML = ''; return; }
  const showFilters = panel === 'filters';
  let h = `<div class="side-head">
    <div class="side-tabs" role="group" aria-label="Contenu du panneau">
      <button type="button" class="side-tab${showFilters ? ' active' : ''}" data-side-switch="filters" aria-pressed="${showFilters}">Filtres</button>
      <button type="button" class="side-tab${showFilters ? '' : ' active'}" data-side-switch="legend" aria-pressed="${!showFilters}">Légende</button>
    </div>
    <button type="button" class="side-close" aria-label="Fermer le panneau" title="Fermer (Échap)">×</button>
  </div>`;

  if (showFilters) {
    h += `<div class="side-section">
      <div class="side-subhead"><span>Salariés</span>
        <span class="side-links"><button type="button" class="link-btn" id="sel-all">Tous</button><button type="button" class="link-btn" id="sel-none">Aucun</button></span>
      </div>`;
    for (const emp of STATE.employees) {
      const checked = STATE.ui.filtersEmp.includes(emp) ? 'checked' : '';
      h += `<div class="row">
        <input type="checkbox" id="fe-${cssId(emp)}" ${checked} data-emp="${escapeHtml(emp)}">
        <label for="fe-${cssId(emp)}">${escapeHtml(emp)}</label>
      </div>`;
    }
    if (!STATE.employees.length) h += '<p class="muted">Aucun salarié pour le moment.</p>';

    h += `<div class="side-subhead"><span>Demi-journées</span></div>
      <select id="filter-shift" class="side-select">
        <option value="both"  ${STATE.ui.filterShift==='both'?'selected':''}>Matin + après-midi</option>
        <option value="matin" ${STATE.ui.filterShift==='matin'?'selected':''}>Matin seulement</option>
        <option value="aprem" ${STATE.ui.filterShift==='aprem'?'selected':''}>Après-midi seulement</option>
      </select>`;

    h += `<div class="side-subhead"><span>Statuts visibles</span></div>`;
    for (const t of getPlanningFilterTypes()) {
      const checked = STATE.ui.filterTypes.includes(t) ? 'checked' : '';
      const label = t === 'work' ? 'Plein (présent)' : t === 'rest' ? 'Repos (vide)' : t === 'empty' ? 'Non défini (vide)' : t;
      h += `<div class="row">
        <input type="checkbox" id="ft-${cssId(t)}" ${checked} data-type="${escapeHtml(t)}">
        <label for="ft-${cssId(t)}">${escapeHtml(label)}</label>
      </div>`;
    }
    h += `</div>`;
  } else {
    const num = (cls, txt, style = '') => `<span class="sw sw-num ${cls}" style="${style}">${txt}</span>`;
    h += `<div class="side-section legend-list">
      <div class="side-subhead"><span>Présences</span></div>
      <div class="legend-item">${num('', '5,5', 'background:var(--accent)')} Plein (durée en h)</div>
      <div class="legend-item">${num('sw-special', '4')} Orange (clic droit)</div>
      <div class="legend-item">${num('sw-special-red', '3,5')} Rouge (2ᵉ clic droit)</div>
      <div class="legend-item">${num('sw-request', '4')} Demande en attente</div>
      <div class="side-subhead"><span>Cases vides</span></div>
      <div class="legend-item"><span class="sw" style="background:var(--rest-soft)"></span> Repos</div>
      <div class="legend-item"><span class="sw" style="background:var(--empty)"></span> Non défini</div>`;
    for (const ct of getCongeTypeCatalog()) {
      const color = getCongeEntryColors(ct).bg;
      h += `<div class="legend-item"><span class="sw" style="background:${color}"></span> ${escapeHtml(ct.label)}</div>`;
    }
    h += `<div class="side-subhead"><span>Jours</span></div>
      <div class="legend-item"><span class="sw sw-ferie"></span> Jour férié (rayures)</div>
      <div class="legend-item"><span class="sw sw-garde"></span> Jour de garde</div>
      <div class="legend-item"><span class="sw sw-reunion-legend"><span class="reunion-dot-inline"></span></span> Réunion (participants)</div>
    </div>`;
  }
  side.innerHTML = h;
  side.querySelector('.side-close').onclick = () => toggleSidePanel(panel);
  side.querySelectorAll('[data-side-switch]').forEach(btn => {
    btn.onclick = () => { if (btn.dataset.sideSwitch !== panel) toggleSidePanel(btn.dataset.sideSwitch); };
  });

  if (showFilters) {
    side.querySelectorAll('[data-emp]').forEach(cb => {
      cb.onchange = () => {
        const emp = cb.dataset.emp;
        if (cb.checked) {
          if (!STATE.ui.filtersEmp.includes(emp)) STATE.ui.filtersEmp.push(emp);
        } else {
          STATE.ui.filtersEmp = STATE.ui.filtersEmp.filter(x => x !== emp);
        }
        persistAndRender();
      };
    });
    side.querySelectorAll('[data-type]').forEach(cb => {
      cb.onchange = () => {
        const t = cb.dataset.type;
        if (cb.checked) {
          if (!STATE.ui.filterTypes.includes(t)) STATE.ui.filterTypes.push(t);
        } else {
          STATE.ui.filterTypes = STATE.ui.filterTypes.filter(x => x !== t);
        }
        persistAndRender();
      };
    });
    const sa = side.querySelector('#sel-all');
    const sn = side.querySelector('#sel-none');
    if (sa) sa.onclick = () => { STATE.ui.filtersEmp = STATE.employees.slice(); persistAndRender(); };
    if (sn) sn.onclick = () => { STATE.ui.filtersEmp = []; persistAndRender(); };
    const fs = side.querySelector('#filter-shift');
    if (fs) fs.onchange = (e) => { STATE.ui.filterShift = e.target.value; persistAndRender(); };
  }
}
