/* Modes de congés — catalogue et thèmes planning */
'use strict';

const CONGE_COLOR_THEMES = [
  { id: 'conge-cp', label: 'Orange CP', bg: '#e89846', border: '#d97a28' },
  { id: 'conge-rtt', label: 'Bleu RTT', bg: '#7fb8d4', border: '#5a9fbe' },
  { id: 'conge-mal', label: 'Rouge maladie', bg: '#c8523f', border: '#a33d2e' },
  { id: 'conge-form', label: 'Violet formation', bg: '#9b6fb0', border: '#7b1fa2' },
  { id: 'conge-sso', label: 'Gris sans solde', bg: '#4a4a4a', border: '#333333' },
  { id: 'conge-rec', label: 'Jaune récup', bg: '#e8d05a', border: '#c9b030' },
  { id: 'conge-green-light', label: 'Vert clair', bg: '#e8f5e9', border: '#81c784' },
  { id: 'conge-green', label: 'Vert', bg: '#c8e6c9', border: '#2e7d32' },
  { id: 'conge-blue-light', label: 'Bleu clair', bg: '#e3f2fd', border: '#1976d2' },
  { id: 'conge-teal', label: 'Sarcelle', bg: '#e0f7fa', border: '#00838f' },
  { id: 'conge-pink', label: 'Rose', bg: '#fce4ec', border: '#c2185b' },
  { id: 'conge-amber', label: 'Ambre', bg: '#fff8e1', border: '#ff8f00' },
  { id: 'conge-gray', label: 'Gris clair', bg: '#eceff1', border: '#546e7a' },
  { id: 'conge-brown', label: 'Brun', bg: '#efebe9', border: '#6d4c41' },
];

const DEFAULT_CONGE_TYPE_CATALOG = [
  { id: 'cp', label: 'CP', themeId: 'conge-cp' },
  { id: 'rtt', label: 'RTT', themeId: 'conge-rtt' },
  { id: 'maladie', label: 'Maladie', themeId: 'conge-mal' },
  { id: 'formation', label: 'Formation', themeId: 'conge-form' },
  { id: 'sans-solde', label: 'Sans solde', themeId: 'conge-sso' },
  { id: 'recuperation', label: 'Récupération', themeId: 'conge-rec' },
];

const CONGE_LEGACY_CSS_CLASS = {
  CP: 'cp',
  RTT: 'rtt',
  Maladie: 'mal',
  Formation: 'form',
  'Sans solde': 'sso',
  'Récupération': 'rec',
};

const CONGE_LEGACY_CSS_VARS = {
  cp: '--cp',
  rtt: '--rtt',
  maladie: '--mal',
  formation: '--form',
  'sans-solde': '--sso',
  recuperation: '--rec',
};

function cloneDefaultCongeTypeCatalog() {
  return DEFAULT_CONGE_TYPE_CATALOG.map(t => ({ ...t }));
}

