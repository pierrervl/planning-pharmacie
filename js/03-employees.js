/* Types de salariés — catalogue modifiable */
'use strict';

const EMPLOYEE_TYPE_THEMES = [
  { id: 'green-light', label: 'Vert clair',    bg: '#e8f5e9', border: '#81c784' },
  { id: 'green',       label: 'Vert',          bg: '#c8e6c9', border: '#2e7d32' },
  { id: 'green-lime',  label: 'Vert pomme',    bg: '#dcedc8', border: '#689f38' },
  { id: 'purple-light', label: 'Violet clair', bg: '#f3e5f5', border: '#ce93d8' },
  { id: 'purple',      label: 'Violet',        bg: '#e1bee7', border: '#7b1fa2' },
  { id: 'blue-light',  label: 'Bleu clair',    bg: '#e3f2fd', border: '#1976d2' },
  { id: 'blue',        label: 'Bleu',          bg: '#bbdefb', border: '#1565c0' },
  { id: 'teal',        label: 'Sarcelle',      bg: '#e0f7fa', border: '#00838f' },
  { id: 'orange',      label: 'Orange',        bg: '#fff3e0', border: '#f57c00' },
  { id: 'amber',       label: 'Ambre',         bg: '#fff8e1', border: '#ff8f00' },
  { id: 'pink',        label: 'Rose',          bg: '#fce4ec', border: '#c2185b' },
  { id: 'red-light',   label: 'Rouge clair',   bg: '#ffebee', border: '#e53935' },
  { id: 'gray',        label: 'Gris',          bg: '#eceff1', border: '#546e7a' },
  { id: 'brown',       label: 'Brun',          bg: '#efebe9', border: '#6d4c41' },
];

const DEFAULT_EMPLOYEE_TYPE_CATALOG = [
  { id: 'pharm-etudiant',   label: 'Pharmacien étudiant',   group: 'Pharmacien',  themeId: 'green-light' },
  { id: 'pharm-salarie',    label: 'Pharmacien salarié',    group: 'Pharmacien',  themeId: 'green' },
  { id: 'pharm-remplacant', label: 'Pharmacien remplaçant', group: 'Pharmacien',  themeId: 'green-lime' },
  { id: 'prep-etudiant',    label: 'Préparateur étudiant',  group: 'Préparateur', themeId: 'purple-light' },
  { id: 'prep-salarie',     label: 'Préparateur salarié',   group: 'Préparateur', themeId: 'purple' },
];

const DEFAULT_EMPLOYEE_TYPE_ID = 'pharm-salarie';

const EMPLOYEE_TYPE_LEGACY_MAP = {
  Pharmacien:  'Pharmacien salarié',
  Préparateur: 'Préparateur salarié',
  Étudiant:    'Pharmacien étudiant',
  Salarié:     'Pharmacien salarié',
};

function getThemeById(themeId) {
  return EMPLOYEE_TYPE_THEMES.find(t => t.id === themeId) || EMPLOYEE_TYPE_THEMES[0];
}

function resolveThemeIdFromColors(bg, border) {
  const bgN = normalizeHexColor(bg);
  const borderN = normalizeHexColor(border);
  if (!bgN || !borderN) return null;
  return EMPLOYEE_TYPE_THEMES.find(t => t.bg === bgN && t.border === borderN)?.id || null;
}

function getDefaultThemeIdForCatalogIndex(idx) {
  return EMPLOYEE_TYPE_THEMES[idx % EMPLOYEE_TYPE_THEMES.length].id;
}

function getEntryColors(entry) {
  const theme = getThemeById(entry.themeId);
  return { bg: theme.bg, border: theme.border };
}

function getDefaultThemeIdForTypeId(typeId) {
  const def = DEFAULT_EMPLOYEE_TYPE_CATALOG.find(t => t.id === typeId);
  if (def?.themeId) return def.themeId;
  const idx = Math.abs(String(typeId).split('').reduce((a, c) => a + c.charCodeAt(0), 0))
    % EMPLOYEE_TYPE_THEMES.length;
  return EMPLOYEE_TYPE_THEMES[idx].id;
}

