// Base descartável para validar a migração e os repositórios reais.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const candidates = [
  process.env.MDB_DOCKER_PATH,
  process.platform === "win32" &&
    join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "DockerDesktop",
      "resources",
      "bin",
      "docker.exe",
    ),
  process.platform === "win32" &&
    "C:/Program Files/Docker/Docker/resources/bin/docker.exe",
].filter(Boolean);
const docker = candidates.find((path) => existsSync(path)) || "docker";
const runId = randomUUID();
const prefix = "mdb-wa-gate-" + runId.slice(0, 8);
const label = "com.mydigitalbot.validation.run";
const network = prefix + "-network";
const database = prefix + "-db";
const rest = prefix + "-rest";
const password = randomBytes(24).toString("hex");
const jwtSecret = randomBytes(32).toString("hex");
let gateway;

function dockerRun(args, options = {}) {
  try {
    return execFileSync(docker, args, {
      cwd: root,
      encoding: "utf8",
      timeout: 300000,
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    throw new Error(
      "Docker " +
        args[0] +
        " falhou: " +
        String(error.stderr || "operação indisponível"),
    );
  }
}

function token(role) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  const unsigned = header + "." + payload;
  return (
    unsigned +
    "." +
    createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")
  );
}

async function ready(check, description) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* Ainda a arrancar. */
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error("Tempo excedido ao aguardar " + description);
}

function sql(source) {
  dockerRun(
    [
      "exec",
      "-i",
      database,
      "psql",
      "-U",
      "postgres",
      "-d",
      "mdb_gate_test",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: source },
  );
}

async function cleanup() {
  if (gateway) await new Promise((done) => gateway.close(done));
  for (const name of [rest, database]) {
    try {
      const [container] = JSON.parse(dockerRun(["inspect", name]));
      if (container.Config.Labels?.[label] !== runId)
        throw new Error("Etiqueta de propriedade inválida");
      if (container.Mounts.some((mount) => mount.Type === "bind"))
        throw new Error("Montagem de pasta do computador inesperada");
      dockerRun(["rm", "--force", "--volumes", name]);
    } catch (error) {
      if (!error.message.includes("No such object"))
        console.error("Limpeza: " + error.message);
    }
  }
  try {
    const [ownedNetwork] = JSON.parse(
      dockerRun(["network", "inspect", network]),
    );
    if (ownedNetwork.Labels?.[label] !== runId)
      throw new Error("Etiqueta de rede inválida");
    dockerRun(["network", "rm", network]);
  } catch (error) {
    if (!error.message.includes("not found"))
      console.error("Limpeza: " + error.message);
  }
}

