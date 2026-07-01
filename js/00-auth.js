/* Authentification Supabase et gestion des profils admin / employé */
'use strict';

const AUTH = {
  client: null,
  session: null,
  profile: null,
  pharmacy: null,
  membership: null,
  memberships: [],
  ready: false,
  listeners: [],
};

let authHandlersPaused = false;
const AUTH_SIGNIN_TIMEOUT_MS = 15000;
const PROFILE_LOAD_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function fallbackProfileFromUser(user) {
  return {
    id: user.id,
    email: user.email || '',
    full_name: user.user_metadata?.full_name || user.email || '',
    role: user.user_metadata?.role || 'admin',
    employee_name: user.user_metadata?.employee_name || null,
  };
}

function refreshProfileInBackground(user) {
  if (!user) return;
  void withTimeout(loadProfile(user.id), PROFILE_LOAD_TIMEOUT_MS)
    .then((profile) => {
      if (profile) {
        AUTH.profile = profile;
        renderAuthBar();
        if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
        if (typeof render === 'function') render();
        if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
      }
    })
    .catch((e) => console.warn('Profil cloud non chargé', e));
}

function isSupabaseConfigured() {
  const cfg = window.SUPABASE_CONFIG;
  return !!(cfg && cfg.url && cfg.anonKey && cfg.anonKey !== 'VOTRE_CLE_ANON_ICI');
}

function waitForSupabaseLib(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      resolve();
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Bibliothèque Supabase non chargée. Ouvrez la page via http://localhost:8080 (pas en file://) et vérifiez votre connexion internet.'));
      }
    }, 50);
  });
}

function initSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (AUTH.client) return AUTH.client;
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('Bibliothèque Supabase non chargée. Vérifiez votre connexion internet.');
  }
  AUTH.client = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
  return AUTH.client;
}

async function ensureAuthClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configuré — renseignez js/00-config.js');
  }
  await waitForSupabaseLib();
  if (!AUTH.client) initSupabaseClient();
  if (!AUTH.client) {
    throw new Error('Impossible d\'initialiser Supabase. Rechargez la page.');
  }
  return AUTH.client;
}

function onAuthChange(fn) {
  AUTH.listeners.push(fn);
}

function notifyAuthChange() {
  for (const fn of AUTH.listeners) {
    try { fn(AUTH.session, AUTH.profile); } catch (e) { console.error(e); }
  }
}

async function loadProfile(userId) {
  await ensureAuthClient();
  const { data, error } = await withTimeout(
    AUTH.client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    PROFILE_LOAD_TIMEOUT_MS,
    'Chargement du profil expiré'
  );
  if (error) throw error;
  AUTH.profile = data;
  return data;
}

async function loadPharmacyMemberships(userId) {
  await ensureAuthClient();
  const { data, error } = await AUTH.client
    .from('pharmacy_members')
    .select(`
      id, role, employee_name, pharmacy_id,
      pharmacies ( id, name, invite_code )
    `)
    .eq('user_id', userId);
  if (error) throw error;
  AUTH.memberships = (data || []).map(m => ({
    id: m.id,
    role: m.role,
    employee_name: m.employee_name,
    pharmacy_id: m.pharmacy_id,
    pharmacy: m.pharmacies,
  }));
  return AUTH.memberships;
}

async function selectPharmacy(pharmacyId) {
  const membership = AUTH.memberships.find(m => m.pharmacy_id === pharmacyId);
  if (!membership) throw new Error('Vous n\'appartenez pas à cette pharmacie.');
  AUTH.pharmacy = membership.pharmacy;
  AUTH.membership = membership;
  setActivePharmacyIdInStorage(pharmacyId);
  if (typeof switchPharmacyState === 'function') switchPharmacyState(pharmacyId);
  renderAuthBar();
  notifyAuthChange();
  if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
  if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
  return membership;
}

async function ensurePharmacySelected() {
  if (!AUTH.session?.user) return null;
  if (AUTH.pharmacy && AUTH.membership) return AUTH.membership;

  await loadPharmacyMemberships(AUTH.session.user.id);

  if (AUTH.memberships.length === 0) {
    return null;
  }

  const savedId = getActivePharmacyIdFromStorage();
  const saved = savedId && AUTH.memberships.find(m => m.pharmacy_id === savedId);
  if (saved) {
    await selectPharmacy(saved.pharmacy_id);
    return AUTH.membership;
  }

  if (AUTH.memberships.length === 1) {
    await selectPharmacy(AUTH.memberships[0].pharmacy_id);
    return AUTH.membership;
  }

  return null;
}

