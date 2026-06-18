-- Profils utilisateurs (admin / employé) et planning partagé de la pharmacie
-- Projet : jzlkqizzgmnlmaagijrv

create type public.user_role as enum ('admin', 'employee');

-- Profil lié à auth.users
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'employee',
  -- Nom du salarié dans le planning (pour les comptes employé)
  employee_name text,
  -- Données personnelles de l'employé (contrat, infos perso, etc.)
  personal_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Planning partagé (une seule ligne — singleton id = 1)
create table public.pharmacy_planning (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

insert into public.pharmacy_planning (id, data) values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Fonction : l'utilisateur courant est-il admin ?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
  assigned_role public.user_role;
begin
  select count(*) into admin_count from public.profiles where role = 'admin';

  if admin_count = 0 then
    assigned_role := 'admin';
  else
    assigned_role := coalesce(
      (new.raw_user_meta_data->>'role')::public.user_role,
      'employee'
    );
  end if;

  insert into public.profiles (id, email, full_name, role, employee_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    assigned_role,
    nullif(trim(new.raw_user_meta_data->>'employee_name'), '')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mise à jour updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger pharmacy_planning_updated_at
  before update on public.pharmacy_planning
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.pharmacy_planning enable row level security;

-- Profils : lecture de son propre profil ; admins lisent/modifient tous
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own_personal"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_admin_update"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- Planning : lecture pour tous les utilisateurs authentifiés ; écriture admin seulement
create policy "planning_select_authenticated"
  on public.pharmacy_planning for select
  using (auth.uid() is not null);

create policy "planning_insert_admin"
  on public.pharmacy_planning for insert
  with check (public.is_admin());

create policy "planning_update_admin"
  on public.pharmacy_planning for update
  using (public.is_admin())
  with check (public.is_admin());

-- Index utiles
create index profiles_role_idx on public.profiles (role);
create index profiles_employee_name_idx on public.profiles (employee_name);