function makeCongeTypeId() {
  return `cgtype_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function congeCssSafeId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getCongeThemeById(themeId) {
  return CONGE_COLOR_THEMES.find(t => t.id === themeId) || CONGE_COLOR_THEMES[0];
}

function getCongeEntryColors(entry) {
  const theme = getCongeThemeById(entry.themeId);
  return { bg: theme.bg, border: theme.border };
}

function getDefaultCongeThemeIdForIndex(idx) {
  return CONGE_COLOR_THEMES[idx % CONGE_COLOR_THEMES.length].id;
}

function getDefaultCongeThemeIdForTypeId(typeId) {
  const def = DEFAULT_CONGE_TYPE_CATALOG.find(t => t.id === typeId);
  if (def?.themeId) return def.themeId;
  const idx = Math.abs(String(typeId).split('').reduce((a, c) => a + c.charCodeAt(0), 0))
    % CONGE_COLOR_THEMES.length;
  return CONGE_COLOR_THEMES[idx].id;
}

function normalizeCongeCatalogEntry(raw, idx, seenIds) {
  const defById = DEFAULT_CONGE_TYPE_CATALOG.find(d => d.id === raw.id);
  const defByLabel = DEFAULT_CONGE_TYPE_CATALOG.find(d => d.label === raw.label);
  const def = defById || defByLabel;
  let id = raw.id || def?.id || makeCongeTypeId();
  id = congeCssSafeId(id);
  while (seenIds.has(id)) id = makeCongeTypeId();
  seenIds.add(id);
  const label = String(raw.label || def?.label || `Congé ${idx + 1}`).trim();
  let themeId = raw.themeId;
  if (!themeId || !CONGE_COLOR_THEMES.some(t => t.id === themeId)) {
    themeId = def?.themeId || getDefaultCongeThemeIdForIndex(idx);
  }
  return { id, label, themeId };
}

function getCongeTypeCatalog(state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { congeTypeCatalog: [] };
  return state.congeTypeCatalog || [];
}

function getCongeTypeDefById(id, state) {
  if (!id) return null;
  return getCongeTypeCatalog(state).find(t => t.id === id) || null;
}

function getCongeTypeDefByLabel(label, state) {
  if (!label) return null;
  const l = String(label).trim();
  return getCongeTypeCatalog(state).find(t => t.label === l) || null;
}

function isCongeTypeLabel(label, state) {
  return !!getCongeTypeDefByLabel(label, state);
}

function getCongeTypeLabels(state) {
  return getCongeTypeCatalog(state).map(t => t.label);
}

function getPlanningFilterTypes(state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : null;
  return ['work', 'rest', 'empty', ...getCongeTypeLabels(state)];
}

function congeTypeCssClass(typeId) {
  return `conge-type-${congeCssSafeId(typeId)}`;
}

function congeTypeCssClassForLabel(label, state) {
  const entry = getCongeTypeDefByLabel(label, state);
  if (entry) return congeTypeCssClass(entry.id);
  const legacy = CONGE_LEGACY_CSS_CLASS[label];
  return legacy || 'empty';
}

function congeTypeBadgeClass(label, state) {
  const entry = getCongeTypeDefByLabel(label, state);
  if (entry) return `conge-type-badge ${congeTypeCssClass(entry.id)}`;
  const legacy = CONGE_LEGACY_CSS_CLASS[label];
  if (legacy) return `type-${label.replace(/\s+/g, '-')}`;
  return 'conge-type-badge conge-type-unknown';
}

function ensureCongeTypeCatalog(state) {
  if (!state) state = typeof STATE !== 'undefined' ? STATE : { congeTypeCatalog: [] };
  if (!state.congeTypeCatalog || !state.congeTypeCatalog.length) {
    state.congeTypeCatalog = cloneDefaultCongeTypeCatalog();
  }
  const seenIds = new Set();
  state.congeTypeCatalog = state.congeTypeCatalog
    .map((raw, idx) => normalizeCongeCatalogEntry(raw || {}, idx, seenIds))
    .filter(t => t.label);

  for (const c of state.conges || []) {
    if (!c.type) continue;
    if (!getCongeTypeDefByLabel(c.type, state)) {
      state.congeTypeCatalog.push({
        id: makeCongeTypeId(),
        label: String(c.type).trim(),
        themeId: getDefaultCongeThemeIdForIndex(state.congeTypeCatalog.length),
      });
    }
  }

  if (!state.congeTypeCatalog.length) {
    state.congeTypeCatalog = cloneDefaultCongeTypeCatalog();
  }

  if (state.ui) {
    if (!state.ui.filterTypes) state.ui.filterTypes = getPlanningFilterTypes(state);
    for (const label of getCongeTypeLabels(state)) {
      if (!state.ui.filterTypes.includes(label)) state.ui.filterTypes.push(label);
    }
    state.ui.filterTypes = state.ui.filterTypes.filter(t =>
      t === 'work' || t === 'rest' || t === 'empty' || isCongeTypeLabel(t, state)
    );
  }
}

function validateCongeTypeLabel(label, excludeId, state) {
  const l = String(label || '').trim().replace(/\s+/g, ' ');
  if (!l) return 'Le libellé ne peut pas être vide.';
  if (l.length < 2) return 'Le libellé doit comporter au moins 2 caractères.';
  if (getCongeTypeCatalog(state).some(t => t.id !== excludeId && t.label === l)) {
    return `Un mode « ${l} » existe déjà.`;
  }
  return null;
}

function addCongeTypeCatalogEntry(label, themeId, state) {
  if (!state) state = STATE;
  ensureCongeTypeCatalog(state);
  const cleanLabel = String(label || '').trim().replace(/\s+/g, ' ');
  const err = validateCongeTypeLabel(cleanLabel, null, state);
  if (err) return { ok: false, error: err };
  const entry = {
    id: makeCongeTypeId(),
    label: cleanLabel,
    themeId: getCongeThemeById(themeId)?.id || getDefaultCongeThemeIdForIndex(state.congeTypeCatalog.length),
  };
  state.congeTypeCatalog.push(entry);
  if (state.ui && !state.ui.filterTypes.includes(entry.label)) {
    state.ui.filterTypes.push(entry.label);
  }
  return { ok: true, entry };
}

function updateCongeTypeCatalogEntry(id, updates, state) {
  if (!state) state = STATE;
  const entry = getCongeTypeDefById(id, state);
  if (!entry) return { ok: false, error: 'Mode introuvable.' };
  const oldLabel = entry.label;
  if (updates.label != null) {
    const cleanLabel = String(updates.label).trim().replace(/\s+/g, ' ');
    const err = validateCongeTypeLabel(cleanLabel, id, state);
    if (err) return { ok: false, error: err };
    if (cleanLabel !== oldLabel) {
      for (const c of state.conges || []) {
        if (c.type === oldLabel) c.type = cleanLabel;
      }
      if (state.ui?.filterTypes) {
        state.ui.filterTypes = state.ui.filterTypes.map(t => (t === oldLabel ? cleanLabel : t));
      }
    }
    entry.label = cleanLabel;
  }
  if (updates.themeId != null) {
    if (!getCongeThemeById(updates.themeId)) return { ok: false, error: 'Thème inconnu.' };
    entry.themeId = updates.themeId;
  }
  return { ok: true, entry };
}

function countCongesWithTypeLabel(label, state) {
  if (!state) state = STATE;
  return (state.conges || []).filter(c => c.type === label).length;
}

function removeCongeTypeCatalogEntry(id, state) {
  if (!state) state = STATE;
  ensureCongeTypeCatalog(state);
  if (state.congeTypeCatalog.length <= 1) {
    return { ok: false, error: 'Impossible de supprimer le dernier mode de congé.' };
  }
  const entry = getCongeTypeDefById(id, state);
  if (!entry) return { ok: false, error: 'Mode introuvable.' };
  if (countCongesWithTypeLabel(entry.label, state) > 0) {
    return { ok: false, error: 'Ce mode est utilisé par des congés enregistrés.' };
  }
  state.congeTypeCatalog = state.congeTypeCatalog.filter(t => t.id !== id);
  if (state.ui?.filterTypes) {
    state.ui.filterTypes = state.ui.filterTypes.filter(t => t !== entry.label);
  }
  return { ok: true };
}

function resetCongeTypeTheme(typeId, state) {
  if (!state) state = STATE;
  const entry = getCongeTypeDefById(typeId, state);
  if (!entry) return;
  entry.themeId = getDefaultCongeThemeIdForTypeId(entry.id);
}

function resetAllCongeTypeThemes(state) {
  if (!state) state = STATE;
  ensureCongeTypeCatalog(state);
  for (const entry of state.congeTypeCatalog) {
    entry.themeId = getDefaultCongeThemeIdForTypeId(entry.id);
  }
}

function applyCongeTypeColorStyles(state) {
  if (typeof document === 'undefined') return;
  if (!state) state = typeof STATE !== 'undefined' ? STATE : null;
  if (!state) return;
  ensureCongeTypeCatalog(state);
  const root = document.documentElement;
  const rules = [];
  for (const entry of state.congeTypeCatalog) {
    const cls = congeTypeCssClass(entry.id);
    const colors = getCongeEntryColors(entry);
    root.style.setProperty(`--conge-type-${entry.id}-bg`, colors.bg);
    const legacyVar = CONGE_LEGACY_CSS_VARS[entry.id];
    if (legacyVar) root.style.setProperty(legacyVar, colors.bg);

    rules.push(`
      .cell.vide.${cls}, .pcell.vide.${cls},
      table.planning tbody td.week-even.vide.${cls},
      table.planning tbody td.week-odd.vide.${cls},
      .month-cell .badge.vide.${cls}, .hm-${cls.replace('conge-type-', '')},
      .conge-type-badge.${cls}, .type-badge.${cls} {
        background: var(--conge-type-${entry.id}-bg) !important;
        background-color: var(--conge-type-${entry.id}-bg) !important;
      }
      .print-legend .lg.${cls} { background: var(--conge-type-${entry.id}-bg); }`);
  }
  let el = document.getElementById('conge-type-dynamic-styles');
  if (!el) {
    el = document.createElement('style');
    el.id = 'conge-type-dynamic-styles';
    document.head.appendChild(el);
  }
  el.textContent = rules.join('\n');
}

function getCongeTypeColor(label, state) {
  const entry = getCongeTypeDefByLabel(label, state);
  if (!entry) return null;
  return getCongeEntryColors(entry).bg;
}