async function joinPharmacyByInvite(inviteCode) {
  await ensureAuthClient();
  const { data, error } = await AUTH.client.rpc('join_pharmacy_by_invite', {
    p_invite_code: String(inviteCode || '').trim(),
  });
  if (error) throw error;
  await loadPharmacyMemberships(AUTH.session.user.id);
  await selectPharmacy(data);
  return data;
}

async function createPharmacy(name) {
  await ensureAuthClient();
  const { data, error } = await AUTH.client.rpc('create_pharmacy', {
    p_name: String(name || '').trim(),
  });
  if (error) throw error;
  await loadPharmacyMemberships(AUTH.session.user.id);
  await selectPharmacy(data);
  return data;
}

async function ensureUserProfile(user) {
  if (!user) return null;
  AUTH.profile = fallbackProfileFromUser(user);
  refreshProfileInBackground(user);
  return AUTH.profile;
}

function enableAuthFormButtons(overlay) {
  const loginBtn = overlay.querySelector('#auth-form-login .auth-submit');
  const signupBtn = overlay.querySelector('#auth-form-signup .auth-submit');
  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Se connecter';
  }
  if (signupBtn) {
    signupBtn.disabled = false;
    signupBtn.textContent = 'Créer un compte';
  }
}

async function prepareAuthOverlay(overlay) {
  const initErrEl = overlay.querySelector('#auth-init-error');
  try {
    if (AUTH.client) {
      enableAuthFormButtons(overlay);
      return;
    }
    await ensureAuthClient();
    enableAuthFormButtons(overlay);
  } catch (err) {
    initErrEl.textContent = err.message || String(err);
    initErrEl.hidden = false;
    overlay.querySelectorAll('.auth-submit').forEach(btn => {
      btn.disabled = true;
      btn.textContent = 'Supabase indisponible';
    });
  }
}

async function refreshAuthSession() {
  if (!AUTH.client) return null;
  try {
    const { data: { session }, error } = await AUTH.client.auth.getSession();
    if (error) throw error;
    AUTH.session = session;
    if (session?.user) {
      if (!AUTH.profile) AUTH.profile = fallbackProfileFromUser(session.user);
      refreshProfileInBackground(session.user);
    } else {
      AUTH.profile = null;
    }
    notifyAuthChange();
    return session;
  } catch (e) {
    console.warn('Session Supabase non récupérée', e);
    AUTH.session = null;
    AUTH.profile = null;
    return null;
  }
}

function getCurrentPharmacyId() {
  return AUTH.pharmacy?.id || null;
}

function getMembershipRole() {
  return AUTH.membership?.role || AUTH.profile?.role || null;
}

function isAuthenticated() {
  return !!AUTH.session?.user;
}

function isAdmin() {
  return getMembershipRole() === 'admin';
}

function isTeamLeader() {
  return getMembershipRole() === 'team_leader';
}

function isEmployee() {
  return getMembershipRole() === 'employee';
}

function isStaff() {
  return isEmployee() || isTeamLeader();
}

function getAuthRoleLabel() {
  if (isAdmin()) return 'Administrateur';
  if (isTeamLeader()) return 'Chef d\'équipe';
  if (isEmployee()) return 'Employé';
  return '';
}

function canEditPlanning() {
  if (!isAuthenticated()) return true;
  if (!isSupabaseConfigured()) return true;
  return isAdmin();
}

function canEditEmployeeData(empName) {
  if (!isAuthenticated()) return true;
  if (!isSupabaseConfigured()) return true;
  if (isAdmin()) return true;
  if (isTeamLeader()) return true;
  if (isEmployee()) return employeeNamesMatch(getLinkedEmployeeName(), empName);
  return false;
}

function canRequestCongesFor(empName) {
  return canEditEmployeeData(empName);
}

function employeeNameKey(name) {
  const n = typeof normalizeEmployeeName === 'function'
    ? normalizeEmployeeName(name)
    : String(name || '').trim().replace(/\s+/g, ' ');
  return n.toLowerCase();
}

function employeeNamesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return employeeNameKey(a) === employeeNameKey(b);
}

function getLinkedEmployeeName() {
  const raw = AUTH.membership?.employee_name || AUTH.profile?.employee_name;
  if (!raw) return null;
  const employees = (typeof STATE !== 'undefined' && STATE.employees) ? STATE.employees : [];
  if (employees.includes(raw)) return raw;
  const key = employeeNameKey(raw);
  const match = employees.find(e => employeeNameKey(e) === key);
  if (match) return match;
  return raw;
}

