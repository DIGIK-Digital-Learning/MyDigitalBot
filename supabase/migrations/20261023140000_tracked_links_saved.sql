-- Limite de links rastreados (#189): 100 links por organização (o
-- plan.max_tracked_links). Um link é um par nome + destino, como na
-- biblioteca do composer; usá-lo em vários envios continua a ser 1.
--
-- Até aqui a biblioteca era uma vista sobre tracked_link, que só tem linhas
-- depois de o envio sair (uma por destinatário). Passa a haver uma tabela com
-- uma linha por link, gravada logo ao enviar, agendar ou criar uma corrente,
-- e com a data em que o link foi eliminado. Eliminar só esconde o link da
-- biblioteca: os links já enviados e os cliques ficam.
-- Correr no SQL Editor do Supabase ANTES do deploy. Pode ser corrido mais de
-- uma vez.

create table if not exists public.tracked_link_saved (
  id uuid primary key default gen_random_uuid(),
  org_id integer not null
    references public.organization (id) on delete cascade,
  link_label text not null,
  destination_url text not null,
  -- A chave do envio mais recente (o composer usa-a ao reaproveitar).
  link_key text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  -- Preenchido quando o link é eliminado: deixa de aparecer e de contar.
  deleted_at timestamptz,
  unique (org_id, link_label, destination_url)
);

create index if not exists tracked_link_saved_org_active_idx
  on public.tracked_link_saved (org_id, last_used_at desc)
  where deleted_at is null;

-- Os links que já existem entram na tabela, um por nome e destino.
insert into public.tracked_link_saved (
  org_id, link_label, destination_url, link_key, created_at, last_used_at
)
select
  org_id::integer,
  link_label,
  destination_url,
  (array_agg(link_key order by created_at desc))[1],
  min(created_at),
  max(created_at)
from public.tracked_link
where link_label is not null
  and destination_url is not null
  and exists (select 1 from public.organization o where o.id = tracked_link.org_id)
group by org_id, link_label, destination_url
on conflict (org_id, link_label, destination_url) do nothing;

-- Leitura pela sessão do dono da organização, como nas outras tabelas
-- (migration 20261009130000_owner_session_reads). As escritas são do servidor.
alter table public.tracked_link_saved enable row level security;
revoke all on table public.tracked_link_saved from public, anon, authenticated;
grant select on table public.tracked_link_saved to authenticated;
grant select, insert, update, delete on table public.tracked_link_saved to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tracked_link_saved'
      and policyname = 'mdb_owner_session_read'
  ) then
    create policy mdb_owner_session_read on public.tracked_link_saved
      for select to authenticated
      using (exists (
        select 1 from public.organization o
        where o.id = tracked_link_saved.org_id
          and o.owner_user_id = (select auth.uid())
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tracked_link_saved'
      and policyname = 'mdb_owner_session_read_boundary'
  ) then
    create policy mdb_owner_session_read_boundary on public.tracked_link_saved
      as restrictive for select to authenticated
      using (exists (
        select 1 from public.organization o
        where o.id = tracked_link_saved.org_id
          and o.owner_user_id = (select auth.uid())
      ));
  end if;
end $$;

-- Grava os links de um envio, numa só operação e com um cadeado por
-- organização. `p_links` é uma lista de { label, destinationUrl, key }.
-- Os links que já estão ativos só atualizam a data; os novos (ou eliminados
-- e usados outra vez) só entram se couberem no limite: senão não grava nada.
-- p_limit null = sem limite.
-- Devolve { ok, used, limit, added }: `used` são os links ativos depois de
-- gravar (ou os atuais, quando não cabe) e `added` os que seriam novos.
create or replace function public.save_tracked_links(
  p_org_id integer,
  p_links jsonb,
  p_limit integer
)
returns jsonb
language plpgsql
security invoker
volatile
set search_path = ''
as $$
declare
  v_used integer;
  v_added integer;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'tracked links are restricted to service_role';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('tracked_link_saved:' || p_org_id)
  );

  create temporary table if not exists pg_temp.incoming_links (
    link_label text,
    destination_url text,
    link_key text
  ) on commit drop;
  truncate pg_temp.incoming_links;

  insert into pg_temp.incoming_links
  select distinct on (label, url) label, url, key
  from (
    select
      btrim(item ->> 'label') as label,
      btrim(item ->> 'destinationUrl') as url,
      nullif(btrim(item ->> 'key'), '') as key
    from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) as item
  ) links
  where label <> '' and url <> '';

  select count(*) into v_used
  from public.tracked_link_saved
  where org_id = p_org_id and deleted_at is null;

  select count(*) into v_added
  from pg_temp.incoming_links i
  where not exists (
    select 1 from public.tracked_link_saved s
    where s.org_id = p_org_id
      and s.link_label = i.link_label
      and s.destination_url = i.destination_url
      and s.deleted_at is null
  );

  if p_limit is not null and v_added > 0 and v_used + v_added > p_limit then
    return jsonb_build_object(
      'ok', false, 'used', v_used, 'limit', p_limit, 'added', v_added
    );
  end if;

  insert into public.tracked_link_saved (
    org_id, link_label, destination_url, link_key
  )
  select p_org_id, link_label, destination_url, link_key
  from pg_temp.incoming_links
  on conflict (org_id, link_label, destination_url) do update
  set deleted_at = null,
      last_used_at = now(),
      link_key = coalesce(excluded.link_key, public.tracked_link_saved.link_key);

  return jsonb_build_object(
    'ok', true, 'used', v_used + v_added, 'limit', p_limit, 'added', v_added
  );
end;
$$;

revoke all on function public.save_tracked_links(integer, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.save_tracked_links(integer, jsonb, integer)
  to service_role;

-- Elimina (esconde) um link da biblioteca, se não estiver numa mensagem que
-- ainda vai sair: uma agendada à espera ou uma corrente a decorrer.
-- Devolve { ok, reason }: reason "not_found", "scheduled" ou "chain".
create or replace function public.delete_tracked_link_saved(
  p_org_id integer,
  p_id uuid
)
returns jsonb
language plpgsql
security invoker
volatile
set search_path = ''
as $$
declare
  v_link public.tracked_link_saved;
  v_match jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'tracked links are restricted to service_role';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('tracked_link_saved:' || p_org_id)
  );

  select * into v_link
  from public.tracked_link_saved
  where id = p_id and org_id = p_org_id and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_match := jsonb_build_array(jsonb_build_object(
    'label', v_link.link_label,
    'destinationUrl', v_link.destination_url
  ));

  if exists (
    select 1 from public.scheduled_broadcast b
    where b.organization_id = p_org_id
      and b.status = 'queued'
      and b.payload -> 'trackedLinks' @> v_match
  ) then
    return jsonb_build_object('ok', false, 'reason', 'scheduled');
  end if;

  if exists (
    select 1
    from public.message_chain c
    join public.message_chain_step s on s.chain_id = c.id
    where c.organization_id = p_org_id
      and c.status in ('scheduled', 'processing', 'active')
      and s.payload -> 'trackedLinks' @> v_match
  ) then
    return jsonb_build_object('ok', false, 'reason', 'chain');
  end if;

  update public.tracked_link_saved
  set deleted_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'reason', null);
end;
$$;

revoke all on function public.delete_tracked_link_saved(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_tracked_link_saved(integer, uuid)
  to service_role;
