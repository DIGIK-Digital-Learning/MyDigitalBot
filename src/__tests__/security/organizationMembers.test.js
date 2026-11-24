import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * #247 (1/4): vários utilizadores por organização. Os membros entram pelo
 * tipo de utilizador; o dono é sempre Administrador; uma rota sem permissão
 * declarada fica só para Administradores.
 */

const cookieJar = vi.hoisted(() => ({ viewAs: null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name) =>
      name === "mdb_view_as" && cookieJar.viewAs
        ? { value: cookieJar.viewAs }
        : undefined,
  }),
}));

vi.mock("@/utils/supabase/server", () => ({ default: vi.fn() }));
vi.mock("@/lib/db/admin", () => ({ getSupabaseAdminClient: vi.fn() }));

import { getCurrentMembership, requireOwnedOrg } from "@/lib/auth/guards";
import {
  ADMIN_ONLY,
  ALL_PERMISSIONS,
  ANY_MEMBER,
  PERMISSIONS,
  SYSTEM_TYPE_PERMISSIONS,
  accessAllows,
  normalizePermissions,
  resolveAccess,
  sendPermissionFor,
} from "@/lib/auth/permissions";

const ROOT = process.cwd();
const MIGRATION = path.join(
  ROOT,
  "supabase/migrations/20261124120000_organization_members.sql",
);

/* ---------------------------------------------------------------------- */
/* Base de dados simulada: organization e organization_member              */
/* ---------------------------------------------------------------------- */

function fakeAdmin({ orgs = [], members = [], missingTable = false } = {}) {
  return {
    from(table) {
      const filters = {};
      const chain = {
        select: () => chain,
        eq(column, value) {
          filters[column] = value;
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        async maybeSingle() {
          if (table === "organization") {
            const row = orgs.find((org) =>
              Object.entries(filters).every(([key, value]) => org[key] === value),
            );
            return { data: row ?? null, error: null };
          }

          if (table === "organization_member") {
            if (missingTable) {
              return { data: null, error: { code: "PGRST205" } };
            }
            const row = members.find(
              (member) =>
                member.auth_user_id === filters.auth_user_id &&
                (filters.organization_id == null ||
                  member.organization_id === filters.organization_id),
            );
            return { data: row ?? null, error: null };
          }

          if (table === "user_type") {
            const permissions = SYSTEM_TYPE_PERMISSIONS[filters.key];
            return {
              data: permissions ? { id: 50, key: filters.key, permissions } : null,
              error: null,
            };
          }

          throw new Error(`tabela inesperada: ${table}`);
        },
      };
      return chain;
    },
  };
}

const ORGS = [
  { id: 1, owner_user_id: "dono-1", plan_id: 7 },
  { id: 2, owner_user_id: "dono-2", plan_id: 7 },
];

function memberRow(authUserId, organizationId, key, permissions = []) {
  return {
    auth_user_id: authUserId,
    organization_id: organizationId,
    user_type_id: key === "admin" ? 1 : 99,
    user_type: { key, permissions },
  };
}

const MEMBERS = [
  memberRow("dono-1", 1, "admin"),
  memberRow("leitor-1", 1, "viewer", SYSTEM_TYPE_PERMISSIONS.viewer),
  memberRow("editor-1", 1, "editor", SYSTEM_TYPE_PERMISSIONS.editor),
  memberRow("custom-1", 1, null, ["links.create"]),
];

function authAs(userId, db = {}) {
  return {
    user: { id: userId },
    supabase: {},
    admin: fakeAdmin({ orgs: ORGS, members: MEMBERS, ...db }),
  };
}

async function statusFor(userId, orgId, permission, db) {
  const result = await requireOwnedOrg(orgId, {
    auth: authAs(userId, db),
    permission,
  });
  return result.error ? result.error.status : 200;
}

/* ---------------------------------------------------------------------- */

describe("catálogo das permissões", () => {
  it("cada ação traz o «Ver» da sua área e o que não existe sai", () => {
    expect(normalizePermissions(["users.delete", "não.existe"])).toEqual([
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_DELETE,
    ]);
    expect(normalizePermissions([PERMISSIONS.SEND_TEAMS])).toEqual([
      PERMISSIONS.SEND_TEAMS,
    ]);
  });

  it("o Editor não mexe nas Definições nem na Equipa, mas vê o histórico", () => {
    const editor = SYSTEM_TYPE_PERMISSIONS.editor;

    expect(editor).toContain(PERMISSIONS.SEND_WHATSAPP);
    expect(editor).toContain(PERMISSIONS.SETTINGS_AUDIT_VIEW);
    expect(editor).not.toContain(PERMISSIONS.SETTINGS_ORGANIZATION);
    expect(editor).not.toContain(PERMISSIONS.SETTINGS_INTEGRATIONS);
    expect(editor.some((p) => p.startsWith("team."))).toBe(false);
  });

  it("o Leitor só vê: não envia, não edita, não exporta", () => {
    const viewer = SYSTEM_TYPE_PERMISSIONS.viewer;

    expect(viewer).toContain(PERMISSIONS.ANALYTICS_VIEW);
    expect(viewer.every((p) => p.endsWith(".view"))).toBe(true);
  });

  it("a migração grava as mesmas listas que o código", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");

    for (const key of ["editor", "viewer"]) {
      const match = sql.match(new RegExp(`\\('${key}', '[^']+', array\\[([^\\]]*)\\]`));
      expect(match, `lista do ${key} na migração`).toBeTruthy();

      const fromSql = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      expect(fromSql).toEqual(SYSTEM_TYPE_PERMISSIONS[key]);
    }
  });

  it("o envio pede a permissão do canal", () => {
    expect(sendPermissionFor("whatsapp")).toBe(PERMISSIONS.SEND_WHATSAPP);
    expect(sendPermissionFor("teams")).toBe(PERMISSIONS.SEND_TEAMS);
    expect(sendPermissionFor("sms")).toEqual([
      PERMISSIONS.SEND_WHATSAPP,
      PERMISSIONS.SEND_TEAMS,
    ]);
  });
});