function getAuthDisplayName() {
  if (!AUTH.profile) return '';
  return AUTH.profile.full_name || AUTH.profile.email || '';
}

async function signIn(email, password) {
  authHandlersPaused = true;
  try {
    const client = await ensureAuthClient();
    const { data, error } = await withTimeout(
      client.auth.signInWithPassword({
        email: String(email || '').trim(),
        password: String(password || ''),
      }),
      AUTH_SIGNIN_TIMEOUT_MS,
      'Connexion expirée (15 s). Vérifiez internet et ajoutez http://localhost:8080 dans Supabase → Authentication → URL Configuration.'
    );
    if (error) throw error;
    if (!data.session) throw new Error('Session absente — confirmez votre email si Supabase l\'exige.');
    AUTH.session = data.session;
    if (data.user) AUTH.profile = fallbackProfileFromUser(data.user);
    notifyAuthChange();
    renderAuthBar();
    if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
    if (typeof render === 'function') render();
    if (typeof toast === 'function') toast(`Connecté — ${getAuthDisplayName()}`);
    if (data.user) refreshProfileInBackground(data.user);
    if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
    return data;
  } finally {
    authHandlersPaused = false;
  }
}

async function completeAuthWithPharmacy() {
  if (!AUTH.session?.user) return { needsPharmacy: false };
  await loadPharmacyMemberships(AUTH.session.user.id);

  if (AUTH.memberships.length === 0) {
    return { needsPharmacy: true, action: 'join' };
  }

  const savedId = getActivePharmacyIdFromStorage();
  const saved = savedId && AUTH.memberships.find(m => m.pharmacy_id === savedId);

  if (saved) {
    await selectPharmacy(saved.pharmacy_id);
    if (typeof syncAfterAuth === 'function') void syncAfterAuth();
    return { needsPharmacy: false };
  }

  if (AUTH.memberships.length === 1) {
    await selectPharmacy(AUTH.memberships[0].pharmacy_id);
    if (typeof syncAfterAuth === 'function') void syncAfterAuth();
    return { needsPharmacy: false };
  }

  return { needsPharmacy: true, action: 'pick' };
}

async function signUp({ email, password, fullName, employeeName, role, pharmacyName, inviteCode }) {
  authHandlersPaused = true;
  try {
    const client = await ensureAuthClient();
    const meta = { full_name: fullName || '' };
    if (employeeName) meta.employee_name = employeeName;
    if (role === 'admin' || role === 'employee' || role === 'team_leader') meta.role = role;
    if (pharmacyName) meta.pharmacy_name = pharmacyName;
    if (inviteCode) meta.invite_code = inviteCode;

    const { data, error } = await withTimeout(
      client.auth.signUp({
        email: String(email || '').trim(),
        password: String(password || ''),
        options: { data: meta },
      }),
      AUTH_SIGNIN_TIMEOUT_MS,
      'Inscription expirée (15 s). Vérifiez votre connexion internet.'
    );
    if (error) throw error;
    if (data.session) {
      AUTH.session = data.session;
      if (data.user) AUTH.profile = fallbackProfileFromUser(data.user);
      notifyAuthChange();
      renderAuthBar();
      if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
      if (typeof toast === 'function') toast(`Compte créé — ${getAuthDisplayName()}`);
      if (data.user) refreshProfileInBackground(data.user);
    }
    return data;
  } finally {
    authHandlersPaused = false;
  }
}

function removePharmacyOverlay() {
  document.querySelector('.pharmacy-overlay')?.remove();
}

function showPharmacyPicker() {
  removePharmacyOverlay();
  if (!AUTH.memberships.length) {
    showJoinPharmacyOverlay();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay pharmacy-overlay';
  overlay.innerHTML = `
    <div class="auth-card" role="dialog" aria-labelledby="pharmacy-picker-title">
      <h2 id="pharmacy-picker-title">Choisir une pharmacie</h2>
      <p class="auth-sub">Vous appartenez à plusieurs pharmacies. Sélectionnez celle à afficher.</p>
      <div class="pharmacy-picker-list" id="pharmacy-picker-list"></div>
      <button type="button" class="auth-skip" id="pharmacy-picker-join">Rejoindre une autre pharmacie…</button>
    </div>`;

  document.body.appendChild(overlay);
  const list = overlay.querySelector('#pharmacy-picker-list');

  for (const m of AUTH.memberships) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pharmacy-picker-item';
    btn.innerHTML = `
      <strong>${escapeHtml(m.pharmacy?.name || 'Pharmacie')}</strong>
      <span class="muted">${escapeHtml(getRoleLabel(m.role))}</span>`;
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await selectPharmacy(m.pharmacy_id);
        removePharmacyOverlay();
        if (typeof syncAfterAuth === 'function') await syncAfterAuth();
        if (typeof toast === 'function') toast(`Pharmacie : ${m.pharmacy?.name || ''}`);
      } catch (e) {
        if (typeof toast === 'function') toast(e.message || 'Erreur', true);
        btn.disabled = false;
      }
    };
    list.appendChild(btn);
  }

  overlay.querySelector('#pharmacy-picker-join').onclick = () => {
    removePharmacyOverlay();
    showJoinPharmacyOverlay();
  };
}

