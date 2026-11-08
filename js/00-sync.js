/* Synchronisation cloud Supabase — planning partagé et données personnelles */
'use strict';

let syncTimer = null;
let syncInFlight = false;
let syncPending = false;
let lastCloudUpdatedAt = null;

const SYNC_DEBOUNCE_MS = 4000;
const SYNC_POLL_MS = 45000;

let syncPollTimer = null;

function canSyncToCloud() {
  if (!isSupabaseConfigured() || !isAuthenticated()) return false;
  if (!getCurrentPharmacyId()) return false;
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

/* Données personnelles des salariés : jamais dans le planning partagé (lisible par
   tous les membres), mais dans la table pharmacy_private réservée aux administrateurs.
   Même liste que public.private_planning_keys() côté Supabase. */
const PRIVATE_STATE_KEYS = ['employeeInfo', 'contractDays', 'contractDescriptions', 'cdiDescriptions'];

/* null = pas encore vérifié ; false = migration de sécurité non appliquée */
let privateTableAvailable = null;

function stateForCloudExport(state, { includePrivate = false } = {}) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.ui;
  if (!includePrivate) {
    for (const k of PRIVATE_STATE_KEYS) delete copy[k];
  }
  return copy;
}

function privateStateForCloud(state = STATE) {
  const out = {};
  for (const k of PRIVATE_STATE_KEYS) {
    if (state[k] !== undefined) out[k] = JSON.parse(JSON.stringify(state[k]));
  }
  return out;
}

function isMissingTableError(err) {
  const msg = String(err?.message || err?.details || err || '');
  return err?.code === '42P01' || err?.code === 'PGRST205' || /pharmacy_private/.test(msg) && /exist|schema cache|find/i.test(msg);
}

/* Charge les données personnelles (administrateurs) ; renvoie true si l'état a changé */
async function loadPrivateFromCloud() {
  if (!isAdmin() || !getCurrentPharmacyId()) return false;
  await ensureAuthClient();
  const { data, error } = await AUTH.client
    .from('pharmacy_private')
    .select('data')
    .eq('pharmacy_id', getCurrentPharmacyId())
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      privateTableAvailable = false;
      return false;
    }
    throw error;
  }
  privateTableAvailable = true;
  if (!data?.data) return false;
  let changed = false;
  suppressDirtyTracking = true;
  for (const k of PRIVATE_STATE_KEYS) {
    if (data.data[k] === undefined) continue;
    if (JSON.stringify(STATE[k]) !== JSON.stringify(data.data[k])) {
      STATE[k] = data.data[k];
      changed = true;
    }
  }
  if (changed) migrateState(STATE);
  suppressDirtyTracking = false;
  return changed;
}

