-- Multi-pharmacies : chaque pharmacie a son planning et ses membres
-- Migration des données existantes (singleton id=1) vers le modèle multi-tenant

-- ---------------------------------------------------------------------------
-- Tables pharmacies et membres
-- ---------------------------------------------------------------------------

create table public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pharmacy_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  role public.user_role not null default 'employee',
  employee_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pharmacy_id)
);

create index pharmacy_members_user_idx on public.pharmacy_members (user_id);
create index pharmacy_members_pharmacy_idx on public.pharmacy_members (pharmacy_id);
create index pharmacy_members_role_idx on public.pharmacy_members (pharmacy_id, role);

-- Pharmacie par défaut (migration des données existantes)
insert into public.pharmacies (id, name, invite_code)
values (
  '00000000-0000-4000-8000-000000000001',
  'Pharmacie par défaut',
  upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
);

-- Membres : reprendre rôle et salarié lié depuis profiles
insert into public.pharmacy_members (user_id, pharmacy_id, role, employee_name)
select
  p.id,
  '00000000-0000-4000-8000-000000000001',
  p.role,
  p.employee_name
from public.profiles p;

-- ---------------------------------------------------------------------------
-- pharmacy_planning : une ligne par pharmacie (remplace le singleton id=1)
-- ---------------------------------------------------------------------------

alter table public.pharmacy_planning
  add column pharmacy_id uuid references public.pharmacies (id) on delete cascade;

update public.pharmacy_planning
set pharmacy_id = '00000000-0000-4000-8000-000000000001'
where id = 1;

alter table public.pharmacy_planning
  alter column pharmacy_id set not null;

alter table public.pharmacy_planning drop constraint if exists pharmacy_planning_id_check;
alter table public.pharmacy_planning drop constraint pharmacy_planning_pkey;
alter table public.pharmacy_planning drop column id;
alter table public.pharmacy_planning add primary key (pharmacy_id);

-- ---------------------------------------------------------------------------
-- Helpers RLS (contexte pharmacie)
-- ---------------------------------------------------------------------------

create or replace function public.is_pharmacy_member(p_pharmacy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pharmacy_members
    where user_id = auth.uid() and pharmacy_id = p_pharmacy_id
  );
$$;

create or replace function public.is_pharmacy_admin(p_pharmacy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pharmacy_members
    where user_id = auth.uid()
      and pharmacy_id = p_pharmacy_id
      and role = 'admin'
  );
$$;

create or replace function public.is_pharmacy_staff(p_pharmacy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pharmacy_members
    where user_id = auth.uid()
      and pharmacy_id = p_pharmacy_id
      and role::text in ('employee', 'team_leader')
  );
$$;

-- Génère un code d'invitation unique (8 caractères alphanumériques)
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  code text;
  exists_already boolean;
begin
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    select exists(select 1 from public.pharmacies where invite_code = code) into exists_already;
    exit when not exists_already;
  end loop;
  return code;
end;
$$;

