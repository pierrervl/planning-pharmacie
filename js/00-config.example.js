/* Copiez ce fichier en js/00-config.js et renseignez la clé anon Supabase.
   Dashboard → Project Settings → API → anon public key
   https://supabase.com/dashboard/project/jzlkqizzgmnlmaagijrv/settings/api */
'use strict';

/* Mot de passe oublié : le lien du mail revient sur la page du planning.
   Ajoutez cette URL dans Supabase → Authentication → URL Configuration
   → Redirect URLs (ex. http://localhost:8080/planning_personnel.html
   et l'URL publique, avec un joker si besoin : https://….github.io/**). */
window.SUPABASE_CONFIG = {
  url: 'https://jzlkqizzgmnlmaagijrv.supabase.co',
  anonKey: 'VOTRE_CLE_ANON_ICI',
  /* E-mails autorisés à lire toutes les suggestions (propriétaire de l'app).
     Doit aussi être configuré côté Supabase :
     update app_config set value = '["votre@email.com"]'::jsonb where key = 'feedback_owner_emails'; */
  feedbackOwnerEmails: ['votre@email.com'],
  /* Support technique : changement de pharmacie / multi-officines (même config Supabase) :
     update app_config set value = '["votre@email.com"]'::jsonb where key = 'super_admin_emails'; */
  superAdminEmails: ['votre@email.com'],
};