function showJoinPharmacyOverlay() {
  removePharmacyOverlay();

  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay pharmacy-overlay';
  overlay.innerHTML = `
    <div class="auth-card" role="dialog" aria-labelledby="pharmacy-join-title">
      <button type="button" class="auth-close" id="pharmacy-join-close">✕</button>
      <h2 id="pharmacy-join-title">Rejoindre une pharmacie</h2>
      <p class="auth-sub">Entrez le code d'invitation fourni par votre administrateur, ou créez une nouvelle pharmacie.</p>
      <form class="auth-form" id="pharmacy-join-form">
        <label>Code d'invitation<input type="text" name="inviteCode" placeholder="Ex. A1B2C3D4" autocomplete="off"></label>
        <p class="auth-hint">— ou —</p>
        <label>Créer une nouvelle pharmacie<input type="text" name="pharmacyName" placeholder="Nom de la pharmacie"></label>
        <p class="auth-error" id="pharmacy-join-error" hidden></p>
        <button type="submit" class="primary auth-submit">Continuer</button>
      </form>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#pharmacy-join-close').onclick = removePharmacyOverlay;

  overlay.querySelector('#pharmacy-join-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = overlay.querySelector('#pharmacy-join-error');
    const submitBtn = form.querySelector('.auth-submit');
    const fd = new FormData(form);
    const inviteCode = String(fd.get('inviteCode') || '').trim();
    const pharmacyName = String(fd.get('pharmacyName') || '').trim();
    errEl.hidden = true;

    if (!inviteCode && !pharmacyName) {
      errEl.textContent = 'Entrez un code d\'invitation ou un nom de pharmacie.';
      errEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'En cours…';
    try {
      if (pharmacyName) await createPharmacy(pharmacyName);
      else await joinPharmacyByInvite(inviteCode);
      removePharmacyOverlay();
      if (typeof syncAfterAuth === 'function') await syncAfterAuth();
      if (typeof toast === 'function') toast(`Pharmacie : ${AUTH.pharmacy?.name || ''}`);
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continuer';
    }
  };
}

function getRoleLabel(role) {
  if (role === 'admin') return 'Administrateur';
  if (role === 'team_leader') return 'Chef d\'équipe';
  if (role === 'employee') return 'Employé';
  return role || '';
}

async function signOut() {
  if (!AUTH.client) return;
  await AUTH.client.auth.signOut();
  AUTH.session = null;
  AUTH.profile = null;
  AUTH.pharmacy = null;
  AUTH.membership = null;
  AUTH.memberships = [];
  notifyAuthChange();
  document.body.classList.remove('read-only-mode', 'employee-mode', 'team-leader-mode');
  if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
  renderAuthBar();
  if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
}

async function updateProfile(updates) {
  if (!AUTH.session?.user) throw new Error('Non connecté');
  const { data, error } = await AUTH.client
    .from('profiles')
    .update(updates)
    .eq('id', AUTH.session.user.id)
    .select()
    .single();
  if (error) throw error;
  AUTH.profile = data;
  notifyAuthChange();
  return data;
}

async function adminUpdateMembership(memberId, updates) {
  if (!isAdmin()) throw new Error('Accès réservé aux administrateurs');
  const { data, error } = await AUTH.client
    .from('pharmacy_members')
    .update(updates)
    .eq('id', memberId)
    .select()
    .single();
  if (error) throw error;
  if (AUTH.membership?.id === memberId) {
    AUTH.membership = { ...AUTH.membership, ...data };
  }
  const idx = AUTH.memberships.findIndex(m => m.id === memberId);
  if (idx >= 0) AUTH.memberships[idx] = { ...AUTH.memberships[idx], ...data };
  return data;
}

async function listProfiles() {
  if (!isAdmin()) throw new Error('Accès réservé aux administrateurs');
  const pharmacyId = getCurrentPharmacyId();
  if (!pharmacyId) throw new Error('Aucune pharmacie sélectionnée');

  const { data, error } = await AUTH.client
    .from('pharmacy_members')
    .select(`
      id, role, employee_name, user_id,
      profiles ( id, email, full_name, created_at, updated_at )
    `)
    .eq('pharmacy_id', pharmacyId)
    .order('role')
    .order('employee_name');
  if (error) throw error;

  return (data || []).map(m => ({
    member_id: m.id,
    id: m.profiles?.id || m.user_id,
    email: m.profiles?.email || '',
    full_name: m.profiles?.full_name || '',
    role: m.role,
    employee_name: m.employee_name,
    created_at: m.profiles?.created_at,
    updated_at: m.profiles?.updated_at,
  }));
}

async function initAuth() {
  if (!isSupabaseConfigured()) {
    AUTH.ready = true;
    return { configured: false, error: null };
  }
  try {
    await waitForSupabaseLib();
    initSupabaseClient();
    AUTH.client.auth.onAuthStateChange((_event, session) => {
      if (authHandlersPaused) return;
      AUTH.session = session;
      if (session?.user) {
        if (!AUTH.profile) AUTH.profile = fallbackProfileFromUser(session.user);
        refreshProfileInBackground(session.user);
      } else {
        AUTH.profile = null;
      }
      notifyAuthChange();
      renderAuthBar();
      if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
      if (typeof render === 'function') render();
      if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
    });
    await refreshAuthSession();
    if (AUTH.session?.user) {
      await ensurePharmacySelected();
      if (AUTH.pharmacy && typeof syncAfterAuth === 'function') void syncAfterAuth();
    }
    AUTH.ready = true;
    return { configured: true, session: AUTH.session, error: null };
  } catch (e) {
    console.error('Init Supabase échouée', e);
    AUTH.ready = true;
    return { configured: true, session: null, error: e };
  }
}

/* Interface de connexion --------------------------------------------------- */

function removeAuthOverlay() {
  document.querySelector('.auth-overlay')?.remove();
  document.body.classList.remove('auth-locked');
}

function showAuthOverlay({ mode = 'login' } = {}) {
  removeAuthOverlay();

  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card" role="dialog" aria-labelledby="auth-title">
      <button type="button" class="auth-close" id="auth-close" title="Fermer">✕</button>
      <h2 id="auth-title">Planning Personnel</h2>
      <p class="auth-sub">Connectez-vous pour synchroniser le planning avec Supabase.</p>
      <p class="auth-error" id="auth-init-error" hidden></p>
      <div class="auth-tabs">
        <button type="button" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-auth-tab="login">Connexion</button>
        <button type="button" class="auth-tab ${mode === 'signup' ? 'active' : ''}" data-auth-tab="signup">Inscription</button>
      </div>
      <form class="auth-form" id="auth-form-login" ${mode !== 'login' ? 'hidden' : ''}>
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label>Mot de passe<input type="password" name="password" required autocomplete="current-password" minlength="6"></label>
        <p class="auth-error" id="auth-error-login" hidden></p>
        <button type="submit" class="primary auth-submit" disabled>Chargement Supabase…</button>
      </form>
      <form class="auth-form" id="auth-form-signup" ${mode !== 'signup' ? 'hidden' : ''}>
        <label>Nom complet<input type="text" name="fullName" autocomplete="name"></label>
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label>Mot de passe<input type="password" name="password" required autocomplete="new-password" minlength="6"></label>
        <fieldset class="auth-pharmacy-fieldset">
          <legend>Pharmacie</legend>
          <label class="auth-radio">
            <input type="radio" name="pharmacyMode" value="join" checked>
            Rejoindre une pharmacie existante
          </label>
          <label class="auth-radio">
            <input type="radio" name="pharmacyMode" value="create">
            Créer une nouvelle pharmacie
          </label>
          <div id="auth-pharmacy-join">
            <label>Code d'invitation<input type="text" name="inviteCode" placeholder="Ex. A1B2C3D4" autocomplete="off"></label>
            <p class="auth-hint">Demandez ce code à l'administrateur de votre pharmacie.</p>
          </div>
          <div id="auth-pharmacy-create" hidden>
            <label>Nom de la pharmacie<input type="text" name="pharmacyName" placeholder="Ex. Pharmacie du Centre"></label>
          </div>
        </fieldset>
        <label>Salarié lié (employés)<input type="text" name="employeeName" placeholder="Ex. Patricia" list="auth-employee-list"></label>
        <datalist id="auth-employee-list"></datalist>
        <p class="auth-hint">Le premier compte d'une pharmacie devient administrateur. Les suivants sont des employés.</p>
        <p class="auth-error" id="auth-error-signup" hidden></p>
        <button type="submit" class="primary auth-submit" disabled>Chargement Supabase…</button>
      </form>
      <button type="button" class="auth-skip" id="auth-skip">Continuer sans connexion</button>
    </div>`;

  document.body.appendChild(overlay);

  const authCard = overlay.querySelector('.auth-card');
  if (authCard) authCard.onclick = (e) => e.stopPropagation();

  overlay.querySelector('#auth-close').onclick = removeAuthOverlay;
  overlay.querySelector('#auth-skip').onclick = removeAuthOverlay;
  overlay.onclick = (e) => {
    if (e.target === overlay) removeAuthOverlay();
  };

  void prepareAuthOverlay(overlay);

  overlay.querySelectorAll('input[name="pharmacyMode"]').forEach(radio => {
    radio.onchange = () => {
      const mode = overlay.querySelector('input[name="pharmacyMode"]:checked')?.value;
      overlay.querySelector('#auth-pharmacy-join').hidden = mode !== 'join';
      overlay.querySelector('#auth-pharmacy-create').hidden = mode !== 'create';
    };
  });

  const employeeList = overlay.querySelector('#auth-employee-list');
  if (employeeList && typeof STATE !== 'undefined') {
    for (const emp of STATE.employees || []) {
      const opt = document.createElement('option');
      opt.value = emp;
      employeeList.appendChild(opt);
    }
  }

  overlay.querySelectorAll('[data-auth-tab]').forEach(btn => {
    btn.onclick = () => {
      overlay.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.authTab;
      overlay.querySelector('#auth-form-login').hidden = tab !== 'login';
      overlay.querySelector('#auth-form-signup').hidden = tab !== 'signup';
    };
  });

  overlay.querySelector('#auth-form-login').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = overlay.querySelector('#auth-error-login');
    const submitBtn = form.querySelector('.auth-submit');
    errEl.hidden = true;
    const fd = new FormData(form);
    const prevLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Connexion…';
    try {
      const result = await signIn(fd.get('email'), fd.get('password'));
      removeAuthOverlay();
      if (result && typeof completeAuthWithPharmacy === 'function') {
        const phResult = await completeAuthWithPharmacy();
        if (phResult.needsPharmacy) {
          if (phResult.action === 'pick') showPharmacyPicker();
          else showJoinPharmacyOverlay();
        }
      }
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;
    }
  };

  overlay.querySelector('#auth-form-signup').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = overlay.querySelector('#auth-error-signup');
    const submitBtn = form.querySelector('.auth-submit');
    errEl.hidden = true;
    const fd = new FormData(form);
    const prevLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Création…';
    const pharmacyMode = fd.get('pharmacyMode');
    const inviteCode = pharmacyMode === 'join' ? fd.get('inviteCode') : null;
    const pharmacyName = pharmacyMode === 'create' ? fd.get('pharmacyName') : null;

    if (pharmacyMode === 'join' && !String(inviteCode || '').trim()) {
      errEl.textContent = 'Entrez le code d\'invitation fourni par votre pharmacie.';
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;
      return;
    }
    if (pharmacyMode === 'create' && !String(pharmacyName || '').trim()) {
      errEl.textContent = 'Entrez le nom de la nouvelle pharmacie.';
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;
      return;
    }

    try {
      const result = await signUp({
        email: fd.get('email'),
        password: fd.get('password'),
        fullName: fd.get('fullName'),
        employeeName: fd.get('employeeName'),
        inviteCode,
        pharmacyName,
      });
      if (result.session) {
        removeAuthOverlay();
        const phResult = await completeAuthWithPharmacy();
        if (phResult.needsPharmacy) showJoinPharmacyOverlay();
        if (typeof render === 'function') render();
      } else {
        errEl.textContent = 'Compte créé — vérifiez votre email pour confirmer l\'inscription.';
        errEl.hidden = false;
        errEl.style.color = 'var(--ok)';
        submitBtn.disabled = false;
        submitBtn.textContent = prevLabel;
      }
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
      errEl.style.color = '';
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;
    }
  };
}