describe("quem pode o quê", () => {
  const admin = resolveAccess({ isOwner: true });
  const viewer = resolveAccess({
    member: { typeKey: "viewer", permissions: SYSTEM_TYPE_PERMISSIONS.viewer },
  });

  it("o dono é Administrador e pode tudo", () => {
    expect(admin.isAdmin).toBe(true);
    expect(admin.permissions).toEqual(ALL_PERMISSIONS);
    expect(accessAllows(admin)).toBe(true);
  });

  it("sem permissão declarada, só passa o Administrador", () => {
    expect(accessAllows(viewer)).toBe(false);
    expect(accessAllows(viewer, ADMIN_ONLY)).toBe(false);
    expect(accessAllows(viewer, ANY_MEMBER)).toBe(true);
  });

  it("numa lista basta ter uma", () => {
    expect(
      accessAllows(viewer, [PERMISSIONS.USERS_EDIT, PERMISSIONS.USERS_VIEW]),
    ).toBe(true);
    expect(accessAllows(viewer, PERMISSIONS.USERS_EDIT)).toBe(false);
  });

  it("quem não é membro nem dono não tem acesso", () => {
    expect(resolveAccess({})).toBeNull();
    expect(accessAllows(null, ANY_MEMBER)).toBe(false);
  });
});

describe("guard requireOwnedOrg com membros", () => {
  it("o dono continua a poder tudo, também nas rotas sem permissão", async () => {
    expect(await statusFor("dono-1", 1)).toBe(200);
    expect(await statusFor("dono-1", 1, PERMISSIONS.USERS_DELETE)).toBe(200);
  });

  it("o dono entra mesmo antes de a migração correr", async () => {
    expect(await statusFor("dono-2", 2, undefined, { missingTable: true })).toBe(200);
  });

  it("uma organização não vê os dados de outra", async () => {
    expect(await statusFor("dono-1", 2, ANY_MEMBER)).toBe(403);
    expect(await statusFor("leitor-1", 2, PERMISSIONS.ANALYTICS_VIEW)).toBe(403);
  });

  it("o Leitor vê, mas não edita nem entra nas rotas só de Administrador", async () => {
    expect(await statusFor("leitor-1", 1, PERMISSIONS.ANALYTICS_VIEW)).toBe(200);
    expect(await statusFor("leitor-1", 1, PERMISSIONS.ANALYTICS_EXPORT)).toBe(403);
    expect(await statusFor("leitor-1", 1, PERMISSIONS.USERS_EDIT)).toBe(403);
    expect(await statusFor("leitor-1", 1)).toBe(403);
  });

  it("o Editor envia, mas não muda as definições", async () => {
    expect(await statusFor("editor-1", 1, PERMISSIONS.SEND_TEAMS)).toBe(200);
    expect(await statusFor("editor-1", 1, PERMISSIONS.SETTINGS_ORGANIZATION)).toBe(403);
  });

  it("um tipo personalizado ganha o «Ver» das ações que tem", async () => {
    expect(await statusFor("custom-1", 1, PERMISSIONS.LINKS_VIEW)).toBe(200);
    expect(await statusFor("custom-1", 1, PERMISSIONS.MEDIA_VIEW)).toBe(403);
  });

  it("devolve o acesso para a rota poder decidir mais", async () => {
    const result = await requireOwnedOrg(1, {
      auth: authAs("leitor-1"),
      permission: ANY_MEMBER,
    });

    expect(result.access).toMatchObject({ isAdmin: false, typeKey: "viewer" });
    expect(result.orgId).toBe(1);
  });
});