function cloneDefaultEmployeeTypeCatalog() {
  return DEFAULT_EMPLOYEE_TYPE_CATALOG.map(t => ({ ...t }));
}

function makeEmployeeTypeId() {
  return `et_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cssSafeTypeId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function normalizeHexColor(value) {
  if (value == null || value === '') return null;
  let v = String(value).trim();
  if (!v.startsWith('#')) v = `#${v}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
  return v.toLowerCase();
}

function normalizeCatalogEntry(raw, idx, seenIds) {
  const defById = DEFAULT_EMPLOYEE_TYPE_CATALOG.find(d => d.id === raw.id);
  const defByLabel = DEFAULT_EMPLOYEE_TYPE_CATALOG.find(d => d.label === raw.label);
  const def = defById || defByLabel;
  let id = raw.id || def?.id || makeEmployeeTypeId();
  id = cssSafeTypeId(id);
  while (seenIds.has(id)) id = makeEmployeeTypeId();
  seenIds.add(id);
  const label = String(raw.label || def?.label || `Type ${idx + 1}`).trim();
  const group = String(raw.group ?? def?.group ?? 'Autres').trim() || 'Autres';
  let themeId = raw.themeId;
  if (!themeId || !EMPLOYEE_TYPE_THEMES.some(t => t.id === themeId)) {
    themeId = resolveThemeIdFromColors(raw.bg, raw.border)
      || def?.themeId
      || getDefaultThemeIdForCatalogIndex(idx);
  }
  return { id, label, group, themeId };
}

function getEmployeeTypeCatalog(state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { employeeTypeCatalog: [] };
  return state.employeeTypeCatalog || [];
}

function getEmployeeTypeDefById(id, state) {
  if (!id) return null;
  return getEmployeeTypeCatalog(state).find(t => t.id === id) || null;
}

function getEmployeeTypeDefByLabel(label, state) {
  if (!label) return null;
  const l = String(label).trim();
  return getEmployeeTypeCatalog(state).find(t => t.label === l) || null;
}

function getDefaultEmployeeTypeId(state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : null;
  const catalog = getEmployeeTypeCatalog(state);
  if (catalog.some(t => t.id === DEFAULT_EMPLOYEE_TYPE_ID)) return DEFAULT_EMPLOYEE_TYPE_ID;
  return catalog[0]?.id || DEFAULT_EMPLOYEE_TYPE_ID;
}

function resolveEmployeeTypeId(typeRef, state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { employeeTypeCatalog: [] };
  ensureEmployeeTypeCatalog(state);
  if (!typeRef) return getDefaultEmployeeTypeId(state);
  const ref = String(typeRef).trim();
  const byId = getEmployeeTypeDefById(ref, state);
  if (byId) return byId.id;
  const byLabel = getEmployeeTypeDefByLabel(ref, state);
  if (byLabel) return byLabel.id;
  const legacyLabel = EMPLOYEE_TYPE_LEGACY_MAP[ref];
  if (legacyLabel) {
    const legacy = getEmployeeTypeDefByLabel(legacyLabel, state);
    if (legacy) return legacy.id;
  }
  return getDefaultEmployeeTypeId(state);
}

function getEmployeeTypeLabelById(id, state) {
  const def = getEmployeeTypeDefById(id, state);
  return def ? def.label : getEmployeeTypeDefById(getDefaultEmployeeTypeId(state), state)?.label || 'Salarié';
}

function getEmployeeTypeGroups(state) {
  const groups = [];
  for (const t of getEmployeeTypeCatalog(state)) {
    const g = t.group || 'Autres';
    if (!groups.includes(g)) groups.push(g);
  }
  return groups;
}

