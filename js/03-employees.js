/* Types de salariés — métadonnées équipe */
'use strict';

const EMPLOYEE_TYPES = [
  'Pharmacien étudiant',
  'Pharmacien salarié',
  'Pharmacien remplaçant',
  'Préparateur étudiant',
  'Préparateur salarié',
];

const EMPLOYEE_TYPE_LEGACY_MAP = {
  Pharmacien:  'Pharmacien salarié',
  Préparateur: 'Préparateur salarié',
  Étudiant:    'Pharmacien étudiant',
  Salarié:     'Pharmacien salarié',
};

const EMPLOYEE_TYPE_STYLES = {
  'Pharmacien étudiant':   { slug: 'pharm-etudiant',  bg: '#e8f5e9', border: '#81c784', group: 'Pharmacien' },
  'Pharmacien salarié':    { slug: 'pharm-salarie',   bg: '#c8e6c9', border: '#2e7d32', group: 'Pharmacien' },
  'Pharmacien remplaçant': { slug: 'pharm-remplacant', bg: '#dcedc8', border: '#689f38', group: 'Pharmacien' },
  'Préparateur étudiant':  { slug: 'prep-etudiant',   bg: '#f3e5f5', border: '#ce93d8', group: 'Préparateur' },
  'Préparateur salarié':   { slug: 'prep-salarie',    bg: '#e1bee7', border: '#7b1fa2', group: 'Préparateur' },
};

const EMPLOYEE_TYPE_DEFAULT = 'Pharmacien salarié';

function normalizeEmployeeType(type) {
  if (EMPLOYEE_TYPES.includes(type)) return type;
  if (type && EMPLOYEE_TYPE_LEGACY_MAP[type]) return EMPLOYEE_TYPE_LEGACY_MAP[type];
  return EMPLOYEE_TYPE_DEFAULT;
}

function getEmployeeType(emp) {
  return normalizeEmployeeType((STATE.employeeTypes || {})[emp]);
}

function setEmployeeType(emp, type) {
  if (!STATE.employeeTypes) STATE.employeeTypes = {};
  STATE.employeeTypes[emp] = normalizeEmployeeType(type);
}

function employeeTypeClass(emp) {
  const style = EMPLOYEE_TYPE_STYLES[getEmployeeType(emp)];
  return style ? `emp-type-${style.slug}` : 'emp-type-pharm-salarie';
}

function employeeTypeSelectClass(type) {
  const style = EMPLOYEE_TYPE_STYLES[normalizeEmployeeType(type)];
  return style ? `emp-type-${style.slug}` : 'emp-type-pharm-salarie';
}

function renderEmployeeTypeOptions(selectedType) {
  const selected = normalizeEmployeeType(selectedType);
  return EMPLOYEE_TYPES.map(t => {
    const s = EMPLOYEE_TYPE_STYLES[t];
    const sel = t === selected ? ' selected' : '';
    return `<option value="${t}"${sel} style="background-color:${s.bg};color:#1a1a1a;">${t}</option>`;
  }).join('');
}

function syncEmployeeTypeSelectStyle(selectEl) {
  if (!selectEl) return;
  selectEl.className = `emp-type-select ${employeeTypeSelectClass(selectEl.value)}`;
}

function syncEmployeeListRowColors(row, type) {
  if (!row) return;
  const slugClass = employeeTypeSelectClass(type);
  const nameCell = row.querySelector('.emp-name-cell');
  [nameCell].forEach(el => {
    if (!el) return;
    [...el.classList].filter(c => c.startsWith('emp-type-')).forEach(c => el.classList.remove(c));
    el.classList.add(slugClass);
  });
}

function ensureEmployeeTypes(state = STATE) {
  if (!state.employeeTypes) state.employeeTypes = {};
  for (const emp of state.employees || []) {
    state.employeeTypes[emp] = normalizeEmployeeType(state.employeeTypes[emp]);
  }
  for (const name of Object.keys(state.employeeTypes)) {
    if (!(state.employees || []).includes(name)) {
      delete state.employeeTypes[name];
    }
  }
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

function partyInfoLines(fields, info) {
  return fields
    .map(f => ({ label: f.label, value: info[f.key] || '' }))
    .filter(row => row.value);
}