function authErrorMessage(err) {
  const msg = err?.message || String(err);
  if (/invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if (/already registered/i.test(msg)) return 'Cet email est déjà utilisé.';
  if (/expir/i.test(msg)) return msg;
  if (/password/i.test(msg) && /short|least/i.test(msg)) return 'Mot de passe trop court (6 caractères minimum).';
  return msg;
}

function bindCloudLoginButtons() {
  const loginBtn = document.getElementById('btn-cloud-login');
  const syncBtn = document.getElementById('btn-cloud-sync');
  if (loginBtn) {
    loginBtn.onclick = () => showAuthOverlay({ mode: 'login' });
  }
  if (syncBtn && !syncBtn.dataset.bound) {
    syncBtn.dataset.bound = '1';
    syncBtn.onclick = async () => {
      if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
        showAuthOverlay({ mode: 'login' });
        return;
      }
      syncBtn.disabled = true;
      const prev = syncBtn.textContent;
      syncBtn.textContent = '☁ Synchronisation…';
      try {
        await forceCloudSync();
      } catch (e) {
        if (typeof toast === 'function') {
          toast(typeof formatCloudSyncError === 'function' ? formatCloudSyncError(e) : 'Sync cloud échouée', true);
        }
      } finally {
        syncBtn.disabled = false;
        if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
        else syncBtn.textContent = prev;
      }
    };
  }
  if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
}