function ensureEmployeeTypeCatalog(state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { employeeTypeCatalog: [] };
  if (!state.employeeTypeCatalog || !state.employeeTypeCatalog.length) {
    state.employeeTypeCatalog = cloneDefaultEmployeeTypeCatalog();
  }
  const seenIds = new Set();
  state.employeeTypeCatalog = state.employeeTypeCatalog
    .map((raw, idx) => normalizeCatalogEntry(raw || {}, idx, seenIds))
    .filter(t => t.label);

  if (state.employeeTypeColors && typeof state.employeeTypeColors === 'object') {
    for (const entry of state.employeeTypeCatalog) {
      const custom = state.employeeTypeColors[entry.label]
        || state.employeeTypeColors[entry.id];
      if (!custom) continue;
      entry.themeId = resolveThemeIdFromColors(custom.bg, custom.border) || entry.themeId;
    }
    delete state.employeeTypeColors;
  }

  if (!state.employeeTypeCatalog.length) {
    state.employeeTypeCatalog = cloneDefaultEmployeeTypeCatalog();
  }
}

function getEmployeeTypeStyle(typeRef, state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { employeeTypeCatalog: [] };
  const id = resolveEmployeeTypeId(typeRef, state);
  const entry = getEmployeeTypeDefById(id, state);
  const fallback = getEmployeeTypeDefById(getDefaultEmployeeTypeId(state), state)
    || DEFAULT_EMPLOYEE_TYPE_CATALOG[1];
  const base = entry || fallback;
  const colors = getEntryColors(base);
  return {
    id: base.id,
    label: base.label,
    group: base.group,
    themeId: base.themeId,
    bg: colors.bg,
    border: colors.border,
    slug: cssSafeTypeId(base.id),
  };
}

function setEmployeeTypeTheme(typeRef, themeId, state) {
  if (!state) state = STATE;
  const id = resolveEmployeeTypeId(typeRef, state);
  const entry = getEmployeeTypeDefById(id, state);
  if (!entry) return { ok: false, error: 'Type inconnu.' };
  if (!getThemeById(themeId)) return { ok: false, error: 'Thème inconnu.' };
  entry.themeId = themeId;
  return { ok: true };
}

function resetEmployeeTypeTheme(typeRef, state) {
  if (!state) state = STATE;
  const id = resolveEmployeeTypeId(typeRef, state);
  const entry = getEmployeeTypeDefById(id, state);
  if (!entry) return;
  entry.themeId = getDefaultThemeIdForTypeId(id);
}

function resetAllEmployeeTypeThemes(state) {
  if (!state) state = STATE;
  ensureEmployeeTypeCatalog(state);
  for (const entry of state.employeeTypeCatalog) {
    entry.themeId = getDefaultThemeIdForTypeId(entry.id);
  }
}

function validateTypeLabel(label, excludeId, state) {
  const l = String(label || '').trim().replace(/\s+/g, ' ');
  if (!l) return 'Le libellé ne peut pas être vide.';
  if (l.length < 2) return 'Le libellé doit comporter au moins 2 caractères.';
  if (getEmployeeTypeCatalog(state).some(t => t.id !== excludeId && t.label === l)) {
    return `Un type « ${l} » existe déjà.`;
  }
  return null;
}

function addEmployeeTypeCatalogEntry(label, group, themeId, state) {
  if (!state) state = STATE;
  ensureEmployeeTypeCatalog(state);
  const cleanLabel = String(label || '').trim().replace(/\s+/g, ' ');
  const err = validateTypeLabel(cleanLabel, null, state);
  if (err) return { ok: false, error: err };
  const entry = {
    id: makeEmployeeTypeId(),
    label: cleanLabel,
    group: String(group || 'Autres').trim() || 'Autres',
    themeId: getThemeById(themeId)?.id || getDefaultThemeIdForCatalogIndex(state.employeeTypeCatalog.length),
  };
  state.employeeTypeCatalog.push(entry);
  return { ok: true, entry };
}

