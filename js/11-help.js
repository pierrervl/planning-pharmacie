/* Onglet Aide — procédure de démarrage pour les pharmacies */
'use strict';

function helpStepClass(done) {
  return done ? 'help-step is-done' : 'help-step';
}

function hasPharmacyInfoConfigured(state = STATE) {
  const info = state.pharmacyInfo || {};
  return !!(String(info.name || '').trim() || String(info.siret || '').trim());
}

function hasPatternContent(state = STATE) {
  for (const emp of state.employees || []) {
    const weeks = (state.patterns || {})[emp];
    if (!weeks) continue;
    for (const pname of Object.keys(weeks)) {
      const week = weeks[pname];
      if (!Array.isArray(week)) continue;
      for (const day of week) {
        if (day && (day.matin === 1 || day.aprem === 1)) return true;
      }
    }
  }
  return false;
}

function hasPlanningContent(state = STATE) {
  for (const emp of state.employees || []) {
    const days = (state.planning || {})[emp];
    if (!days) continue;
    for (const iso of Object.keys(days)) {
      const d = days[iso];
      if (d && (d.matin === 1 || d.aprem === 1)) return true;
    }
  }
  return false;
}

function getStartupProgress(state = STATE) {
  const cloudOk = typeof isAuthenticated === 'function' && isAuthenticated()
    && typeof getCurrentPharmacyId === 'function' && !!getCurrentPharmacyId();
  const steps = [
    {
      id: 'cloud',
      done: cloudOk,
    },
    {
      id: 'pharmacy-info',
      done: hasPharmacyInfoConfigured(state),
    },
    {
      id: 'employees',
      done: (state.employees || []).length > 0,
    },
    {
      id: 'patterns',
      done: hasPatternContent(state),
    },
    {
      id: 'planning',
      done: hasPlanningContent(state),
    },
    {
      id: 'sync',
      done: cloudOk && hasPlanningContent(state),
    },
  ];
  const doneCount = steps.filter(s => s.done).length;
  return { steps, doneCount, total: steps.length };
}

function renderHelpEditor(root) {
  const progress = getStartupProgress();
  const pct = progress.total ? Math.round((progress.doneCount / progress.total) * 100) : 0;
  const isAdmin = typeof canEditPlanning === 'function' ? canEditPlanning() : true;
  const cloudConfigured = typeof isSupabaseConfigured === 'function' && isSupabaseConfigured();
  const pharmacyName = typeof AUTH !== 'undefined' && AUTH.pharmacy?.name
    ? AUTH.pharmacy.name
    : null;
  const inviteCode = typeof AUTH !== 'undefined' && AUTH.pharmacy?.invite_code
    ? AUTH.pharmacy.invite_code
    : null;

  const header = document.createElement('div');
  header.className = 'controls help-header';
  header.innerHTML = `
    <div class="label">Aide — Mise en route</div>
    <div class="help-text">
      Suivez cette procédure pour configurer votre pharmacie depuis zéro.
      Chaque étape comporte un lien direct vers l'écran concerné.
    </div>
    <div class="help-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="help-progress-bar" style="width:${pct}%"></div>
      <span class="help-progress-label">${progress.doneCount} / ${progress.total} étapes complétées</span>
    </div>`;
  root.appendChild(header);

  if (isAdmin) {
    root.appendChild(buildHelpSection({
      title: 'Procédure titulaire / administrateur',
      intro: 'En tant que responsable, vous créez l\'espace cloud de la pharmacie puis construisez le planning pour toute l\'équipe.',
      steps: buildAdminStartupSteps({ progress, cloudConfigured, pharmacyName, inviteCode }),
    }));
  }

  root.appendChild(buildHelpSection({
    title: 'Rejoindre une pharmacie existante',
    intro: 'Pour un salarié invité par le titulaire :',
    steps: buildJoinStartupSteps({ cloudConfigured }),
  }));

  root.appendChild(buildHelpSavingSection({ cloudConfigured }));

  const tips = document.createElement('div');
  tips.className = 'form-card help-tips-card';
  tips.innerHTML = `
    <h3>Bonnes pratiques</h3>
    <ul class="help-tips-list">
      <li>Utilisez l'application via <strong>http://localhost:8080</strong> ou votre hébergement web — pas en ouvrant le fichier HTML directement.</li>
      <li>Consultez la section <strong>Enregistrement et sauvegarde</strong> ci-dessus pour choisir la bonne méthode selon votre situation.</li>
      <li>Le code d'invitation est visible dans <strong>Paramètres → Comptes utilisateurs</strong> (réservé aux administrateurs).</li>
      <li>Les comptes employés ne voient que leur propre planning et peuvent proposer des congés ou des modifications.</li>
    </ul>`;
  root.appendChild(tips);

  bindHelpActions(root);
}

