/* Synchronisation cloud Supabase — planning partagé et données personnelles */
'use strict';

let syncTimer = null;
let syncInFlight = false;
let syncPending = false;
let lastCloudUpdatedAt = null;

const SYNC_DEBOUNCE_MS = 600;

function canSyncToCloud() {
  if (!isSupabaseConfigured() || !isAuthenticated()) return false;
  if (isAdmin()) return true;
  if (isStaff()) return true;
  return false;
}

function canPushPersonalToCloud() {
  return isStaff() && !!getLinkedEmployeeName();
}

function setSyncStatus(text, kind = '') {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync-status' + (kind ? ` sync-${kind}` : '');
}

function stateForCloudExport(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.ui;
  return copy;
}

function mergeRecordsById(baseList = [], patchList = [], idKey = 'id') {
  const map = new Map();
  for (const item of baseList) {
    if (item && item[idKey] != null) map.set(String(item[idKey]), item);
  }
  for (const item of patchList) {
    if (item && item[idKey] != null) map.set(String(item[idKey]), item);
  }
  return Array.from(map.values());
}

function collectStaffConges(state = STATE) {
  return (state.conges || []).filter(c => {
    if (typeof isTeamLeader === 'function' && isTeamLeader()) return true;
    if (typeof canRequestCongesFor === 'function') return canRequestCongesFor(c.emp);
    return false;
  });
}

function collectStaffPendingRequests(state = STATE) {
  return (state.planningChangeRequests || []).filter(r => {
    if (r.status !== 'pending') return false;
    if (typeof isTeamLeader === 'function' && isTeamLeader()) return true;
    if (typeof canRequestPlanningFor === 'function') return canRequestPlanningFor(r.emp);
    return false;
  });
}

function mergeCloudStateIntoLocal(cloudData, { staffMerge = false } = {}) {
  if (!cloudData || typeof cloudData !== 'object') return false;
  const localUi = STATE.ui;
  const localStaffConges = staffMerge ? collectStaffConges() : [];
  const localStaffRequests = staffMerge ? collectStaffPendingRequests() : [];

  suppressDirtyTracking = true;
  STATE = cloudData;
  migrateState(STATE);
  STATE.ui = { ...buildDefaultState().ui, ...localUi, ...(cloudData.ui || {}) };

  if (staffMerge) {
    STATE.conges = mergeRecordsById(STATE.conges || [], localStaffConges);
    STATE.planningChangeRequests = mergeRecordsById(
      STATE.planningChangeRequests || [],
      localStaffRequests
    );
  }

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
  if (!canSyncToCloud()) return null;
  setSyncStatus('Chargement…', 'pending');

  await ensureAuthClient();
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
  const staffMerge = isStaff() && !isAdmin();

  if (data?.data && Object.keys(data.data).length > 0) {
    mergeCloudStateIntoLocal(data.data, { staffMerge });
    setSyncStatus('Synchronisé', 'ok');
    return data;
  }

  if (isAdmin()) {
    await pushPlanningToCloud();
    setSyncStatus('Envoi initial', 'ok');
  } else {
    setSyncStatus('Planning non initialisé', 'warn');
  }
  return data;
}

async function loadPersonalDataFromCloud() {
  if (!isStaff() || !AUTH.profile) return;
  const empName = getLinkedEmployeeName();
  const personal = AUTH.profile.personal_data;
  if (personal && Object.keys(personal).length > 0) {
    mergePersonalDataIntoState(personal, empName);
  }
}

async function pushPlanningToCloud() {
  if (!isAdmin()) return;
  await ensureAuthClient();
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
  setSyncStatus('Enregistré cloud', 'ok');
}