function renderAuthBar() {
  let bar = document.getElementById('auth-bar');
  if (!isSupabaseConfigured()) {
    bar?.remove();
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'auth-bar';
    bar.className = 'auth-bar';
    const topbar = document.querySelector('header.topbar');
    if (topbar) topbar.after(bar);
  }
  bar.classList.remove('auth-bar-placeholder');
  bindCloudLoginButtons();

  if (!AUTH.client || !isAuthenticated()) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;

  const roleLabel = getAuthRoleLabel();
  const roleCls = isAdmin() ? 'admin' : (isTeamLeader() ? 'team-leader' : 'employee');
  const empLink = getLinkedEmployeeName() ? ` · ${escapeHtml(getLinkedEmployeeName())}` : '';
  bar.innerHTML = `
    <span class="auth-bar-status">
      <strong>${escapeHtml(getAuthDisplayName())}</strong>
      <span class="auth-role-badge ${roleCls}">${roleLabel}</span>${empLink}
      ${AUTH.pharmacy ? `<span class="auth-pharmacy-name">· ${escapeHtml(AUTH.pharmacy.name)}</span>` : ''}
    </span>
    <span class="auth-bar-actions">
      ${AUTH.memberships.length > 1 ? '<button type="button" class="auth-bar-btn" id="auth-bar-switch-pharmacy">Changer de pharmacie</button>' : ''}
      <span class="sync-status" id="sync-status"></span>
      <button type="button" class="auth-bar-btn" id="auth-bar-logout">Déconnexion</button>
    </span>`;

  bar.querySelector('#auth-bar-switch-pharmacy')?.addEventListener('click', () => showPharmacyPicker());

  bar.querySelector('#auth-bar-logout').onclick = async () => {
    await signOut();
    renderAuthBar();
    if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
  };

  if (typeof updateCloudButtonState === 'function') updateCloudButtonState();
}