function updateEmployeeTypeCatalogEntry(id, updates, state) {
  if (!state) state = STATE;
  const entry = getEmployeeTypeDefById(id, state);
  if (!entry) return { ok: false, error: 'Type introuvable.' };
  if (updates.label != null) {
    const cleanLabel = String(updates.label).trim().replace(/\s+/g, ' ');
    const err = validateTypeLabel(cleanLabel, id, state);
    if (err) return { ok: false, error: err };
    entry.label = cleanLabel;
  }
  if (updates.group != null) {
    entry.group = String(updates.group).trim() || 'Autres';
  }
  if (updates.themeId != null) {
    if (!getThemeById(updates.themeId)) return { ok: false, error: 'Thème inconnu.' };
    entry.themeId = updates.themeId;
  }
  return { ok: true, entry };
}

function countEmployeesWithTypeId(typeId, state) {
  if (!state) state = STATE;
  return (state.employees || []).filter(emp =>
    resolveEmployeeTypeId((state.employeeTypes || {})[emp], state) === typeId
  ).length;
}

function removeEmployeeTypeCatalogEntry(id, state) {
  if (!state) state = STATE;
  ensureEmployeeTypeCatalog(state);
  if (state.employeeTypeCatalog.length <= 1) {
    return { ok: false, error: 'Impossible de supprimer le dernier type.' };
  }
  if (countEmployeesWithTypeId(id, state) > 0) {
    return { ok: false, error: 'Ce type est assigné à des salariés. Réassignez-les d\'abord.' };
  }
  state.employeeTypeCatalog = state.employeeTypeCatalog.filter(t => t.id !== id);
  return { ok: true };
}

function applyEmployeeTypeColorStyles(state) {
  if (typeof document === 'undefined') return;
  if (!state) state = typeof STATE !== 'undefined' ? STATE : null;
  if (!state) return;
  ensureEmployeeTypeCatalog(state);
  const root = document.documentElement;
  const rules = [];
  for (const t of state.employeeTypeCatalog) {
    const cls = employeeTypeClassForId(t.id);
    const colors = getEntryColors(t);
    root.style.setProperty(`--emp-type-${t.id}-bg`, colors.bg);
    root.style.setProperty(`--emp-type-${t.id}-border`, colors.border);
    rules.push(`
      .${cls},
      .employees-type-chip.${cls},
      .employees-team-chip.${cls},
      select.emp-type-select.${cls},
      table.employees-list td.emp-name-cell.${cls} {
        background-color: var(--emp-type-${t.id}-bg);
        border-left-color: var(--emp-type-${t.id}-border);
      }
      table.planning td.empname.${cls} {
        background-color: var(--emp-type-${t.id}-bg);
        border-left: 3px solid var(--emp-type-${t.id}-border);
      }`);
  }
  let el = document.getElementById('emp-type-dynamic-styles');
  if (!el) {
    el = document.createElement('style');
    el.id = 'emp-type-dynamic-styles';
    document.head.appendChild(el);
  }
  el.textContent = rules.join('\n');
}

function refreshEmployeeTypeOptionStyles() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('select.emp-type-select option').forEach(opt => {
    const s = getEmployeeTypeStyle(opt.value);
    opt.style.backgroundColor = s.bg;
  });
}

function getEmployeeTypeId(emp, state) {
  if (!state) state = STATE;
  return resolveEmployeeTypeId((state.employeeTypes || {})[emp], state);
}

function getEmployeeType(emp, state) {
  return getEmployeeTypeLabelById(getEmployeeTypeId(emp, state), state);
}

function setEmployeeType(emp, typeRef) {
  if (!STATE.employeeTypes) STATE.employeeTypes = {};
  STATE.employeeTypes[emp] = resolveEmployeeTypeId(typeRef);
}

function employeeTypeClassForId(typeId) {
  return `emp-type-${cssSafeTypeId(typeId)}`;
}

function employeeTypeClass(emp) {
  return employeeTypeClassForId(getEmployeeTypeId(emp));
}

function employeeTypeSelectClass(typeRef) {
  return employeeTypeClassForId(resolveEmployeeTypeId(typeRef));
}

function escapeEmpTypeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEmployeeTypeOptions(selectedTypeRef) {
  const selectedId = resolveEmployeeTypeId(selectedTypeRef);
  return getEmployeeTypeCatalog().map(t => {
    const colors = getEntryColors(t);
    const sel = t.id === selectedId ? ' selected' : '';
    return `<option value="${escapeEmpTypeText(t.id)}"${sel} style="background-color:${colors.bg};color:#1a1a1a;">${escapeEmpTypeText(t.label)}</option>`;
  }).join('');
}

function syncEmployeeTypeSelectStyle(selectEl) {
  if (!selectEl) return;
  selectEl.className = `emp-type-select ${employeeTypeSelectClass(selectEl.value)}`;
}

function syncEmployeeListRowColors(row, typeRef) {
  if (!row) return;
  const slugClass = employeeTypeSelectClass(typeRef);
  const nameCell = row.querySelector('.emp-name-cell');
  if (!nameCell) return;
  [...nameCell.classList].filter(c => c.startsWith('emp-type-')).forEach(c => nameCell.classList.remove(c));
  nameCell.classList.add(slugClass);
}

function ensureEmployeeTypes(state = STATE) {
  ensureEmployeeTypeCatalog(state);
  if (!state.employeeTypes) state.employeeTypes = {};
  for (const emp of state.employees || []) {
    state.employeeTypes[emp] = resolveEmployeeTypeId(state.employeeTypes[emp], state);
  }
  for (const name of Object.keys(state.employeeTypes)) {
    if (!(state.employees || []).includes(name)) {
      delete state.employeeTypes[name];
    }
  }
}

function ensureEmployeeTypeColors(state) {
  ensureEmployeeTypeCatalog(state);
}

/* Coordonnées et informations personnelles par salarié ----------------- */
const EMPLOYEE_INFO_FIELDS = [
  { key: 'phone', label: 'Téléphone', type: 'tel', placeholder: '06 12 34 56 78' },
  { key: 'email', label: 'E-mail', type: 'email', placeholder: 'prenom@exemple.fr' },
  { key: 'address', label: 'Adresse', type: 'text', wide: true, placeholder: 'Rue, code postal, ville' },
  { key: 'diplomaYear', label: 'Année de diplôme', type: 'number', min: 1950, max: 2100, placeholder: '2018' },
  { key: 'birthDate', label: 'Date de naissance', type: 'fr-date' },
  { key: 'birthPlace', label: 'Lieu de naissance', type: 'text', placeholder: 'Ville' },
  { key: 'secuNumber', label: 'N° sécurité sociale', type: 'text', mono: true, placeholder: '1 23 45 67 890 123 45' },
];

function makeEmptyEmployeeInfo() {
  return {
    phone: '',
    email: '',
    address: '',
    diplomaYear: '',
    birthDate: '',
    birthPlace: '',
    secuNumber: '',
  };
}

function normalizeEmployeeInfo(raw) {
  const base = makeEmptyEmployeeInfo();
  if (!raw || typeof raw !== 'object') return base;
  for (const f of EMPLOYEE_INFO_FIELDS) {
    if (raw[f.key] != null && raw[f.key] !== '') {
      base[f.key] = String(raw[f.key]).trim();
    }
  }
  return base;
}

function getEmployeeInfo(emp, state = STATE) {
  if (!state.employeeInfo) state.employeeInfo = {};
  if (!state.employeeInfo[emp]) state.employeeInfo[emp] = makeEmptyEmployeeInfo();
  return state.employeeInfo[emp];
}

function setEmployeeInfo(emp, info, state = STATE) {
  if (!state.employeeInfo) state.employeeInfo = {};
  state.employeeInfo[emp] = normalizeEmployeeInfo(info);
}

function ensureEmployeeInfo(state = STATE) {
  if (!state.employeeInfo) state.employeeInfo = {};
  for (const emp of state.employees || []) {
    state.employeeInfo[emp] = normalizeEmployeeInfo(state.employeeInfo[emp]);
  }
  for (const name of Object.keys(state.employeeInfo)) {
    if (!(state.employees || []).includes(name)) {
      delete state.employeeInfo[name];
    }
  }
}

