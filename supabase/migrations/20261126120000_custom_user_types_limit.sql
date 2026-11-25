-- Vários utilizadores (#247, parte 4/4): máximo de tipos de utilizador
-- personalizados por plano, editável na Administração → Planos.
--
-- Decidido a 24/11/2026: 10 por organização. Fica 10 em todos os planos; o
-- Interno (o da DIGIK) fica sem limite, como nos outros limites.
--
-- Executar manualmente no SQL Editor do Supabase, DEPOIS de
-- 20261124120000_organization_members.sql e 20261125120000_team_members.sql.
-- Pode ser corrida mais de uma vez.

alter table public.plan
  add column if not exists max_custom_user_types integer;

alter table public.plan
  drop constraint if exists plan_max_custom_user_types_positive;
alter table public.plan
  add constraint plan_max_custom_user_types_positive
  check (max_custom_user_types is null or max_custom_user_types > 0);

update public.plan
set max_custom_user_types = case name
  when 'Interno' then null
  else 10
end
where max_custom_user_types is null;