function buildHelpSavingSection({ cloudConfigured }) {
  const section = document.createElement('section');
  section.className = 'form-card help-section help-saving-section';
  section.innerHTML = `
    <h2>Enregistrement et sauvegarde</h2>
    <p class="help-section-intro">
      L'application propose <strong>trois niveaux</strong> de persistance. Ils ne se remplacent pas :
      le navigateur suffit pour travailler au quotidien, le fichier JSON pour archiver,
      le cloud pour partager l'équipe.
    </p>
    <div class="help-save-tiers">
      <article class="help-save-tier">
        <div class="help-save-tier-head">
          <span class="help-save-tier-icon">💾</span>
          <h3>1. Navigateur — automatique et ponctuel</h3>
        </div>
        <p>À chaque modification, vos données sont enregistrées <strong>automatiquement</strong> dans le navigateur
        (<em>localStorage</em>). À la prochaine visite sur le <strong>même ordinateur</strong> et le
        <strong>même navigateur</strong>, le planning réapparaît tel que vous l'avez laissé.</p>
        <ul class="help-save-proscons">
          <li><strong>Avantage :</strong> transparent, rien à faire.</li>
          <li><strong>Limite :</strong> lié à cet appareil ; effacé si vous videz les données du site ou changez de navigateur.</li>
        </ul>
      </article>
      <article class="help-save-tier help-save-tier--recommended-local">
        <div class="help-save-tier-head">
          <span class="help-save-tier-icon">⬇</span>
          <h3>2. Fichier JSON — sauvegarde locale durable</h3>
        </div>
        <p>Le bouton <strong>⬇ JSON</strong> exporte une copie complète dans le dossier
        <code>sauvegardes/</code> (nom horodaté du type <code>planning_2026-07-01_14-30.json</code>).
        C'est votre <strong>archive de secours</strong> : portable, récupérable, indépendante du navigateur.</p>
        <p>Pour restaurer une sauvegarde, utilisez <strong>⬆ JSON</strong> et choisissez le fichier souhaité
        (ou la dernière version dans <code>sauvegardes/</code>).</p>
        <ul class="help-save-proscons">
          <li><strong>Avantage :</strong> copie de sécurité, transfert entre postes, historique daté.</li>
          <li><strong>Quand :</strong> en fin de journée, avant une grosse modification, ou chaque semaine.</li>
        </ul>
        <div class="help-step-actions">
          <button type="button" class="help-action-btn primary" data-help-action="export-json">Exporter JSON maintenant</button>
        </div>
      </article>
      <article class="help-save-tier help-save-tier--recommended-cloud">
        <div class="help-save-tier-head">
          <span class="help-save-tier-icon">☁</span>
          <h3>3. Cloud Supabase — partage d'équipe (le plus pérenne)</h3>
        </div>
        <p>Après connexion (<strong>☁ Connexion cloud</strong>), le bouton <strong>☁ Synchroniser</strong>
        envoie le planning sur le serveur. Tous les membres de la pharmacie voient la même version
        après synchronisation — c'est la référence pour travailler à plusieurs.</p>
        <ul class="help-save-proscons">
          <li><strong>Avantage :</strong> partagé, sauvegardé côté serveur, accessible depuis n'importe quel poste connecté.</li>
          <li><strong>Quand :</strong> après chaque session de travail importante, ou quand un collègue doit voir vos changements.</li>
        </ul>
        ${cloudConfigured ? `
        <div class="help-step-actions">
          <button type="button" class="help-action-btn" data-help-action="login">Se connecter</button>
          <button type="button" class="help-action-btn primary" data-help-action="sync">Synchroniser maintenant</button>
        </div>` : '<p class="help-warn">Cloud non configuré — seules les sauvegardes navigateur et JSON sont disponibles.</p>'}
      </article>
    </div>
    <p class="help-save-summary muted">
      En résumé : le navigateur mémorise au fil de l'eau ; le JSON protège contre une perte locale ;
      le cloud synchronise l'équipe. Idéalement, utilisez les trois.
    </p>`;
  return section;
}

