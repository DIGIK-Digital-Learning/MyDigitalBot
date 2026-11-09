-- Limites configuráveis por plano (#183).
--
-- A tabela plan já existia só no Supabase (id, name, max_users, is_public,
-- created_at) com 3 planos: Free (10 utilizadores), Pro (50) e Enterprise (sem
-- limite). Esta migration:
-- 1. junta a plan uma coluna por limite e a duração do plano (null = sem limite);
-- 2. passa a 5 planos, do Plano 0 ao Plano 4, reaproveitando as linhas que
--    existem (Free -> Demo, Pro -> Pro, Enterprise -> Enterprise);
-- 3. junta a organization a data em que o plano começou (para a demo de 7 dias);
-- 4. põe as organizações 1 e 2 (contas da equipa) no Enterprise e as restantes
--    na Demo, e faz da Demo o plano das organizações novas;
-- 5. fecha a plan ao browser: só o servidor (service role) a lê e altera.
--
-- A função create_user_with_plan_limit não muda: continua a ler plan.max_users.
-- Pode ser corrida mais de uma vez: os passos de dados só mexem em organizações
-- que ainda não têm plan_started_at.

-- 1. Limites e duração --------------------------------------------------------

alter table public.plan
  add column if not exists level smallint,
  add column if not exists duration_days integer,
  add column if not exists max_assistants integer,
  add column if not exists max_assistant_instruction_chars integer,
  add column if not exists max_files_per_assistant integer,
  add column if not exists max_automations integer,
  add column if not exists max_scheduled_messages integer,
  add column if not exists max_tracked_links integer,
  add column if not exists max_daily_messages_per_channel integer,
  add column if not exists max_message_chars integer,
  add column if not exists max_files_per_message integer,
  add column if not exists max_file_size_mb integer,
  add column if not exists max_chain_messages integer;

-- Cada limite é vazio (sem limite) ou maior do que zero, como o max_users.
do $$
declare
  col text;
begin
  foreach col in array array[
    'duration_days', 'max_assistants', 'max_assistant_instruction_chars',
    'max_files_per_assistant', 'max_automations', 'max_scheduled_messages',
    'max_tracked_links', 'max_daily_messages_per_channel', 'max_message_chars',
    'max_files_per_message', 'max_file_size_mb', 'max_chain_messages'
  ] loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.plan'::regclass and conname = 'plan_' || col || '_check'
    ) then
      execute format(
        'alter table public.plan add constraint %I check (%I is null or %I > 0)',
        'plan_' || col || '_check', col, col
      );
    end if;
  end loop;
end $$;

-- 2. Os 5 planos ----------------------------------------------------------------

-- O Free passa a Demo (fica com o id 1, que será o plano das organizações novas).
update public.plan set name = 'Demo' where id = 1 and name = 'Free';

-- O contador de ids pode estar atrás dos ids que já existem (se os planos foram
-- criados com o id escrito à mão); acerta-o antes de criar os planos novos.
select setval(
  pg_get_serial_sequence('public.plan', 'id'),
  (select coalesce(max(id), 1) from public.plan)
);

-- Para já, todos os planos têm os mesmos limites; mudam os utilizadores, os
-- assistentes da Demo e a duração da Demo.
insert into public.plan (
  name, level, max_users, duration_days, max_assistants,
  max_assistant_instruction_chars, max_files_per_assistant, max_automations,
  max_scheduled_messages, max_tracked_links, max_daily_messages_per_channel,
  max_message_chars, max_files_per_message, max_file_size_mb, max_chain_messages,
  is_public
)
values
  ('Demo',       0, 3,    7,    1,  5000, 5, 20, 100, 100, 10, 1500, 5, 50, 10, true),
  ('Starter',    1, 100,  null, 20, 5000, 5, 20, 100, 100, 10, 1500, 5, 50, 10, true),
  ('Growth',     2, 500,  null, 20, 5000, 5, 20, 100, 100, 10, 1500, 5, 50, 10, true),
  ('Pro',        3, 1000, null, 20, 5000, 5, 20, 100, 100, 10, 1500, 5, 50, 10, true),
  ('Enterprise', 4, null, null, 20, 5000, 5, 20, 100, 100, 10, 1500, 5, 50, 10, true)
on conflict (name) do update set
  level = excluded.level,
  max_users = excluded.max_users,
  duration_days = excluded.duration_days,
  max_assistants = excluded.max_assistants,
  max_assistant_instruction_chars = excluded.max_assistant_instruction_chars,
  max_files_per_assistant = excluded.max_files_per_assistant,
  max_automations = excluded.max_automations,
  max_scheduled_messages = excluded.max_scheduled_messages,
  max_tracked_links = excluded.max_tracked_links,
  max_daily_messages_per_channel = excluded.max_daily_messages_per_channel,
  max_message_chars = excluded.max_message_chars,
  max_files_per_message = excluded.max_files_per_message,
  max_file_size_mb = excluded.max_file_size_mb,
  max_chain_messages = excluded.max_chain_messages,
  is_public = excluded.is_public;

-- O nível ordena os planos (Plano 0 a Plano 4) e não se repete.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.plan'::regclass and conname = 'plan_level_key'
  ) then
    alter table public.plan add constraint plan_level_key unique (level);
  end if;
end $$;

-- 3. Quando começou o plano de cada organização ---------------------------------

-- Sem valor por omissão por agora: as organizações que já existem ficam vazias
-- até ao passo 4, que é o que torna os passos de dados seguros de repetir.
alter table public.organization
  add column if not exists plan_started_at timestamptz;

-- 4. Planos das organizações que já existem -------------------------------------

update public.organization
set plan_id = (select id from public.plan where name = 'Enterprise'),
    plan_started_at = now()
where id in (1, 2) and plan_started_at is null;

update public.organization
set plan_id = (select id from public.plan where name = 'Demo'),
    plan_started_at = now()
where id not in (1, 2) and plan_started_at is null;

-- As organizações novas começam na Demo (id 1), a contar do momento da criação.
alter table public.organization alter column plan_id set default 1;
alter table public.organization alter column plan_started_at set default now();

-- 5. Só o servidor lê e altera os planos ----------------------------------------

-- Antes, qualquer utilizador com sessão (authenticated) podia inserir, alterar e
-- apagar planos pela Data API. A aplicação lê-os com service role, que não é
-- afetada por estas regras.
revoke all on table public.plan from anon, authenticated;
alter table public.plan enable row level security;
