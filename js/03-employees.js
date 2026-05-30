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