function buildAdminStartupSteps({ progress, cloudConfigured, pharmacyName, inviteCode }) {
  const stepDone = (id) => progress.steps.find(s => s.id === id)?.done;

  return [
    {
      id: 'cloud',
      done: stepDone('cloud'),
      title: '1. Créer votre compte et votre pharmacie cloud',
      body: `
        <p>Inscrivez-vous via <strong>☁ Connexion cloud</strong>, choisissez <em>Créer une nouvelle pharmacie</em> et renseignez le nom de l'officine. Vous devenez automatiquement administrateur.</p>
        ${pharmacyName ? `<p class="help-current">Pharmacie active : <strong>${escapeHtml(pharmacyName)}</strong></p>` : ''}
        ${cloudConfigured ? '' : '<p class="help-warn">Supabase n\'est pas configuré dans js/00-config.js — la synchronisation cloud est indisponible.</p>'}`,
      actions: cloudConfigured ? [
        { label: 'Se connecter / S\'inscrire', action: 'login' },
      ] : [],
    },
    {
      id: 'pharmacy-info',
      done: stepDone('pharmacy-info'),
      title: '2. Renseigner les informations de la pharmacie',
      body: `<p>Complétez le nom, l'adresse, le SIRET et le FINESS — ces données apparaissent sur les contrats PDF.</p>`,
      actions: [
        { label: '→ Pharmacie & employeur', tab: 'settings', hash: 'cfg-contract-party' },
      ],
    },
    {
      id: 'employees',
      done: stepDone('employees'),
      title: '3. Ajouter les salariés',
      body: `<p>Créez un par un les membres de l'équipe (préparateurs, étudiants, remplaçants…). Attribuez-leur un type et une couleur pour le planning.</p>`,
      actions: [
        { label: '→ Équipe', tab: 'employees' },
      ],
    },
    {
      id: 'patterns',
      done: stepDone('patterns'),
      title: '4. Définir les patterns (semaines-types)',
      body: `
        ${typeof PATTERN_CONCEPT_NOTE !== 'undefined' ? `<div class="pattern-concept-note pattern-concept-note--compact">${PATTERN_CONCEPT_NOTE}</div>` : ''}
        <p>Choisissez la <strong>durée du cycle</strong> (1 à 10 semaines), saisissez les horaires par défaut puis remplissez les semaines-types pour chaque salarié (clic = travail / repos).</p>
        <p>Définissez aussi l'<strong>ancrage calendaire</strong> : quelle semaine ISO correspond à S1 du cycle.</p>`,
      actions: [
        { label: '→ Patterns', tab: 'patterns' },
        { label: '→ Ancrage cycle', tab: 'settings', hash: 'cfg-pattern-anchor' },
      ],
    },
    {
      id: 'planning',
      done: stepDone('planning'),
      title: '5. Importer le cycle dans le planning',
      body: `<p>C'est l'étape où le tampon est appliqué : depuis l'onglet Patterns, lancez <strong>Importer le cycle vers le planning</strong> sur la période souhaitée. Le calendrier vierge se remplit alors avec les empreintes horaires définies dans le pattern.</p>`,
      actions: [
        { label: '→ Patterns → Import', tab: 'patterns' },
        { label: '→ Vue Semaine', tab: 'week' },
      ],
    },
    {
      id: 'invite',
      done: false,
      title: '6. Inviter les collègues',
      body: `
        <p>Communiquez le <strong>code d'invitation</strong> à chaque salarié. Lors de l'inscription, ils choisissent <em>Rejoindre une pharmacie existante</em> et saisissent ce code.</p>
        ${inviteCode ? `<p class="help-current">Votre code : <code class="auth-invite-code">${escapeHtml(inviteCode)}</code></p>` : '<p class="muted">Connectez-vous en tant qu\'administrateur pour afficher le code d\'invitation.</p>'}
        <p>Dans <strong>Comptes utilisateurs</strong>, associez chaque compte au nom du salarié dans le planning.</p>`,
      actions: [
        { label: '→ Comptes utilisateurs', tab: 'settings', hash: 'cfg-users' },
      ],
    },
    {
      id: 'sync',
      done: stepDone('sync'),
      title: '7. Synchroniser et vérifier',
      body: `<p>Cliquez sur <strong>☁ Synchroniser</strong> pour enregistrer le planning dans le cloud. Vos collègues connectés verront les mêmes données après connexion.</p>`,
      actions: [
        { label: 'Synchroniser maintenant', action: 'sync' },
        { label: '→ Vue Semaine', tab: 'week' },
      ],
    },
    {
      id: 'optional',
      done: false,
      optional: true,
      title: '8. (Optionnel) Journées spéciales',
      body: `<p>Configurez au besoin les jours fériés, les jours de garde et les journées de solidarité.</p>`,
      actions: [
        { label: '→ Jours fériés', tab: 'feries' },
        { label: '→ Jours de garde', tab: 'gardes' },
        { label: '→ Journées de solidarité', tab: 'pantecotes' },
      ],
    },
  ];
}

