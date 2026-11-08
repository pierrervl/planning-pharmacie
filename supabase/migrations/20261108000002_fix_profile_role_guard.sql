-- Correctif urgent : toute modification de profil échouait avec
--   « function public.is_super_admin() does not exist »
-- quand la migration 20260720000000_super_admin_emails.sql n'avait pas été appliquée :
-- le trigger protect_profile_role (migration de sécurité) appelle cette fonction.
--
-- Ce script :
--   1. crée (si besoin) la table app_config et la fonction is_super_admin ;
--   2. rend le trigger robuste : il ne dépend plus de l'existence de is_super_admin.
-- Idempotent : peut être relancé sans effet de bord.

-- 1. Table de configuration et fonction super-admin -------------------------
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;

insert into public.app_config (key, value)
values ('super_admin_emails', '[]'::jsonb)
on conflict (key) do nothing;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_config c,
         jsonb_array_elements_text(c.value) e
    where c.key = 'super_admin_emails'
      and lower(trim(e)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

-- 2. Trigger de protection du rôle, sans dépendance fragile -----------------
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_super boolean := false;
begin
  if new.role is not distinct from old.role then
    return new;                      -- rôle inchangé : rien à vérifier
  end if;
  if auth.uid() is null then
    return new;                      -- SQL Editor / service : autorisé
  end if;
  begin
    if to_regprocedure('public.is_super_admin()') is not null then
      execute 'select public.is_super_admin()' into v_super;
    end if;
  exception when others then
    v_super := false;
  end;
  if not coalesce(v_super, false) then
    new.role := old.role;            -- un utilisateur ne change pas son propre rôle
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

-- Vérification
select
  to_regprocedure('public.is_super_admin()') is not null as fonction_super_admin,
  (select value from public.app_config where key = 'super_admin_emails') as super_admin_emails;