function renderEmployeeInfoFieldHtml(emp, field, info) {
  const val = info[field.key] || '';
  const domId = `emp-info-${field.key}-${String(emp).replace(/[^a-zA-Z0-9]/g, '_')}`;
  const dataAttr = `data-info="${field.key}" data-emp="${escapeHtml(emp)}"`;
  if (field.type === 'fr-date') {
    const iso = val || '';
    const display = iso ? frFormatNumeric(iso) : '';
    return `
      <label>${field.label}
        <input type="text" class="fr-date" id="${domId}" ${dataAttr}
               data-iso="${escapeHtml(iso)}" value="${escapeHtml(display)}"
               placeholder="jj/mm/aaaa" autocomplete="off">
      </label>`;
  }
  const cls = [field.mono ? 'emp-info-mono' : ''].filter(Boolean).join(' ');
  const attrs = [
    field.min != null ? `min="${field.min}"` : '',
    field.max != null ? `max="${field.max}"` : '',
    field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : '',
  ].filter(Boolean).join(' ');
  return `
    <label class="${field.wide ? 'emp-info-wide' : ''}">${field.label}
      <input type="${field.type}" id="${domId}" class="${cls}" ${dataAttr} value="${escapeHtml(val)}" ${attrs} autocomplete="off">
    </label>`;
}

function readEmployeeInfoFromPanel(panel) {
  const info = makeEmptyEmployeeInfo();
  for (const f of EMPLOYEE_INFO_FIELDS) {
    const el = panel.querySelector(`[data-info="${f.key}"]`);
    if (!el) continue;
    if (f.type === 'fr-date') {
      syncFrDateInputFromValue(el);
      info[f.key] = el.dataset.iso || '';
    } else {
      info[f.key] = el.value.trim();
    }
  }
  return info;
}