function applyEmployeeViewRestrictions() {
  if (!isStaff()) {
    document.body.classList.remove('employee-mode', 'team-leader-mode');
    document.querySelectorAll('#tabs button, #nav-groups button').forEach(btn => {
      btn.style.display = '';
    });
    return;
  }

  document.body.classList.add('employee-mode');
  document.body.classList.toggle('team-leader-mode', isTeamLeader());

  const empName = getLinkedEmployeeName();
  if (empName) {
    const resolved = STATE.employees.includes(empName)
      ? empName
      : STATE.employees.find(e => typeof employeeNamesMatch === 'function' && employeeNamesMatch(e, empName));
    if (resolved) {
      STATE.ui.employeeView = resolved;
      STATE.ui.monthEmp = resolved;
      STATE.ui.yearEmp = resolved;
      STATE.ui.contractEmp = resolved;
      STATE.ui.cdiEmp = resolved;
      STATE.ui.employeeChartEmps = [resolved];
    }
  }

  STATE.ui.filtersEmp = STATE.employees.slice();

  const allowedTabs = ['week', 'conges'];
  const allowedGroups = ['planning', 'equipe'];

  document.querySelectorAll('#nav-groups button').forEach(btn => {
    btn.style.display = allowedGroups.includes(btn.dataset.group) ? '' : 'none';
  });
  document.querySelectorAll('#tabs button').forEach(btn => {
    btn.style.display = allowedTabs.includes(btn.dataset.tab) ? '' : 'none';
  });

  if (!allowedTabs.includes(STATE.ui.currentTab)) {
    STATE.ui.currentTab = 'week';
  }

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) resetBtn.style.display = 'none';
  ['btn-export-json', 'btn-import-json'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function requireAuthForCloud() {
  const result = await initAuth();
  renderAuthBar();

  if (!result.configured) return { ok: true, cloud: false };
  if (result.error) return { ok: true, cloud: false, error: result.error };

  return { ok: true, cloud: isAuthenticated() };
}

async function waitForAuthentication() {
  if (isAuthenticated()) return true;
  await new Promise((resolve) => {
    const onLogin = () => {
      if (isAuthenticated()) {
        AUTH.listeners = AUTH.listeners.filter(fn => fn !== onLogin);
        resolve();
      }
    };
    onAuthChange(onLogin);
    if (isAuthenticated()) resolve();
  });
  return true;
}

/* Gestion des comptes (admin) ------------------------------------------------ */

async function renderAdminUsersSection(root) {
  if (!isAdmin()) return;

  const inviteCode = AUTH.pharmacy?.invite_code || '';
  const pharmacyName = AUTH.pharmacy?.name || '';

  const card = document.createElement('div');
  card.className = 'form-card settings-section auth-users-card';
  card.id = 'cfg-users';
  card.innerHTML = `
    <h3>Comptes utilisateurs — ${escapeHtml(pharmacyName)}</h3>
    ${inviteCode ? `
    <p class="muted">Code d'invitation pour rejoindre cette pharmacie :</p>
    <code class="auth-invite-code">${escapeHtml(inviteCode)}</code>
    <p class="muted">Communiquez ce code aux nouveaux membres lors de leur inscription.</p>
    ` : ''}
    <p class="muted">Associez chaque compte au nom du salarié dans le planning. Le rôle <strong>Chef d'équipe</strong> permet de voir tout le planning et de proposer des modifications ou congés pour l'équipe.</p>
    <div class="auth-users-loading muted">Chargement…</div>
    <table class="auth-users-table employees-list" hidden>
      <thead>
        <tr>
          <th>Nom</th>
          <th>Email</th>
          <th>Rôle</th>
          <th>Salarié lié</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>`;
  root.appendChild(card);

  const loading = card.querySelector('.auth-users-loading');
  const table = card.querySelector('.auth-users-table');
  const tbody = table.querySelector('tbody');

  try {
    const profiles = await listProfiles();
    loading.hidden = true;
    table.hidden = false;

    for (const p of profiles) {
      const tr = document.createElement('tr');
      const empOptions = (STATE.employees || [])
        .map(emp => `<option value="${escapeHtml(emp)}" ${p.employee_name === emp ? 'selected' : ''}>${escapeHtml(emp)}</option>`)
        .join('');
      tr.innerHTML = `
        <td>${escapeHtml(p.full_name || '—')}</td>
        <td>${escapeHtml(p.email)}</td>
        <td>
          <select class="auth-user-role" data-member-id="${p.member_id}" ${p.id === AUTH.session?.user?.id ? 'disabled' : ''}>
            <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Administrateur</option>
            <option value="team_leader" ${p.role === 'team_leader' ? 'selected' : ''}>Chef d'équipe</option>
            <option value="employee" ${p.role === 'employee' ? 'selected' : ''}>Employé</option>
          </select>
        </td>
        <td>
          <select class="auth-user-emp" data-member-id="${p.member_id}">
            <option value="">—</option>
            ${empOptions}
          </select>
        </td>
        <td><button type="button" class="auth-user-save primary" data-member-id="${p.member_id}">Enregistrer</button></td>`;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.auth-user-save').forEach(btn => {
      btn.onclick = async () => {
        const memberId = btn.dataset.memberId;
        const row = btn.closest('tr');
        const role = row.querySelector('.auth-user-role').value;
        const employee_name = row.querySelector('.auth-user-emp').value || null;
        btn.disabled = true;
        try {
          await adminUpdateMembership(memberId, { role, employee_name });
          toast('Compte mis à jour');
        } catch (e) {
          toast(e.message || 'Erreur', true);
        } finally {
          btn.disabled = false;
        }
      };
    });
  } catch (e) {
    loading.textContent = 'Impossible de charger les comptes : ' + (e.message || e);
  }
}
