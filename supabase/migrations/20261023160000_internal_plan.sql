-- Área de administração dos planos (#208): o plano "Interno" da equipa DIGIK.
-- Sem limites e sem prazo, escondido dos clientes (is_public false). As
-- organizações da DIGIK (1 e 2) passam para ele.
--
-- Só ficam dois máximos, que são técnicos e não do plano: 10 mensagens por
-- corrente (a base de dados não aceita mais passos) e 50 MB por ficheiro (o
-- máximo do Storage do Supabase).
-- Correr no SQL Editor do Supabase ANTES do deploy. Pode ser corrido mais de
-- uma vez.

insert into public.plan (
  name, level, is_public, duration_days,
  max_users, max_assistants, max_assistant_instruction_chars,
  max_files_per_assistant, max_automations, max_scheduled_messages,
  max_tracked_links, max_daily_messages_per_channel,
  max_collaborator_weekly_messages, max_message_chars, max_files_per_message,
  max_file_size_mb, max_chain_messages
)
values (
  'Interno', 99, false, null,
  null, null, null,
  null, null, null,
  null, null,
  null, null, null,
  50, 10
)
on conflict (name) do update set
  level = excluded.level,
  is_public = excluded.is_public,
  duration_days = excluded.duration_days,
  max_users = excluded.max_users,
  max_assistants = excluded.max_assistants,
  max_assistant_instruction_chars = excluded.max_assistant_instruction_chars,
  max_files_per_assistant = excluded.max_files_per_assistant,
  max_automations = excluded.max_automations,
  max_scheduled_messages = excluded.max_scheduled_messages,
  max_tracked_links = excluded.max_tracked_links,
  max_daily_messages_per_channel = excluded.max_daily_messages_per_channel,
  max_collaborator_weekly_messages = excluded.max_collaborator_weekly_messages,
  max_message_chars = excluded.max_message_chars,
  max_files_per_message = excluded.max_files_per_message,
  max_file_size_mb = excluded.max_file_size_mb,
  max_chain_messages = excluded.max_chain_messages;

-- As organizações da DIGIK passam para o Interno.
update public.organization
set plan_id = (select id from public.plan where name = 'Interno'),
    plan_started_at = now()
where id in (1, 2);