async function pushPrivateToCloud() {
  if (!isAdmin() || privateTableAvailable === false) return false;
  const { error } = await AUTH.client
    .from('pharmacy_private')
    .upsert({
      pharmacy_id: getCurrentPharmacyId(),
      data: privateStateForCloud(STATE),
      updated_by: AUTH.session.user.id,
    });
  if (error) {
    if (isMissingTableError(error)) {
      privateTableAvailable = false;
      return false;
    }
    throw error;
  }
  privateTableAvailable = true;
  return true;
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
  const localUi = { ...STATE.ui };
  const localStaffConges = staffMerge ? collectStaffConges() : [];
  const localStaffRequests = staffMerge ? collectStaffPendingRequests() : [];

  suppressDirtyTracking = true;
  const cloudCopy = JSON.parse(JSON.stringify(cloudData));
  delete cloudCopy.ui;
  const keepPrivate = typeof isAdmin === 'function' && isAdmin();
  const localPrivate = privateStateForCloud(STATE);
  const ownName = !keepPrivate && typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;
  for (const k of PRIVATE_STATE_KEYS) {
    if (keepPrivate) {
      if (cloudCopy[k] === undefined && localPrivate[k] !== undefined) cloudCopy[k] = localPrivate[k];
      continue;
    }
    /* Salarié : uniquement ses propres données, jamais celles des collègues */
    const own = {};
    const local = localPrivate[k] && typeof localPrivate[k] === 'object' ? localPrivate[k] : {};
    for (const name of Object.keys(local)) {
      if (ownName && employeeNamesMatch(name, ownName)) own[name] = local[name];
    }
    cloudCopy[k] = own;
  }
  STATE = cloudCopy;
  migrateState(STATE);
  /* L'UI (onglet actif, filtres locaux…) reste toujours celle du navigateur */
  STATE.ui = { ...buildDefaultState().ui, ...localUi };

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

function mergeEmployeeSharedFromCloud(cloudData, state = STATE) {
  if (!cloudData || typeof cloudData !== 'object') return false;
  let changed = false;
  if (Array.isArray(cloudData.conges)) {
    const merged = mergeRecordsById(state.conges || [], cloudData.conges);
    if (JSON.stringify(merged) !== JSON.stringify(state.conges || [])) {
      state.conges = merged;
      changed = true;
    }
  }
  if (Array.isArray(cloudData.planningChangeRequests)) {
    const merged = mergeRecordsById(
      state.planningChangeRequests || [],
      cloudData.planningChangeRequests
    );
    if (JSON.stringify(merged) !== JSON.stringify(state.planningChangeRequests || [])) {
      state.planningChangeRequests = merged;
      changed = true;
    }
  }
  return changed;
}

async function fetchPlanningRowFromCloud() {
  if (!canSyncToCloud()) return null;
  const pharmacyId = getCurrentPharmacyId();
  await ensureAuthClient();
  const { data, error } = await AUTH.client
    .from('pharmacy_planning')
    .select('data, updated_at')
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadPlanningFromCloud() {
  if (!canSyncToCloud()) return null;
  setSyncStatus('Chargement…', 'pending');

  const data = await fetchPlanningRowFromCloud();
  if (!data) return null;

  lastCloudUpdatedAt = data.updated_at || null;
  const staffMerge = isStaff() && !isAdmin();

  if (data.data && Object.keys(data.data).length > 0) {
    mergeCloudStateIntoLocal(data.data, { staffMerge });
    if (isAdmin()) await loadPrivateFromCloud();
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
  /* Ancien cache : retire les données personnelles des collègues */
  if (!isAdmin()) {
    for (const k of PRIVATE_STATE_KEYS) {
      if (!STATE[k] || typeof STATE[k] !== 'object') continue;
      for (const name of Object.keys(STATE[k])) {
        if (!empName || !employeeNamesMatch(name, empName)) delete STATE[k][name];
      }
    }
  }
  const personal = AUTH.profile.personal_data;
  if (personal && Object.keys(personal).length > 0) {
    mergePersonalDataIntoState(personal, empName);
  }
}

async function pushPlanningToCloud() {
  if (!isAdmin()) return;
  if (typeof isAdminReadOnly === 'function' && isAdminReadOnly()) return;
  const pharmacyId = getCurrentPharmacyId();
  if (!pharmacyId) return;
  await ensureAuthClient();
  if (privateTableAvailable === null) await loadPrivateFromCloud().catch(() => {});
  /* Migration non appliquée : on garde l'ancien format pour ne rien perdre */
  const payload = stateForCloudExport(STATE, { includePrivate: privateTableAvailable === false });
  await pushPrivateToCloud();
  const { error } = await AUTH.client
    .from('pharmacy_planning')
    .upsert({
      pharmacy_id: pharmacyId,
      data: payload,
      updated_by: AUTH.session.user.id,
    });
  if (error) throw error;
  lastCloudUpdatedAt = new Date().toISOString();
  setSyncStatus(privateTableAvailable === false ? 'Enregistré (migration sécurité à appliquer)' : 'Enregistré cloud', privateTableAvailable === false ? 'warn' : 'ok');
}

function formatCloudSyncError(err) {
  const msg = String(err?.message || err?.details || err || '');
  const code = err?.code || '';
  if (code === 'PGRST202' || /merge_staff_planning_shared|PGRST202|Could not find the function/i.test(msg)) {
    return 'Envoi cloud indisponible — exécutez la migration SQL merge_staff_planning_shared dans Supabase (SQL Editor).';
  }
  if (/Non authentifié|JWT/i.test(msg)) return 'Session expirée — reconnectez-vous.';
  if (/Accès réservé au personnel/i.test(msg)) return msg;
  if (/profil.*salarié|employee_name/i.test(msg)) return msg;
  return msg || 'Erreur de synchronisation cloud';
}

function isMissingRpcError(err) {
  const msg = String(err?.message || err?.details || err || '');
  return err?.code === 'PGRST202'
    || /merge_staff_planning_shared|PGRST202|Could not find the function/i.test(msg);
}

async function pushStaffSharedChangesViaRpc(congesPatch, requestsPatch) {
  await ensureAuthClient();
  const { error } = await AUTH.client.rpc('merge_staff_planning_shared', {
    p_pharmacy_id: getCurrentPharmacyId(),
    conges_patch: congesPatch,
    planning_change_requests_patch: requestsPatch,
  });
  if (error) throw error;
}

async function pushStaffSharedChangesViaProfile() {
  if (!canPushPersonalToCloud()) {
    throw new Error('Votre compte n\'est pas lié à un salarié — impossible d\'envoyer vos demandes.');
  }
  const empName = getLinkedEmployeeName();
  const congesPatch = collectStaffConges();
  const requestsPatch = collectStaffPendingRequests();
  if (!congesPatch.length && !requestsPatch.length) return false;

  const personal_data = extractPersonalDataFromState(empName);
  personal_data.staffSharedPatch = {
    conges: congesPatch,
    planningChangeRequests: requestsPatch,
    pushedAt: new Date().toISOString(),
  };

  await ensureAuthClient();
  const { error } = await AUTH.client
    .from('profiles')
    .update({ personal_data })
    .eq('id', AUTH.session.user.id);
  if (error) throw error;
  if (AUTH.profile) AUTH.profile.personal_data = personal_data;
  return true;
}

async function mergeStaffPatchesFromProfiles() {
  if (!isAdmin()) return;
  const pharmacyId = getCurrentPharmacyId();
  if (!pharmacyId) return;
  await ensureAuthClient();

  const { data: members, error: membersErr } = await AUTH.client
    .from('pharmacy_members')
    .select('user_id, role, employee_name')
    .eq('pharmacy_id', pharmacyId);
  if (membersErr) throw membersErr;

  const userIds = (members || []).map(m => m.user_id);
  if (!userIds.length) return false;

  const { data: profiles, error } = await AUTH.client
    .from('profiles')
    .select('id, personal_data')
    .in('id', userIds);
  if (error) throw error;

  const memberByUser = new Map((members || []).map(m => [m.user_id, m]));
  let mergedAny = false;
  for (const profile of profiles || []) {
    const patch = profile.personal_data?.staffSharedPatch;
    if (!patch) continue;

    /* Un salarié ne peut déposer que ses propres congés / demandes (le chef d'équipe,
       ceux de tous), et une demande reste « en attente » sans écraser une demande traitée. */
    const member = memberByUser.get(profile.id) || {};
    const leader = member.role === 'team_leader';
    const ownsItem = (item) => leader || (member.employee_name && employeeNamesMatch(item?.emp, member.employee_name));
    const conges = (patch.conges || []).filter(c => {
      if (!c?.id || !ownsItem(c)) return false;
      const cur = (STATE.conges || []).find(x => x.id === c.id);
      return !cur || ownsItem(cur);
    });
    const requests = (patch.planningChangeRequests || []).filter(r => {
      if (!r?.id || !ownsItem(r)) return false;
      const cur = (STATE.planningChangeRequests || []).find(x => x.id === r.id);
      return !cur || cur.status === 'pending';
    }).map(r => ({ ...r, status: 'pending' }));

    if (conges.length) {
      STATE.conges = mergeRecordsById(STATE.conges || [], conges);
      mergedAny = true;
    }
    if (requests.length) {
      STATE.planningChangeRequests = mergeRecordsById(
        STATE.planningChangeRequests || [],
        requests
      );
      mergedAny = true;
    }

    const nextPersonal = { ...(profile.personal_data || {}) };
    delete nextPersonal.staffSharedPatch;
    const { error: clearErr } = await AUTH.client
      .from('profiles')
      .update({ personal_data: nextPersonal })
      .eq('id', profile.id);
    if (clearErr) throw clearErr;
  }

  if (mergedAny) migrateState(STATE);
  return mergedAny;
}

async function clearStaffSharedPatchFromProfile() {
  if (!canPushPersonalToCloud() || !AUTH.profile?.personal_data?.staffSharedPatch) return;
  const personal_data = { ...AUTH.profile.personal_data };
  delete personal_data.staffSharedPatch;
  await ensureAuthClient();
  const { error } = await AUTH.client
    .from('profiles')
    .update({ personal_data })
    .eq('id', AUTH.session.user.id);
  if (error) throw error;
  AUTH.profile.personal_data = personal_data;
}

async function pushStaffSharedChangesToCloud() {
  if (!isStaff() || isAdmin()) return;
  const congesPatch = collectStaffConges();
  const requestsPatch = collectStaffPendingRequests();
  if (!congesPatch.length && !requestsPatch.length) return;

  try {
    await pushStaffSharedChangesViaRpc(congesPatch, requestsPatch);
    await clearStaffSharedPatchFromProfile();
    setSyncStatus('Demandes envoyées', 'ok');
  } catch (e) {
    if (isMissingRpcError(e)) {
      const sent = await pushStaffSharedChangesViaProfile();
      if (!sent) return;
      setSyncStatus('Demandes envoyées (via profil)', 'ok');
      return;
    }
    throw e;
  }
}

async function pushPersonalDataToCloud() {
  if (!canPushPersonalToCloud()) return;
  const empName = getLinkedEmployeeName();
  if (!empName) return;
  await ensureAuthClient();
  const personal_data = extractPersonalDataFromState(empName);
  const keptPatch = AUTH.profile?.personal_data?.staffSharedPatch;
  if (keptPatch) personal_data.staffSharedPatch = keptPatch;
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
      await syncAdminWithCloud();
    } else if (isStaff()) {
      await syncStaffWithCloud();
    }
    if (typeof markCloudSynced === 'function') markCloudSynced();
  } catch (e) {
    console.error('Sync cloud échouée', e);
    setSyncStatus('Erreur sync', 'error');
    if (typeof toast === 'function') toast(formatCloudSyncError(e), true);
    throw e;
  } finally {
    syncInFlight = false;
    if (syncPending) {
      syncPending = false;
      void performCloudSync();
    }
  }
}

async function syncAdminWithCloud() {
  const row = await fetchPlanningRowFromCloud();
  if (row?.updated_at) lastCloudUpdatedAt = row.updated_at;

  const mergedProfiles = await mergeStaffPatchesFromProfiles();

  let mergedShared = false;
  if (row?.data) {
    suppressDirtyTracking = true;
    mergedShared = mergeEmployeeSharedFromCloud(row.data);
    if (mergedShared) migrateState(STATE);
    suppressDirtyTracking = false;
  }

  if ((mergedProfiles || mergedShared) && typeof saveState === 'function') saveState();
  if (typeof isAdminReadOnly === 'function' && isAdminReadOnly()) {
    setSyncStatus('À jour (consultation)', 'ok');
  } else {
    await pushPlanningToCloud();
  }
  if (typeof render === 'function') render();
}

async function pullCloudUpdatesOnly() {
  if (!canSyncToCloud() || syncInFlight || syncTimer) return;
  if (isAdmin() && typeof sessionNeedsCloudSync !== 'undefined' && sessionNeedsCloudSync) return;

  syncInFlight = true;
  try {
    if (isAdmin()) {
      const row = await fetchPlanningRowFromCloud();
      if (!row?.updated_at || row.updated_at === lastCloudUpdatedAt) return;

      lastCloudUpdatedAt = row.updated_at;
      const mergedProfiles = await mergeStaffPatchesFromProfiles();
      const mergedPrivate = await loadPrivateFromCloud().catch(() => false);
      let mergedShared = false;
      if (row.data) {
        suppressDirtyTracking = true;
        mergedShared = mergeEmployeeSharedFromCloud(row.data);
        if (mergedShared) migrateState(STATE);
        suppressDirtyTracking = false;
      }
      if (mergedProfiles || mergedShared || mergedPrivate) {
        if (typeof saveState === 'function') saveState();
        if (typeof render === 'function') render();
        setSyncStatus('Mise à jour équipe', 'ok');
      }
    } else if (isStaff()) {
      const row = await fetchPlanningRowFromCloud();
      if (!row?.updated_at || row.updated_at === lastCloudUpdatedAt) return;

      lastCloudUpdatedAt = row.updated_at;
      if (row.data && Object.keys(row.data).length > 0) {
        suppressDirtyTracking = true;
        mergeCloudStateIntoLocal(row.data, { staffMerge: true });
        suppressDirtyTracking = false;
        if (typeof saveState === 'function') saveState();
        if (typeof render === 'function') render();
        setSyncStatus('Planning à jour', 'ok');
      }
    }
  } catch (e) {
    console.warn('Pull cloud échoué', e);
  } finally {
    syncInFlight = false;
  }
}

function startCloudSyncPoll() {
  stopCloudSyncPoll();
  if (!canSyncToCloud()) return;
  syncPollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void pullCloudUpdatesOnly();
  }, SYNC_POLL_MS);
}