function buildJoinStartupSteps({ cloudConfigured }) {
  return [
    {
      id: 'join-cloud',
      done: typeof isAuthenticated === 'function' && isAuthenticated(),
      title: '1. Créer votre compte',
      body: `<p>Cliquez sur <strong>☁ Connexion cloud</strong>, onglet Inscription. Choisissez <em>Rejoindre une pharmacie existante</em> et entrez le code d'invitation fourni par votre titulaire.</p>`,
      actions: cloudConfigured ? [{ label: 'S\'inscrire', action: 'signup' }] : [],
    },
    {
      id: 'join-link',
      done: !!(typeof getLinkedEmployeeName === 'function' && getLinkedEmployeeName()),
      title: '2. Être lié à votre fiche salarié',
      body: `<p>L'administrateur doit associer votre compte au nom exact du salarié dans le planning (Paramètres → Comptes utilisateurs). Indiquez ce nom lors de l'inscription si possible.</p>`,
    },
    {
      id: 'join-use',
      done: false,
      title: '3. Consulter et proposer',
      body: `<p>Consultez votre planning dans l'onglet <strong>Semaine</strong>. Proposez vos congés ou demandes de modification — l'administrateur valide via l'onglet Demandes.</p>`,
      actions: [
        { label: '→ Semaine', tab: 'week' },
        { label: '→ Congés', tab: 'conges' },
      ],
    },
  ];
}

function buildHelpSection({ title, intro, steps }) {
  const section = document.createElement('section');
  section.className = 'form-card help-section';
  section.innerHTML = `<h2>${escapeHtml(title)}</h2><p class="help-section-intro">${intro}</p>`;

  const list = document.createElement('ol');
  list.className = 'help-steps-list';
  for (const step of steps) {
    const li = document.createElement('li');
    li.className = helpStepClass(step.done);
    if (step.optional) li.classList.add('is-optional');

    let actionsHtml = '';
    if (step.actions?.length) {
      actionsHtml = `<div class="help-step-actions">${step.actions.map(a => {
        if (a.action === 'login') {
          return `<button type="button" class="help-action-btn" data-help-action="login">${escapeHtml(a.label)}</button>`;
        }
        if (a.action === 'signup') {
          return `<button type="button" class="help-action-btn" data-help-action="signup">${escapeHtml(a.label)}</button>`;
        }
        if (a.action === 'sync') {
          return `<button type="button" class="help-action-btn primary" data-help-action="sync">${escapeHtml(a.label)}</button>`;
        }
        return `<button type="button" class="help-action-btn settings-goto" data-tab="${escapeHtml(a.tab)}"${a.hash ? ` data-hash="${escapeHtml(a.hash)}"` : ''}>${escapeHtml(a.label)}</button>`;
      }).join('')}</div>`;
    }

    li.innerHTML = `
      <div class="help-step-head">
        <span class="help-step-status" aria-hidden="true">${step.done ? '✓' : '○'}</span>
        <h3>${escapeHtml(step.title)}</h3>
      </div>
      <div class="help-step-body">${step.body}${actionsHtml}</div>`;
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

function bindHelpActions(root) {
  if (typeof bindSettingsNavLinks === 'function') bindSettingsNavLinks(root);

  root.querySelector('[data-help-action="login"]')?.addEventListener('click', () => {
    if (typeof showAuthOverlay === 'function') showAuthOverlay({ mode: 'login' });
  });
  root.querySelector('[data-help-action="signup"]')?.addEventListener('click', () => {
    if (typeof showAuthOverlay === 'function') showAuthOverlay({ mode: 'signup' });
  });
  root.querySelector('[data-help-action="sync"]')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-cloud-sync');
    if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
      if (typeof showAuthOverlay === 'function') showAuthOverlay({ mode: 'login' });
      return;
    }
    if (typeof forceCloudSync === 'function') {
      try { await forceCloudSync(); } catch (_e) { /* toast déjà affiché */ }
    } else if (btn) btn.click();
  });
  root.querySelector('[data-help-action="export-json"]')?.addEventListener('click', () => {
    if (typeof exportJSON === 'function') exportJSON();
    else document.getElementById('btn-export-json')?.click();
  });
}
