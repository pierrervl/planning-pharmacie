/* Authentification Supabase et gestion des profils admin / employé */
'use strict';

const AUTH = {
  client: null,
  session: null,
  profile: null,
  ready: false,
  listeners: [],
};

function isSupabaseConfigured() {
  const cfg = window.SUPABASE_CONFIG;
  return !!(cfg && cfg.url && cfg.anonKey && cfg.anonKey !== 'VOTRE_CLE_ANON_ICI');
}

function initSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (AUTH.client) return AUTH.client;
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

function onAuthChange(fn) {
  AUTH.listeners.push(fn);
}

function notifyAuthChange() {
  for (const fn of AUTH.listeners) {
    try { fn(AUTH.session, AUTH.profile); } catch (e) { console.error(e); }
  }
}

async function loadProfile(userId) {
  const { data, error } = await AUTH.client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  AUTH.profile = data;
  return data;
}

async function refreshAuthSession() {
  if (!AUTH.client) return null;
  const { data: { session }, error } = await AUTH.client.auth.getSession();
  if (error) throw error;
  AUTH.session = session;
  if (session?.user) {
    await loadProfile(session.user.id);
  } else {
    AUTH.profile = null;
  }
  notifyAuthChange();
  return session;
}

function isAuthenticated() {
  return !!AUTH.session?.user;
}

function isAdmin() {
  return AUTH.profile?.role === 'admin';
}

function isEmployee() {
  return AUTH.profile?.role === 'employee';
}

function canEditPlanning() {
  if (!isSupabaseConfigured()) return true;
  if (!isAuthenticated()) return false;
  return isAdmin();
}

function canEditEmployeeData(empName) {
  if (!isSupabaseConfigured()) return true;
  if (!isAuthenticated()) return false;
  if (isAdmin()) return true;
  if (isEmployee()) return getLinkedEmployeeName() === empName;
  return false;
}

function getLinkedEmployeeName() {
  return AUTH.profile?.employee_name || null;
}

function getAuthDisplayName() {
  if (!AUTH.profile) return '';
  return AUTH.profile.full_name || AUTH.profile.email || '';
}

async function signIn(email, password) {
  const { data, error } = await AUTH.client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  AUTH.session = data.session;
  if (data.user) await loadProfile(data.user.id);
  notifyAuthChange();
  return data;
}

async function signUp({ email, password, fullName, employeeName, role }) {
  const meta = { full_name: fullName || '' };
  if (employeeName) meta.employee_name = employeeName;
  if (role === 'admin' || role === 'employee') meta.role = role;

  const { data, error } = await AUTH.client.auth.signUp({
    email,
    password,
    options: { data: meta },
  });
  if (error) throw error;
  if (data.session) {
    AUTH.session = data.session;
    await loadProfile(data.user.id);
    notifyAuthChange();
  }
  return data;
}