describe("«Ver como» (como o «Experimentar como» dos planos)", () => {
  afterEach(() => {
    cookieJar.viewAs = null;
  });

  it("o Administrador a ver como Leitor fica só com o que o Leitor pode", async () => {
    cookieJar.viewAs = "viewer";

    expect(await statusFor("dono-1", 1, PERMISSIONS.ANALYTICS_VIEW)).toBe(200);
    expect(await statusFor("dono-1", 1, PERMISSIONS.USERS_EDIT)).toBe(403);
    expect(await statusFor("dono-1", 1)).toBe(403);
  });

  it("decidir pelo tipo verdadeiro deixa-o voltar a Administrador", async () => {
    cookieJar.viewAs = "viewer";

    const result = await requireOwnedOrg(1, {
      auth: authAs("dono-1"),
      realAccess: true,
    });

    expect(result.error).toBeUndefined();
    expect(result.realAccess.isAdmin).toBe(true);
  });

  it("só tira permissões: um Leitor com o cookie de Editor continua Leitor", async () => {
    cookieJar.viewAs = "editor";

    expect(await statusFor("leitor-1", 1, PERMISSIONS.USERS_EDIT)).toBe(403);
  });

  it("um valor estranho no cookie é ignorado", async () => {
    cookieJar.viewAs = "admin";
    expect(await statusFor("editor-1", 1)).toBe(403);

    cookieJar.viewAs = "qualquer";
    expect(await statusFor("dono-1", 1)).toBe(200);
  });

  it("a ver como Editor, a DIGIK deixa de ser administradora da plataforma", async () => {
    cookieJar.viewAs = "editor";

    const { access } = await getCurrentMembership(authAs("dono-1"));
    expect(access).toMatchObject({ isAdmin: false, viewingAs: "editor" });
  });
});

describe("a organização de quem tem a sessão", () => {
  it("vem da linha de membro e diz o tipo", async () => {
    const { org, access } = await getCurrentMembership(authAs("leitor-1"), "id, plan_id");

    expect(org).toEqual({ id: 1, plan_id: 7 });
    expect(access.isAdmin).toBe(false);
  });

  it("sem linha de membro, é a de que é dono", async () => {
    const { org, access } = await getCurrentMembership(authAs("dono-2"), "id");

    expect(org).toMatchObject({ id: 2 });
    expect(org).not.toHaveProperty("owner_user_id");
    expect(access.isAdmin).toBe(true);
  });

  it("quem não é de nenhuma não tem organização", async () => {
    expect(await getCurrentMembership(authAs("ninguem"))).toEqual({
      org: null,
      access: null,
    });
  });
});

/* ---------------------------------------------------------------------- */
/* Todas as rotas declaram a permissão                                     */
/* ---------------------------------------------------------------------- */

function routeFiles(dir = path.join(ROOT, "src/app/api")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.js" ? [full] : [];
  });
}

function guardCalls(source) {
  const calls = [];
  const re = /\b(requireOwnedOrg|requireOrgFor[A-Za-z]+)\(/g;
  let match;

  while ((match = re.exec(source))) {
    const lineStart = source.lastIndexOf("\n", match.index) + 1;
    if (/^\s*(import|export|\})/.test(source.slice(lineStart, match.index))) {
      continue;
    }

    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      if (source[end] === ")" && --depth === 0) break;
    }

    calls.push(source.slice(match.index, end + 1));
  }

  return calls;
}

/* Rotas sem sessão de cliente: crons, webhooks, páginas públicas. */
const NO_SESSION_ROUTES = [
  "assistants/[assistantId]/files",
  "auth/signout",
  "broadcast/read-chain/process-read",
  "contact",
  "cron/",
  "data",
  "messagebird",
  "teams/messages",
  "tracked-links/[token]",
];

describe("rotas da API", () => {
  const files = routeFiles();
  const relative = (file) =>
    path
      .relative(path.join(ROOT, "src/app/api"), file)
      .replace(/\\/g, "/")
      .replace(/\/?route\.js$/, "");

  it("cada chamada aos guards da organização declara a permissão", () => {
    const missing = files.flatMap((file) =>
      guardCalls(fs.readFileSync(file, "utf8"))
        .filter((call) => !/permission\s*:/.test(call))
        .map((call) => `${relative(file)}: ${call}`),
    );

    expect(missing).toEqual([]);
  });

  it("as permissões usadas existem no catálogo", () => {
    const unknown = files.flatMap((file) =>
      [...fs.readFileSync(file, "utf8").matchAll(/PERMISSIONS\.([A-Z_]+)/g)]
        .filter((m) => !(m[1] in PERMISSIONS))
        .map((m) => `${relative(file)}: ${m[1]}`),
    );

    expect(unknown).toEqual([]);
  });

  it("as rotas com sessão passam todas por um guard", () => {
    const unguarded = files
      .filter(
        (file) =>
          !NO_SESSION_ROUTES.some((prefix) => relative(file).startsWith(prefix)),
      )
      .filter(
        (file) =>
          !/\brequire(OwnedOrg|OrgFor[A-Za-z]+|PlatformAdmin|User)\(/.test(
            fs.readFileSync(file, "utf8"),
          ),
      )
      .map(relative);

    expect(unguarded).toEqual([]);
  });
});