function stopCloudSyncPoll() {
  if (syncPollTimer) {
    clearInterval(syncPollTimer);
    syncPollTimer = null;
  }
}

function scheduleCloudSync() {
  if (!canSyncToCloud()) return;
  if (typeof sessionNeedsCloudSync !== 'undefined' && !sessionNeedsCloudSync) return;
  clearTimeout(syncTimer);
  setSyncStatus('En attente cloud…', 'pending');
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
    if (typeof toast === 'function') toast(formatCloudSyncError(e), true);
    throw e;
  }
}

function setupCloudAutoSave() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushCloudSync();
    } else if (document.visibilityState === 'visible') {
      void pullCloudUpdatesOnly();
    }
  });
  window.addEventListener('pagehide', () => { void flushCloudSync(); });
  startCloudSyncPoll();
}

async function bootstrapCloudData() {
  if (!isAuthenticated() || !getCurrentPharmacyId()) return;
  await loadPlanningFromCloud();
  if (isAdmin()) await mergeStaffPatchesFromProfiles();
  await loadPersonalDataFromCloud();
  if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
  startCloudSyncPoll();
}

async function syncAfterAuth() {
  if (!isAuthenticated() || !getCurrentPharmacyId()) return;
  try {
    await bootstrapCloudData();
    if (typeof saveState === 'function') saveState();
    if (isAdmin()) {
      await pushPlanningToCloud();
    } else if (isStaff()) {
      await pushStaffSharedChangesToCloud();
      await pushPersonalDataToCloud();
    }
    if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
    if (typeof render === 'function') render();
    if (typeof markCloudSynced === 'function') markCloudSynced();
    startCloudSyncPoll();
  } catch (e) {
    console.error('Sync post-connexion échouée', e);
  }
}
