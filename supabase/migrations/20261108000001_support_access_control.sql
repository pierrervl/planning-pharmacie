-- Accès du support technique : chaque pharmacie peut le refuser.
-- Quand support_access_blocked = true :
--   * les comptes super-admin (app_config.super_admin_emails) sont retirés de la pharmacie ;
--   * la base refuse qu'ils y soient ajoutés à nouveau (code d'invitation ou ajout manuel).

alter table public.pharmacies
  add column if not exists support_access_blocked boolean not null default false;

-- Vrai si l'utilisateur donné est un compte du support technique.
create or replace function public.is_support_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u,
         public.app_config c,
         jsonb_array_elements_text(c.value) e
    where u.id = p_user_id
      and c.key = 'super_admin_emails'
      and lower(trim(e)) = lower(trim(coalesce(u.email, '')))
  );
$$;

-- Garde-fou : aucune adhésion du support dans une pharmacie qui l'a refusé.
create or replace function public.enforce_support_access_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
       select 1 from public.pharmacies
       where id = new.pharmacy_id and support_access_blocked
     )
     and public.is_support_user(new.user_id) then
    raise exception 'Cette pharmacie a refusé l''accès du support technique';
  end if;
  return new;
end;
$$;

drop trigger if exists pharmacy_members_support_block on public.pharmacy_members;
create trigger pharmacy_members_support_block
  before insert or update of pharmacy_id, user_id on public.pharmacy_members
  for each row execute function public.enforce_support_access_block();

-- Réglage par l'administrateur de la pharmacie.
create or replace function public.set_support_access_blocked(p_pharmacy_id uuid, p_blocked boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if not public.is_pharmacy_admin(p_pharmacy_id) then
    raise exception 'Réservé aux administrateurs de la pharmacie';
  end if;
  if coalesce(p_blocked, false) and public.is_support_user(auth.uid()) then
    raise exception 'Le compte support ne peut pas bloquer son propre accès';
  end if;

  update public.pharmacies
  set support_access_blocked = coalesce(p_blocked, false)
  where id = p_pharmacy_id;

  if coalesce(p_blocked, false) then
    delete from public.pharmacy_members
    where pharmacy_id = p_pharmacy_id
      and public.is_support_user(user_id);
  end if;

  return coalesce(p_blocked, false);
end;
$$;

revoke all on function public.set_support_access_blocked(uuid, boolean) from public;
grant execute on function public.set_support_access_blocked(uuid, boolean) to authenticated;
revoke all on function public.is_support_user(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
