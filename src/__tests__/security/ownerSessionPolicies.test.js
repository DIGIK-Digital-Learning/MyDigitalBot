// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// PostgreSQL em memória: não usa credenciais, Supabase ou dados de produção.
const sql = readFileSync(resolve("supabase/migrations/20261009130000_owner_session_reads.sql"), "utf8");
const owner1 = "00000000-0000-0000-0000-000000000001";
const owner2 = "00000000-0000-0000-0000-000000000002";
const directTables = [
  "user", "assistant", "audit_log", "automation_rule", "automation_run",
  "scheduled_broadcast", "organization_messaging_feature", "question",
  "question_answer", "teams_installation",
];
let db;

async function asRole(role, owner, query) {
  await db.exec(`set role ${role}`);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    return (await db.query(query)).rows;
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon, service_role;
    create table organization (id integer primary key, owner_user_id uuid, theme text);
    insert into organization values (1, '${owner1}', 'azul'), (2, '${owner2}', 'verde');
  `);
  for (const table of directTables) {
    await db.exec(`create table "${table}" (id integer primary key, organization_id integer);
      insert into "${table}" values (1, 1), (2, 2);`);
  }
  await db.exec(`
    alter table assistant add column vector_store_id integer;
    update assistant set vector_store_id = id;
    create table pending_outreach (id integer, org_id integer);
    create table tracked_link (id integer, org_id integer, link_label text, destination_url text);
    create table tracked_link_event (id integer, tracked_link_id integer);
    create table user_assistant (id integer, user_id integer, assistant_id integer);
    create table user_tag (id integer, user_id integer, tag_id integer);
    create table tags (id integer, org_id integer);
    create table user_teams_conversation (id integer, user_id integer);
    create table thread (id integer, user_id integer, assistant_id integer);
    create table message (id integer, organization_id integer, thread_id integer, user_id integer, assistant_id integer);
    create table vector_store (id integer);
    create table file (id integer, vector_store_id integer);
    create table whatsapp_templates (id integer, org_id integer);
    create table webhook_event (id integer);
    create table auth_attempt_bucket (id integer);
    create table contact (id integer);
    insert into pending_outreach values (1, 1), (2, 2);
    insert into tracked_link values (1, 1, 'A', 'https://a.example'), (2, 2, 'B', 'https://b.example');
    insert into tracked_link_event values (1, 1), (2, 2);
    insert into tags values (1, 1), (2, 2);
    insert into user_assistant values (1, 1, 1), (2, 2, 2), (3, 1, 2);
    insert into user_tag values (1, 1, 1), (2, 2, 2), (3, 1, 2);
    insert into user_teams_conversation values (1, 1), (2, 2);
    insert into thread values (1, 1, 1), (2, 2, 2), (3, null, 1), (4, 1, 2);
    insert into message values
      (1, 1, 1, 1, 1), (2, 2, 2, 2, 2), (3, null, 1, 1, 1),
      (4, null, 3, null, 1), (5, null, null, 1, null),
      (6, null, null, null, 1), (7, null, 2, null, null), (8, null, null, null, null);
    insert into vector_store values (1), (2);
    insert into file values (1, 1), (2, 2);
    insert into whatsapp_templates values (1, 1), (2, 2), (3, null);
    insert into webhook_event values (1);
    insert into auth_attempt_bucket values (1);
    insert into contact values (1);
    alter table webhook_event enable row level security;
    alter table auth_attempt_bucket enable row level security;
    alter table contact enable row level security;
    create view tracked_link_library as select org_id, link_label, destination_url from tracked_link;
    grant all on all tables in schema public to service_role;
    grant select on all tables in schema public to authenticated, anon;
    -- Situação anterior: escritas em user/organization vedadas ao browser.
    grant update (theme) on organization to authenticated;
    -- Simula uma policy antiga demasiado permissiva: a nova fronteira deve prevalecer.
    alter table message enable row level security;
    create policy legacy_wide_read on message for select to authenticated using (true);
  `);
  await db.exec(sql);
}, 30000);

afterAll(async () => { await db?.close(); });

describe("Políticas de leitura por organização", () => {
  it("compila o SQL e permite executá-lo novamente sem duplicar políticas", async () => {
    await db.exec(sql);
    const { rows } = await db.query("select count(*)::int as total from pg_policies where policyname like 'mdb_owner_session_read%'");
    expect(rows[0].total).toBe(46);
  });

  it.each(directTables)("limita %s ao proprietário real, nas duas organizações", async (table) => {
    expect(await asRole("authenticated", owner1, `select id from "${table}" order by id`)).toEqual([{ id: 1 }]);
    expect(await asRole("authenticated", owner2, `select id from "${table}" order by id`)).toEqual([{ id: 2 }]);
  });

  it.each(["pending_outreach", "tracked_link", "tracked_link_event", "user_assistant", "user_tag", "tags", "user_teams_conversation", "vector_store", "file"])
    ("protege as relações de %s e rejeita associações a outra organização", async (table) => {
      expect(await asRole("authenticated", owner1, `select id from "${table}" order by id`)).toEqual([{ id: 1 }]);
      expect(await asRole("authenticated", owner2, `select id from "${table}" order by id`)).toEqual([{ id: 2 }]);
    });

  it("mantém conversas pessoais e de grupo, sem aceitar um assistente de outra organização", async () => {
    expect(await asRole("authenticated", owner1, "select id from thread order by id")).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it("protege mensagens antigas sem organization_id mesmo havendo uma policy permissiva", async () => {
    expect(await asRole("authenticated", owner1, "select id from message order by id"))
      .toEqual([1, 3, 4, 5, 6].map(id => ({ id })));
    expect(await asRole("authenticated", owner2, "select id from message order by id"))
      .toEqual([{ id: 2 }, { id: 7 }]);
  });

  it("a biblioteca de links respeita o RLS e não mostra destinos de outra organização", async () => {
    expect(await asRole("authenticated", owner1, "select org_id from tracked_link_library"))
      .toEqual([{ org_id: 1 }]);
  });

  it("mantém templates globais acessíveis juntamente com os da própria organização", async () => {
    expect(await asRole("authenticated", owner1, "select id from whatsapp_templates order by id"))
      .toEqual([{ id: 1 }, { id: 3 }]);
  });

  it.each(["webhook_event", "auth_attempt_bucket", "contact"])("mantém %s reservado ao servidor", async (table) => {
    expect(await asRole("authenticated", owner1, `select * from "${table}"`)).toEqual([]);
    expect(await asRole("service_role", "", `select * from "${table}"`)).toEqual([{ id: 1 }]);
  });

  it("não concede escrita direta de utilizadores ou campos protegidos da organização", async () => {
    await expect(asRole("authenticated", owner1, "insert into \"user\" values (3, 1)"))
      .rejects.toMatchObject({ code: "42501" });
    await expect(asRole("authenticated", owner1, "update organization set owner_user_id = null where id = 1"))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("sessões anónimas e utilizadores sem organização não recebem mensagens", async () => {
    expect(await asRole("anon", "", "select * from message")).toEqual([]);
    expect(await asRole("authenticated", "00000000-0000-0000-0000-000000000099", "select * from message")).toEqual([]);
  });

  it("a service role continua a poder processar dados de ambas as organizações", async () => {
    expect(await asRole("service_role", "", "select id from \"user\" order by id"))
      .toEqual([{ id: 1 }, { id: 2 }]);
  });
});