-- Crée une pharmacie et rattache l'utilisateur courant comme admin
create or replace function public.create_pharmacy(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  code text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nom de pharmacie requis';
  end if;

  code := public.generate_invite_code();
  insert into public.pharmacies (name, invite_code)
  values (trim(p_name), code)
  returning id into new_id;

  insert into public.pharmacy_members (user_id, pharmacy_id, role)
  values (auth.uid(), new_id, 'admin');

  insert into public.pharmacy_planning (pharmacy_id, data, updated_by)
  values (new_id, '{}'::jsonb, auth.uid())
  on conflict (pharmacy_id) do nothing;

  return new_id;
end;
$$;

-- Rejoint une pharmacie via code d'invitation
create or replace function public.join_pharmacy_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ph_id uuid;
  admin_count int;
  assigned_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;

  select id into ph_id
  from public.pharmacies
  where invite_code = upper(trim(coalesce(p_invite_code, '')));

  if ph_id is null then
    raise exception 'Code d''invitation invalide';
  end if;

  if exists (
    select 1 from public.pharmacy_members
    where user_id = auth.uid() and pharmacy_id = ph_id
  ) then
    return ph_id;
  end if;

  select count(*) into admin_count
  from public.pharmacy_members
  where pharmacy_id = ph_id and role = 'admin';

  if admin_count = 0 then
    assigned_role := 'admin';
  else
    assigned_role := 'employee';
  end if;

  insert into public.pharmacy_members (user_id, pharmacy_id, role)
  values (auth.uid(), ph_id, assigned_role);

  return ph_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mise à jour handle_new_user (inscription avec pharmacie)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
  assigned_role public.user_role;
  ph_id uuid;
  ph_name text;
  invite text;
  new_ph_id uuid;
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

  ph_id := nullif(trim(new.raw_user_meta_data->>'pharmacy_id'), '')::uuid;
  ph_name := nullif(trim(new.raw_user_meta_data->>'pharmacy_name'), '');
  invite := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');

  if ph_name is not null then
    insert into public.pharmacies (name, invite_code)
    values (ph_name, public.generate_invite_code())
    returning id into new_ph_id;

    insert into public.pharmacy_members (user_id, pharmacy_id, role, employee_name)
    values (
      new.id,
      new_ph_id,
      'admin',
      nullif(trim(new.raw_user_meta_data->>'employee_name'), '')
    );

    insert into public.pharmacy_planning (pharmacy_id, data, updated_by)
    values (new_ph_id, '{}'::jsonb, new.id)
    on conflict (pharmacy_id) do nothing;

  elsif invite is not null then
    select id into new_ph_id from public.pharmacies where invite_code = upper(invite);
    if new_ph_id is not null then
      select count(*) into admin_count
      from public.pharmacy_members where pharmacy_id = new_ph_id and role = 'admin';

      insert into public.pharmacy_members (user_id, pharmacy_id, role, employee_name)
      values (
        new.id,
        new_ph_id,
        case when admin_count = 0 then 'admin'::public.user_role else 'employee'::public.user_role end,
        nullif(trim(new.raw_user_meta_data->>'employee_name'), '')
      );
    end if;

  elsif ph_id is not null then
    if exists (select 1 from public.pharmacies where id = ph_id) then
      select count(*) into admin_count
      from public.pharmacy_members where pharmacy_id = ph_id and role = 'admin';

      insert into public.pharmacy_members (user_id, pharmacy_id, role, employee_name)
      values (
        new.id,
        ph_id,
        case when admin_count = 0 then 'admin'::public.user_role else 'employee'::public.user_role end,
        nullif(trim(new.raw_user_meta_data->>'employee_name'), '')
      );
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- merge_staff_planning_shared : paramètre pharmacy_id
-- ---------------------------------------------------------------------------

create or replace function public.merge_staff_planning_shared(
  p_pharmacy_id uuid,
  conges_patch jsonb default '[]'::jsonb,
  planning_change_requests_patch jsonb default '[]'::jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  row_rec public.pharmacy_planning%rowtype;
  merged jsonb;
  cur_conges jsonb;
  cur_requests jsonb;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if not public.is_pharmacy_staff(p_pharmacy_id) then
    raise exception 'Accès réservé au personnel de cette pharmacie';
  end if;

  select * into row_rec
  from public.pharmacy_planning
  where pharmacy_id = p_pharmacy_id
  for update;

  if row_rec.pharmacy_id is null then
    insert into public.pharmacy_planning (pharmacy_id, data, updated_by)
    values (p_pharmacy_id, '{}'::jsonb, auth.uid());
    select * into row_rec
    from public.pharmacy_planning
    where pharmacy_id = p_pharmacy_id;
  end if;

  merged := coalesce(row_rec.data, '{}'::jsonb);
  cur_conges := coalesce(merged->'conges', '[]'::jsonb);
  cur_requests := coalesce(merged->'planningChangeRequests', '[]'::jsonb);

  merged := jsonb_set(
    jsonb_set(
      merged,
      '{conges}',
      public.jsonb_merge_array_by_id(cur_conges, coalesce(conges_patch, '[]'::jsonb)),
      true
    ),
    '{planningChangeRequests}',
    public.jsonb_merge_array_by_id(cur_requests, coalesce(planning_change_requests_patch, '[]'::jsonb)),
    true
  );

  update public.pharmacy_planning
  set data = merged, updated_by = auth.uid()
  where pharmacy_id = p_pharmacy_id;

  return now();
end;
$$;

grant execute on function public.create_pharmacy(text) to authenticated;
grant execute on function public.join_pharmacy_by_invite(text) to authenticated;
grant execute on function public.merge_staff_planning_shared(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------

create trigger pharmacies_updated_at
  before update on public.pharmacies
  for each row execute function public.set_updated_at();

create trigger pharmacy_members_updated_at
  before update on public.pharmacy_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.pharmacies enable row level security;
alter table public.pharmacy_members enable row level security;

-- Pharmacies : lecture publique (liste à l'inscription) et via RPC sécurisées pour création
drop policy if exists "pharmacies_select_authenticated" on public.pharmacies;

create policy "pharmacies_select_all"
  on public.pharmacies for select
  using (true);

-- Membres : voir les membres de ses pharmacies ; admin peut modifier les membres de sa pharmacie
create policy "pharmacy_members_select"
  on public.pharmacy_members for select
  using (
    user_id = auth.uid()
    or public.is_pharmacy_member(pharmacy_id)
  );

create policy "pharmacy_members_admin_update"
  on public.pharmacy_members for update
  using (public.is_pharmacy_admin(pharmacy_id))
  with check (public.is_pharmacy_admin(pharmacy_id));

create policy "pharmacy_members_admin_insert"
  on public.pharmacy_members for insert
  with check (public.is_pharmacy_admin(pharmacy_id));

-- Planning : remplacer les anciennes policies
drop policy if exists "planning_select_authenticated" on public.pharmacy_planning;
drop policy if exists "planning_insert_admin" on public.pharmacy_planning;
drop policy if exists "planning_update_admin" on public.pharmacy_planning;

create policy "planning_select_member"
  on public.pharmacy_planning for select
  using (public.is_pharmacy_member(pharmacy_id));

create policy "planning_insert_admin"
  on public.pharmacy_planning for insert
  with check (public.is_pharmacy_admin(pharmacy_id));

create policy "planning_update_admin"
  on public.pharmacy_planning for update
  using (public.is_pharmacy_admin(pharmacy_id))
  with check (public.is_pharmacy_admin(pharmacy_id));

-- Profils admin : limiter aux co-membres d'une pharmacie où l'utilisateur est admin
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1
      from public.pharmacy_members pm_admin
      join public.pharmacy_members pm_target on pm_admin.pharmacy_id = pm_target.pharmacy_id
      where pm_admin.user_id = auth.uid()
        and pm_admin.role = 'admin'
        and pm_target.user_id = profiles.id
    )
  );

create policy "profiles_admin_update"
  on public.profiles for update
  using (
    auth.uid() = id
    or exists (
      select 1
      from public.pharmacy_members pm_admin
      join public.pharmacy_members pm_target on pm_admin.pharmacy_id = pm_target.pharmacy_id
      where pm_admin.user_id = auth.uid()
        and pm_admin.role = 'admin'
        and pm_target.user_id = profiles.id
    )
  )
  with check (
    auth.uid() = id
    or exists (
      select 1
      from public.pharmacy_members pm_admin
      join public.pharmacy_members pm_target on pm_admin.pharmacy_id = pm_target.pharmacy_id
      where pm_admin.user_id = auth.uid()
        and pm_admin.role = 'admin'
        and pm_target.user_id = profiles.id
    )
  );

notify pgrst, 'reload schema';
