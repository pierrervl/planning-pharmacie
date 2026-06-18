/* Synchronisation cloud Supabase — planning partagé et données personnelles */
'use strict';

let syncTimer = null;
let syncInFlight = false;
let lastCloudUpdatedAt = null;

const SYNC_DEBOUNCE_MS = 1500;

function setSyncStatus(text, kind = '') {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync-status' + (kind ? ` sync-${kind}` : '');
}

function stateForCloudExport(state) {
  const copy = JSON.parse(JSON.stringify(state));
  /* Préférences UI restent locales par appareil */
  delete copy.ui;
  return copy;
}

function mergeCloudStateIntoLocal(cloudData) {
  if (!cloudData || typeof cloudData !== 'object') return false;
  const localUi = STATE.ui;
  suppressDirtyTracking = true;
  STATE = cloudData;
  migrateState(STATE);
  STATE.ui = { ...buildDefaultState().ui, ...localUi, ...(cloudData.ui || {}) };
  migrateState(STATE);
  suppressDirtyTracking = false;
  return true;
}

function mergePersonalDataIntoState(personalData, employeeName) {
  if (!personalData || !employeeName || typeof personalData !== 'object') return;
  if (personalData.employeeInfo?.[employeeName]) {
    if (!STATE.employeeInfo) STATE.employeeInfo = {};
    STATE.employeeInfo[employeeName] = {
      ...STATE.employeeInfo[employeeName],
      ...personalData.employeeInfo[employeeName],
    };
  }
  if (personalData.contractDays?.[employeeName]) {
    if (!STATE.contractDays) STATE.contractDays = {};
    STATE.contractDays[employeeName] = personalData.contractDays[employeeName];
  }
  if (personalData.contractDescriptions?.[employeeName] != null) {
    if (!STATE.contractDescriptions) STATE.contractDescriptions = {};
    STATE.contractDescriptions[employeeName] = personalData.contractDescriptions[employeeName];
  }
  if (personalData.cdiWeeks?.[employeeName]) {
    if (!STATE.cdiWeeks) STATE.cdiWeeks = {};
    STATE.cdiWeeks[employeeName] = personalData.cdiWeeks[employeeName];
  }
  if (personalData.cdiDescriptions?.[employeeName] != null) {
    if (!STATE.cdiDescriptions) STATE.cdiDescriptions = {};
    STATE.cdiDescriptions[employeeName] = personalData.cdiDescriptions[employeeName];
  }
}

function extractPersonalDataFromState(employeeName) {
  if (!employeeName) return {};
  return {
    employeeInfo: { [employeeName]: (STATE.employeeInfo || {})[employeeName] || {} },
    contractDays: { [employeeName]: (STATE.contractDays || {})[employeeName] || [] },
    contractDescriptions: { [employeeName]: (STATE.contractDescriptions || {})[employeeName] || '' },
    cdiWeeks: { [employeeName]: (STATE.cdiWeeks || {})[employeeName] || [] },
    cdiDescriptions: { [employeeName]: (STATE.cdiDescriptions || {})[employeeName] || '' },
  };
}

async function loadPlanningFromCloud() {
  if (!isSupabaseConfigured() || !isAuthenticated()) return null;
  setSyncStatus('Chargement…', 'pending');

  const { data, error } = await AUTH.client
    .from('pharmacy_planning')
    .select('data, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    setSyncStatus('Erreur chargement', 'error');
    throw error;
  }

  lastCloudUpdatedAt = data?.updated_at || null;

  if (data?.data && Object.keys(data.data).length > 0) {
    mergeCloudStateIntoLocal(data.data);
    setSyncStatus('Synchronisé', 'ok');
    return data;
  }

  /* Cloud vide : pousser l'état local si admin */
  if (isAdmin()) {
    await pushPlanningToCloud();
    setSyncStatus('Envoi initial', 'ok');
  } else {
    setSyncStatus('Planning non initialisé', 'warn');
  }
  return data;
}

async function loadPersonalDataFromCloud() {
  if (!isEmployee() || !AUTH.profile) return;
  const empName = getLinkedEmployeeName();
  const personal = AUTH.profile.personal_data;
  if (personal && Object.keys(personal).length > 0) {
    mergePersonalDataIntoState(personal, empName);
  }
}

async function pushPlanningToCloud() {
  if (!AUTH.client || !isAdmin()) return;
  const payload = stateForCloudExport(STATE);
  const { error } = await AUTH.client
    .from('pharmacy_planning')
    .upsert({
      id: 1,
      data: payload,
      updated_by: AUTH.session.user.id,
    });
  if (error) throw error;
  lastCloudUpdatedAt = new Date().toISOString();
  setSyncStatus('Enregistré', 'ok');
}

async function pushPersonalDataToCloud() {
  if (!AUTH.client || !isEmployee()) return;
  const empName = getLinkedEmployeeName();
  if (!empName) return;
  const personal_data = extractPersonalDataFromState(empName);
  const { error } = await AUTH.client
    .from('profiles')
    .update({ personal_data })
    .eq('id', AUTH.session.user.id);
  if (error) throw error;
  if (AUTH.profile) AUTH.profile.personal_data = personal_data;
  setSyncStatus('Profil enregistré', 'ok');
}

async function performCloudSync() {
  if (!isSupabaseConfigured() || !isAuthenticated() || syncInFlight) return;
  syncInFlight = true;
  try {
    if (isAdmin()) {
      await pushPlanningToCloud();
    } else if (isEmployee()) {
      await pushPersonalDataToCloud();
    }
  } catch (e) {
    console.error('Sync cloud échouée', e);
    setSyncStatus('Erreur sync', 'error');
    toast('⚠ Synchronisation cloud échouée', true);
  } finally {
    syncInFlight = false;
  }
}

function scheduleCloudSync() {
  if (!isSupabaseConfigured() || !isAuthenticated()) return;
  if (isEmployee() && !getLinkedEmployeeName()) return;
  clearTimeout(syncTimer);
  setSyncStatus('En attente…', 'pending');
  syncTimer = setTimeout(() => void performCloudSync(), SYNC_DEBOUNCE_MS);
}

async function forceCloudSync() {
  clearTimeout(syncTimer);
  setSyncStatus('Synchronisation…', 'pending');
  await performCloudSync();
  toast('Synchronisation cloud terminée');
}

async function bootstrapCloudData() {
  if (!isSupabaseConfigured() || !isAuthenticated()) return;
  await loadPlanningFromCloud();
  await loadPersonalDataFromCloud();
  applyEmployeeViewRestrictions();
}
