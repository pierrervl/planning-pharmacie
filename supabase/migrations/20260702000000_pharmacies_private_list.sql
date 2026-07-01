-- Ne plus exposer la liste des pharmacies publiquement.
-- Seuls les membres peuvent lire les pharmacies auxquelles ils appartiennent.

drop policy if exists "pharmacies_select_all" on public.pharmacies;
drop policy if exists "pharmacies_select_authenticated" on public.pharmacies;

create policy "pharmacies_select_member"
  on public.pharmacies for select
  using (public.is_pharmacy_member(id));

notify pgrst, 'reload schema';