async function pushStaffSharedChangesToCloud() {
  if (!isStaff() || isAdmin()) return;
  const congesPatch = collectStaffConges();
  const requestsPatch = collectStaffPendingRequests();
  if (!congesPatch.length && !requestsPatch.length) return;

  await ensureAuthClient();
  const { error } = await AUTH.client.rpc('merge_staff_planning_shared', {
    conges_patch: congesPatch,
    planning_change_requests_patch: requestsPatch,
  });
  if (error) throw error;
  setSyncStatus('Demandes envoyées', 'ok');
}

async function pushPersonalDataToCloud() {
  if (!canPushPersonalToCloud()) return;
  const empName = getLinkedEmployeeName();
  if (!empName) return;
  await ensureAuthClient();
  const personal_data = extractPersonalDataFromState(empName);
  const { error } = await AUTH.client
    .from('profiles')
    .update({ personal_data })
    .eq('id', AUTH.session.user.id);
  if (error) throw error;
  if (AUTH.profile) AUTH.profile.personal_data = personal_data;
  setSyncStatus('Profil enregistré', 'ok');
}

async function syncStaffWithCloud() {
  await loadPlanningFromCloud();
  await pushStaffSharedChangesToCloud();
  await pushPersonalDataToCloud();
  if (typeof saveState === 'function') saveState();
  if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
  if (typeof render === 'function') render();
}

async function performCloudSync() {
  if (!canSyncToCloud()) return;
  if (syncInFlight) {
    syncPending = true;
    return;
  }

  syncInFlight = true;
  setSyncStatus('Enregistrement…', 'pending');
  try {
    if (isAdmin()) {
      await pushPlanningToCloud();
    } else if (isStaff()) {
      await syncStaffWithCloud();
    }
  } catch (e) {
    console.error('Sync cloud échouée', e);
    setSyncStatus('Erreur sync', 'error');
    if (typeof toast === 'function') toast('Synchronisation cloud échouée', true);
    throw e;
  } finally {
    syncInFlight = false;
    if (syncPending) {
      syncPending = false;
      void performCloudSync();
    }
  }
}

function scheduleCloudSync() {
  if (!canSyncToCloud()) return;
  clearTimeout(syncTimer);
  setSyncStatus('Modification…', 'pending');
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void performCloudSync();
  }, SYNC_DEBOUNCE_MS);
}

async function flushCloudSync() {
  if (!canSyncToCloud()) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  await performCloudSync();
}

async function forceCloudSync() {
  clearTimeout(syncTimer);
  syncTimer = null;
  syncPending = false;
  setSyncStatus('Synchronisation…', 'pending');
  try {
    if (isStaff() && !isAdmin()) {
      await syncStaffWithCloud();
    } else {
      await performCloudSync();
    }
    if (typeof markCloudSynced === 'function') markCloudSynced();
    if (typeof toast === 'function') {
      toast(isStaff() && !isAdmin()
        ? 'Synchronisation terminée (planning + vos demandes)'
        : 'Synchronisation cloud terminée');
    }
  } catch (e) {
    console.error('Sync cloud échouée', e);
    setSyncStatus('Erreur sync', 'error');
    if (typeof toast === 'function') toast('Synchronisation cloud échouée', true);
    throw e;
  }
}

function setupCloudAutoSave() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushCloudSync();
  });
  window.addEventListener('pagehide', () => { void flushCloudSync(); });
}

async function bootstrapCloudData() {
  if (!isAuthenticated()) return;
  await loadPlanningFromCloud();
  await loadPersonalDataFromCloud();
  if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
}

async function syncAfterAuth() {
  if (!isAuthenticated()) return;
  try {
    await bootstrapCloudData();
    if (typeof saveState === 'function') saveState();
    if (isAdmin()) {
      await performCloudSync();
    } else if (isStaff()) {
      await pushStaffSharedChangesToCloud();
      await pushPersonalDataToCloud();
    }
    if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
    if (typeof render === 'function') render();
    if (typeof markCloudSynced === 'function') markCloudSynced();
  } catch (e) {
    console.error('Sync post-connexion échouée', e);
  }
}