async function signOut() {
  if (!AUTH.client) return;
  await AUTH.client.auth.signOut();
  AUTH.session = null;
  AUTH.profile = null;
  notifyAuthChange();
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

async function adminUpdateProfile(userId, updates) {
  if (!isAdmin()) throw new Error('Accès réservé aux administrateurs');
  const { data, error } = await AUTH.client
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listProfiles() {
  if (!isAdmin()) throw new Error('Accès réservé aux administrateurs');
  const { data, error } = await AUTH.client
    .from('profiles')
    .select('id, email, full_name, role, employee_name, created_at, updated_at')
    .order('role')
    .order('full_name');
  if (error) throw error;
  return data || [];
}

async function initAuth() {
  if (!isSupabaseConfigured()) {
    AUTH.ready = true;
    return { configured: false };
  }
  initSupabaseClient();
  AUTH.client.auth.onAuthStateChange(async (_event, session) => {
    AUTH.session = session;
    if (session?.user) {
      try {
        await loadProfile(session.user.id);
      } catch (e) {
        console.warn('Profil introuvable', e);
        AUTH.profile = null;
      }
    } else {
      AUTH.profile = null;
    }
    notifyAuthChange();
  });
  await refreshAuthSession();
  AUTH.ready = true;
  return { configured: true, session: AUTH.session };
}

/* Interface de connexion --------------------------------------------------- */

function removeAuthOverlay() {
  document.querySelector('.auth-overlay')?.remove();
  document.body.classList.remove('auth-locked');
}

function showAuthOverlay({ mode = 'login' } = {}) {
  removeAuthOverlay();
  document.body.classList.add('auth-locked');

  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card" role="dialog" aria-labelledby="auth-title">
      <h2 id="auth-title">Planning Personnel</h2>
      <p class="auth-sub">Connectez-vous pour accéder au planning de la pharmacie.</p>
      <div class="auth-tabs">
        <button type="button" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-auth-tab="login">Connexion</button>
        <button type="button" class="auth-tab ${mode === 'signup' ? 'active' : ''}" data-auth-tab="signup">Inscription</button>
      </div>
      <form class="auth-form" id="auth-form-login" ${mode !== 'login' ? 'hidden' : ''}>
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label>Mot de passe<input type="password" name="password" required autocomplete="current-password" minlength="6"></label>
        <p class="auth-error" id="auth-error-login" hidden></p>
        <button type="submit" class="primary auth-submit">Se connecter</button>
      </form>
      <form class="auth-form" id="auth-form-signup" ${mode !== 'signup' ? 'hidden' : ''}>
        <label>Nom complet<input type="text" name="fullName" autocomplete="name"></label>
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label>Mot de passe<input type="password" name="password" required autocomplete="new-password" minlength="6"></label>
        <label>Salarié lié (employés)<input type="text" name="employeeName" placeholder="Ex. Patricia" list="auth-employee-list"></label>
        <datalist id="auth-employee-list"></datalist>
        <p class="auth-hint">Le premier compte créé devient administrateur. Les suivants sont des employés.</p>
        <p class="auth-error" id="auth-error-signup" hidden></p>
        <button type="submit" class="primary auth-submit">Créer un compte</button>
      </form>
    </div>`;

  document.body.appendChild(overlay);

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
    const errEl = overlay.querySelector('#auth-error-login');
    errEl.hidden = true;
    const fd = new FormData(e.target);
    try {
      await signIn(fd.get('email'), fd.get('password'));
      removeAuthOverlay();
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
    }
  };

  overlay.querySelector('#auth-form-signup').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = overlay.querySelector('#auth-error-signup');
    errEl.hidden = true;
    const fd = new FormData(e.target);
    try {
      const result = await signUp({
        email: fd.get('email'),
        password: fd.get('password'),
        fullName: fd.get('fullName'),
        employeeName: fd.get('employeeName'),
      });
      if (result.session) {
        removeAuthOverlay();
      } else {
        errEl.textContent = 'Compte créé — vérifiez votre email pour confirmer l\'inscription.';
        errEl.hidden = false;
        errEl.style.color = 'var(--ok)';
      }
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
      errEl.style.color = '';
    }
  };
}

function authErrorMessage(err) {
  const msg = err?.message || String(err);
  if (/invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if (/already registered/i.test(msg)) return 'Cet email est déjà utilisé.';
  if (/password/i.test(msg) && /short|least/i.test(msg)) return 'Mot de passe trop court (6 caractères minimum).';
  return msg;
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

  if (!isAuthenticated()) {
    bar.innerHTML = `
      <span class="auth-bar-status muted">Non connecté — données locales uniquement</span>
      <button type="button" class="auth-bar-btn primary" id="auth-bar-login">Se connecter</button>`;
    bar.querySelector('#auth-bar-login').onclick = () => showAuthOverlay({ mode: 'login' });
    return;
  }

  const roleLabel = isAdmin() ? 'Administrateur' : 'Employé';
  const empLink = getLinkedEmployeeName() ? ` · ${escapeHtml(getLinkedEmployeeName())}` : '';
  bar.innerHTML = `
    <span class="auth-bar-status">
      <strong>${escapeHtml(getAuthDisplayName())}</strong>
      <span class="auth-role-badge ${isAdmin() ? 'admin' : 'employee'}">${roleLabel}</span>${empLink}
    </span>
    <span class="auth-bar-actions">
      <span class="sync-status" id="sync-status"></span>
      ${isAdmin() ? '<button type="button" class="auth-bar-btn" id="auth-bar-sync" title="Synchroniser maintenant">☁ Sync</button>' : ''}
      <button type="button" class="auth-bar-btn" id="auth-bar-logout">Déconnexion</button>
    </span>`;

  bar.querySelector('#auth-bar-logout').onclick = async () => {
    await signOut();
    renderAuthBar();
    showAuthOverlay({ mode: 'login' });
  };

  const syncBtn = bar.querySelector('#auth-bar-sync');
  if (syncBtn) {
    syncBtn.onclick = () => void forceCloudSync();
  }
}

function applyEmployeeViewRestrictions() {
  if (!isEmployee()) {
    document.body.classList.remove('read-only-mode');
    return;
  }

  document.body.classList.add('read-only-mode');
  const empName = getLinkedEmployeeName();
  if (empName && STATE.employees.includes(empName)) {
    STATE.ui.filtersEmp = [empName];
    STATE.ui.employeeView = empName;
    STATE.ui.monthEmp = empName;
    STATE.ui.yearEmp = empName;
    STATE.ui.contractEmp = empName;
    STATE.ui.cdiEmp = empName;
    STATE.ui.employeeChartEmps = [empName];
  }

  /* Onglets réservés à l'admin */
  const adminOnlyTabs = ['patterns', 'employees', 'settings', 'feries', 'gardes', 'conges'];
  for (const tab of adminOnlyTabs) {
    const btn = document.querySelector(`#tabs button[data-tab="${tab}"]`);
    if (btn) btn.style.display = 'none';
  }
  if (adminOnlyTabs.includes(STATE.ui.currentTab)) {
    STATE.ui.currentTab = 'week';
  }

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) resetBtn.style.display = 'none';
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

  if (!isAuthenticated()) {
    showAuthOverlay({ mode: 'login' });
    await new Promise((resolve) => {
      if (isAuthenticated()) {
        resolve();
        return;
      }
      const onLogin = () => {
        if (isAuthenticated()) {
          AUTH.listeners = AUTH.listeners.filter(fn => fn !== onLogin);
          resolve();
        }
      };
      onAuthChange(onLogin);
    });
    renderAuthBar();
  }

  return { ok: true, cloud: true };
}