/* Contrat — jours travaillés (données, chargées avant 01-state.js) ------------ */
function makeContractDayId() {
  return `cd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeContractDay(raw) {
  if (!raw || !raw.date) return null;
  const hours = parseFloat(String(raw.hours).replace(',', '.'));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
  return {
    id: raw.id || makeContractDayId(),
    date: raw.date,
    hours: Math.round(hours * 100) / 100,
    note: String(raw.note || '').trim(),
  };
}

function getContractDays(emp, state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { contractDays: {}, employees: [] };
  if (!state.contractDays) state.contractDays = {};
  if (!state.contractDays[emp]) state.contractDays[emp] = [];
  return state.contractDays[emp];
}

function sortContractDays(days) {
  return days.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function contractDaysTotalHours(days) {
  return days.reduce((sum, d) => sum + (d.hours || 0), 0);
}

function formatContractHours(h) {
  const n = Math.round(h * 100) / 100;
  return String(n).replace('.', ',');
}

function addContractDay(emp, dateIso, hours, note, state) {
  if (state === undefined) state = STATE;
  const day = normalizeContractDay({ id: makeContractDayId(), date: dateIso, hours, note });
  if (!day) return { ok: false, error: 'Date ou durée invalide (0–24 h).' };
  getContractDays(emp, state).push(day);
  return { ok: true, day };
}

function removeContractDay(emp, dayId, state) {
  if (state === undefined) state = STATE;
  const list = getContractDays(emp, state);
  const i = list.findIndex(d => d.id === dayId);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

function ensureContractDays(state) {
  if (!state.contractDays) state.contractDays = {};
  for (const emp of state.employees || []) {
    if (!state.contractDays[emp]) state.contractDays[emp] = [];
    state.contractDays[emp] = state.contractDays[emp]
      .map(normalizeContractDay)
      .filter(Boolean);
  }
  for (const name of Object.keys(state.contractDays)) {
    if (!(state.employees || []).includes(name)) delete state.contractDays[name];
  }
}

function formatEmployeeInfoDisplay(field, value) {
  if (!value) return '—';
  if (field.key === 'birthDate') return frFormatNumeric(value);
  return value;
}

/* Pharmacie & employeur (PDF contrat) ----------------------------------- */
const PHARMACY_INFO_FIELDS = [
  { key: 'name', label: 'Nom de la pharmacie', placeholder: 'Pharmacie du Centre' },
  { key: 'address', label: 'Adresse', wide: true, placeholder: 'Rue, code postal, ville' },
  { key: 'phone', label: 'Téléphone' },
  { key: 'email', label: 'E-mail' },
  { key: 'siret', label: 'SIRET' },
  { key: 'finess', label: 'N° FINESS' },
];

const EMPLOYER_INFO_FIELDS = [
  { key: 'name', label: 'Nom de l\'employeur', placeholder: 'Prénom Nom' },
  { key: 'role', label: 'Fonction', placeholder: 'Pharmacien titulaire' },
  { key: 'phone', label: 'Téléphone' },
  { key: 'email', label: 'E-mail' },
];

function makeEmptyPharmacyInfo() {
  return { name: '', address: '', phone: '', email: '', siret: '', finess: '' };
}

function makeEmptyEmployerInfo() {
  return { name: '', role: '', phone: '', email: '' };
}

function normalizePartyInfo(raw, fields) {
  const base = {};
  for (const f of fields) base[f.key] = '';
  if (!raw || typeof raw !== 'object') return base;
  for (const f of fields) {
    if (raw[f.key] != null && raw[f.key] !== '') base[f.key] = String(raw[f.key]).trim();
  }
  return base;
}

function getPharmacyInfo(state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { pharmacyInfo: {} };
  if (!state.pharmacyInfo) state.pharmacyInfo = makeEmptyPharmacyInfo();
  return state.pharmacyInfo;
}

function getEmployerInfo(state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { employerInfo: {} };
  if (!state.employerInfo) state.employerInfo = makeEmptyEmployerInfo();
  return state.employerInfo;
}

function setPharmacyInfo(info, state) {
  if (!state) state = STATE;
  state.pharmacyInfo = normalizePartyInfo(info, PHARMACY_INFO_FIELDS);
}

function setEmployerInfo(info, state) {
  if (!state) state = STATE;
  state.employerInfo = normalizePartyInfo(info, EMPLOYER_INFO_FIELDS);
}

function ensureContractPartyInfo(state) {
  state.pharmacyInfo = normalizePartyInfo(state.pharmacyInfo, PHARMACY_INFO_FIELDS);
  state.employerInfo = normalizePartyInfo(state.employerInfo, EMPLOYER_INFO_FIELDS);
  if (state.ui && state.ui.contractPharmacyName && !state.pharmacyInfo.name) {
    state.pharmacyInfo.name = String(state.ui.contractPharmacyName).trim();
  }
}

function renderPartyInfoFieldHtml(prefix, field, info) {
  const val = info[field.key] || '';
  const domId = `${prefix}-${field.key}`;
  const dataAttr = `data-party="${prefix}" data-party-key="${field.key}"`;
  const ph = field.placeholder ? ` placeholder="${field.placeholder.replace(/"/g, '&quot;')}"` : '';
  return `
    <label class="${field.wide ? 'contract-party-wide' : ''}">${field.label}
      <input type="text" id="${domId}" ${dataAttr} value="${val.replace(/"/g, '&quot;')}"${ph} autocomplete="off">
    </label>`;
}

function readPartyInfoFromPanel(panel, prefix, fields) {
  const info = {};
  for (const f of fields) info[f.key] = '';
  for (const f of fields) {
    const el = panel.querySelector(`[data-party="${prefix}"][data-party-key="${f.key}"]`);
    if (el) info[f.key] = el.value.trim();
  }
  return info;
}

function isPartyInfoWideField(field) {
  return !!(field.wide || field.key === 'email' || field.key === 'address');
}

function partyInfoLines(fields, info) {
  return fields
    .map(f => ({
      label: f.label,
      value: info[f.key] || '',
      wide: isPartyInfoWideField(f),
    }))
    .filter(row => row.value);
}
