begin;

-- Kuri uses Supabase Auth for identity, but business data is owned by FastAPI.
-- Remove PostgREST policies that would allow browser users to access business data.
drop policy if exists chit_funds_delete_owner on public.chit_funds;
drop policy if exists chit_funds_insert_owner on public.chit_funds;
drop policy if exists chit_funds_select_org_or_member on public.chit_funds;
drop policy if exists chit_funds_update_owner on public.chit_funds;

drop policy if exists members_delete_organizer on public.members;
drop policy if exists members_insert_organizer on public.members;
drop policy if exists members_select_org_or_member on public.members;
drop policy if exists members_update_organizer on public.members;

drop policy if exists draw_results_delete_organizer on public.draw_results;
drop policy if exists draw_results_insert_organizer on public.draw_results;
drop policy if exists draw_results_select_org_or_member on public.draw_results;
drop policy if exists draw_results_update_organizer on public.draw_results;

drop policy if exists payments_delete_organizer on public.payments;
drop policy if exists payments_insert_organizer on public.payments;
drop policy if exists payments_select_org_or_member on public.payments;
drop policy if exists payments_update_org_or_member on public.payments;

-- Explicitly deny PostgREST's browser roles access to Kuri business tables.
revoke all on table public.chit_funds from anon, authenticated;
revoke all on table public.members from anon, authenticated;
revoke all on table public.draw_results from anon, authenticated;
revoke all on table public.payments from anon, authenticated;

-- Keep future public-schema tables from accidentally becoming browser-accessible.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

commit;