/* Gestion des comptes (admin) ------------------------------------------------ */

async function renderAdminUsersSection(root) {
  if (!isAdmin()) return;

  const card = document.createElement('div');
  card.className = 'form-card settings-section auth-users-card';
  card.id = 'cfg-users';
  card.innerHTML = `
    <h3>Comptes utilisateurs</h3>
    <p class="muted">Associez chaque compte employé au nom du salarié dans le planning.</p>
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
          <select class="auth-user-role" data-user-id="${p.id}" ${p.id === AUTH.session?.user?.id ? 'disabled' : ''}>
            <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Administrateur</option>
            <option value="employee" ${p.role === 'employee' ? 'selected' : ''}>Employé</option>
          </select>
        </td>
        <td>
          <select class="auth-user-emp" data-user-id="${p.id}">
            <option value="">—</option>
            ${empOptions}
          </select>
        </td>
        <td><button type="button" class="auth-user-save primary" data-user-id="${p.id}">Enregistrer</button></td>`;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('.auth-user-save').forEach(btn => {
      btn.onclick = async () => {
        const userId = btn.dataset.userId;
        const row = btn.closest('tr');
        const role = row.querySelector('.auth-user-role').value;
        const employee_name = row.querySelector('.auth-user-emp').value || null;
        btn.disabled = true;
        try {
          await adminUpdateProfile(userId, { role, employee_name });
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