try {
  const context = dockerRun(["context", "inspect"]);
  const endpoint = JSON.parse(context)[0].Endpoints.docker.Host;
  if (!endpoint.startsWith("npipe://") && !endpoint.startsWith("unix://")) {
    throw new Error("Este teste exige um motor Docker local.");
  }
  dockerRun(["info", "--format", "{{.OSType}}"]);
  console.log(
    "A preparar PostgreSQL 17 e PostgREST 13 num ambiente descartável...",
  );
  for (const image of ["postgres:17-alpine", "postgrest/postgrest:v13.0.7"]) {
    try {
      dockerRun(["image", "inspect", image]);
    } catch {
      dockerRun(["pull", image]);
    }
  }
  dockerRun(["network", "create", "--label", label + "=" + runId, network]);
  dockerRun([
    "run",
    "--detach",
    "--name",
    database,
    "--label",
    label + "=" + runId,
    "--network",
    network,
    "--env",
    "POSTGRES_PASSWORD=" + password,
    "--env",
    "POSTGRES_DB=mdb_gate_test",
    "postgres:17-alpine",
  ]);
  await ready(() => {
    dockerRun([
      "exec",
      database,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      "mdb_gate_test",
    ]);
    return true;
  }, "PostgreSQL");
  sql(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; " +
      "CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '" +
      password +
      "'; " +
      "GRANT anon, authenticated, service_role TO authenticator; " +
      "CREATE TABLE public.pending_outreach (id bigserial PRIMARY KEY, org_id bigint NOT NULL, user_id bigint NOT NULL, " +
      "payload jsonb, status text, expires_at timestamptz, template_message_id text, reply_message_id text, " +
      "message_chain_id text, message_chain_step_id text, message_chain_recipient_id text, message_chain_step_index integer, " +
      "created_at timestamptz DEFAULT clock_timestamp()); " +
      "GRANT ALL ON public.pending_outreach TO service_role; GRANT USAGE, SELECT ON SEQUENCE public.pending_outreach_id_seq TO service_role;",
  );
  const migration = readFileSync(
    join(root, "supabase/migrations/20261014120000_whatsapp_opening_gate.sql"),
    "utf8",
  );
  sql(migration);
  sql(migration);
  const security = dockerRun([
    "exec",
    database,
    "psql",
    "-U",
    "postgres",
    "-d",
    "mdb_gate_test",
    "-At",
    "-c",
    "SELECT relrowsecurity FROM pg_class WHERE oid='public.whatsapp_opening_gate'::regclass;",
  ]);
  if (security !== "t")
    throw new Error("RLS não ficou ativa depois da migração.");
  console.log(
    "Migração aplicada duas vezes; RLS ativa. A iniciar os testes reais de persistência...",
  );
  dockerRun([
    "run",
    "--detach",
    "--name",
    rest,
    "--label",
    label + "=" + runId,
    "--network",
    network,
    "--publish",
    "127.0.0.1::3000",
    "--env",
    "PGRST_DB_URI=postgres://authenticator:" +
      password +
      "@" +
      database +
      ":5432/mdb_gate_test",
    "--env",
    "PGRST_DB_SCHEMAS=public",
    "--env",
    "PGRST_DB_ANON_ROLE=anon",
    "--env",
    "PGRST_JWT_SECRET=" + jwtSecret,
    "postgrest/postgrest:v13.0.7",
  ]);
  const binding = dockerRun(["port", rest, "3000/tcp"]);
  if (!/^127\.0\.0\.1:\d+$/.test(binding))
    throw new Error("Porta de teste deve ser exclusivamente local.");
  const upstream = new URL("http://" + binding);
  await ready(
    async () =>
      (await fetch(upstream, { signal: AbortSignal.timeout(2000) })).ok,
    "PostgREST",
  );
  // Adaptador local do prefixo REST usado pelo SDK Supabase. Todas as queries
  // chegam ao PostgREST e PostgreSQL reais; não existem mocks de persistência.
  gateway = createServer((incoming, outgoing) => {
    if (!incoming.url.startsWith("/rest/v1/")) {
      outgoing.writeHead(404).end();
      return;
    }
    const proxy = httpRequest(
      {
        hostname: upstream.hostname,
        port: upstream.port,
        method: incoming.method,
        path: incoming.url.slice("/rest/v1".length),
        headers: { ...incoming.headers, host: upstream.host },
      },
      (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      },
    );
    proxy.on("error", () => outgoing.writeHead(502).end());
    incoming.pipe(proxy);
  });
  await new Promise((done) => gateway.listen(0, "127.0.0.1", done));
  const url = "http://127.0.0.1:" + gateway.address().port;
  const code = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--configLoader",
        "runner",
        "--reporter=verbose",
        "src/__tests__/integration/whatsappOpeningGate.db.test.js",
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          MDB_WA_GATE_DB_TEST: "1",
          NEXT_PUBLIC_SUPABASE_URL: url,
          SUPABASE_SERVICE_ROLE_KEY: token("service_role"),
          MDB_WA_GATE_ANON_KEY: token("anon"),
          MDB_WA_GATE_AUTH_KEY: token("authenticated"),
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (exitCode) => done(exitCode ?? 1));
  });
  process.exitCode = code;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
