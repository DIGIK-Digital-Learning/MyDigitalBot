import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/admin", () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/db/readAccess", () => ({ getRepositoryReadClient: vi.fn() }));

import {
  changeTeamMemberType,
  inviteTeamMember,
  normalizeEmail,
  removeTeamMember,
  resendTeamInvite,
} from "@/lib/services/team/team.service";

/*
 * Definições → Equipa (#247, parte 3/4). Regras de 24/11/2026: máximo de
 * contas por plano, cada conta ocupa um lugar de colaborador, o dono é
 * sempre Administrador e cada pessoa só está numa organização.
 */

const OWNER = "owner-uuid";
const ME = "admin-uuid";
const TYPES = {
  admin: { id: 1, key: "admin" },
  editor: { id: 2, key: "editor" },
  viewer: { id: 3, key: "viewer" },
};

function makeOrgAuth(userId = OWNER) {
  return { orgId: 188, org: { id: 188, owner_user_id: OWNER }, user: { id: userId, email: "x@y.pt" } };
}

function makeDeps(overrides = {}) {
  return {
    getOrgLimits: vi.fn(async () => ({ limits: { teamMembers: 3, users: 100 } })),
    countMembers: vi.fn(async () => 1),
    countSeatsByOrg: vi.fn(async () => 10),
    getSystemUserType: vi.fn(async (key) => TYPES[key] ?? null),
    findAuthUserIdByEmail: vi.fn(async () => null),
    getMemberByAuthUser: vi.fn(async () => null),
    inviteAuthUser: vi.fn(async () => "new-uuid"),
    addMemberWithLimits: vi.fn(async () => ({ id: 9 })),
    deleteMemberAccount: vi.fn(async () => {}),
    getMember: vi.fn(),
    updateMemberType: vi.fn(async () => {}),
    getAuthUsersInfo: vi.fn(async (ids) =>
      Object.fromEntries(ids.map((id) => [id, { email: `${id}@local.test` }])),
    ),
    recordAuditEvent: vi.fn(async () => {}),
    ...overrides,
  };
}

const invite = (deps, input = {}) =>
  inviteTeamMember(
    makeOrgAuth(),
    { email: "Nova@Empresa.pt ", typeKey: "editor", redirectTo: "http://x/pt/reset/confirm", ...input },
    deps,
  );

describe("convidar para a Equipa", () => {
  it("normaliza o email e recusa os inválidos", async () => {
    expect(normalizeEmail("  Ana@Digik.PT ")).toBe("ana@digik.pt");
    expect(normalizeEmail("sem-arroba")).toBeNull();
    await expect(invite(makeDeps(), { email: "nope" })).rejects.toMatchObject({
      code: "INVALID_EMAIL",
    });
  });

  it("só aceita os tipos que existem", async () => {
    await expect(invite(makeDeps(), { typeKey: "dono" })).rejects.toMatchObject({
      code: "INVALID_TYPE",
    });
  });

  it("manda o email, acrescenta a conta e regista no histórico", async () => {
    const deps = makeDeps();
    const result = await invite(deps);

    expect(result).toEqual({ email: "nova@empresa.pt", typeKey: "editor", emailSent: true });
    expect(deps.inviteAuthUser).toHaveBeenCalledWith(
      "nova@empresa.pt",
      expect.objectContaining({ redirectTo: "http://x/pt/reset/confirm" }),
    );
    expect(deps.addMemberWithLimits).toHaveBeenCalledWith({
      organizationId: 188,
      authUserId: "new-uuid",
      userTypeId: 2,
      invitedBy: OWNER,
    });
    expect(deps.recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "team_member.invited", entityLabel: "nova@empresa.pt" }),
    );
  });

  it("recusa um email que já está noutra organização", async () => {
    const deps = makeDeps({
      findAuthUserIdByEmail: vi.fn(async () => "other-uuid"),
      getMemberByAuthUser: vi.fn(async () => ({ organizationId: 7 })),
    });
    await expect(invite(deps)).rejects.toMatchObject({ code: "IN_OTHER_ORGANIZATION", status: 409 });
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
  });

  it("recusa quem já está nesta Equipa", async () => {
    const deps = makeDeps({
      findAuthUserIdByEmail: vi.fn(async () => "uuid"),
      getMemberByAuthUser: vi.fn(async () => ({ organizationId: 188 })),
    });
    await expect(invite(deps)).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
  });

  it("não manda o email se já não houver contas livres no plano", async () => {
    const deps = makeDeps({ countMembers: vi.fn(async () => 3) });
    await expect(invite(deps)).rejects.toMatchObject({ code: "TEAM_LIMIT_REACHED" });
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
  });

  it("a conta da Equipa também precisa de um lugar de colaborador", async () => {
    const deps = makeDeps({ countSeatsByOrg: vi.fn(async () => 100) });
    await expect(invite(deps)).rejects.toMatchObject({ code: "USER_LIMIT_REACHED" });
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
  });

  it("sem limite no plano (Enterprise), convida sempre", async () => {
    const deps = makeDeps({
      getOrgLimits: vi.fn(async () => ({ limits: { teamMembers: null, users: null } })),
      countMembers: vi.fn(async () => 500),
      countSeatsByOrg: vi.fn(async () => 5000),
    });
    await expect(invite(deps)).resolves.toMatchObject({ emailSent: true });
  });

  it("se a base de dados recusar ao gravar, apaga a conta acabada de criar", async () => {
    const limitError = Object.assign(new Error("Team limit reached"), { code: "TEAM_LIMIT_REACHED" });
    const deps = makeDeps({ addMemberWithLimits: vi.fn(async () => { throw limitError; }) });

    await expect(invite(deps)).rejects.toMatchObject({ code: "TEAM_LIMIT_REACHED" });
    expect(deps.deleteMemberAccount).toHaveBeenCalledWith("new-uuid");
  });

  it("quem já tinha conta sem organização entra sem email novo", async () => {
    const deps = makeDeps({ findAuthUserIdByEmail: vi.fn(async () => "old-uuid") });
    const result = await invite(deps);

    expect(result.emailSent).toBe(false);
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
    expect(deps.addMemberWithLimits).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: "old-uuid" }),
    );
  });
});

describe("mudar o tipo e remover", () => {
  const member = (authUserId, typeKey = "viewer") => ({
    id: 5,
    authUserId,
    userTypeId: TYPES[typeKey].id,
    typeKey,
  });

  it("o dono é sempre Administrador: não se muda nem se remove", async () => {
    const deps = makeDeps({ getMember: vi.fn(async () => member(OWNER, "admin")) });
    await expect(
      changeTeamMemberType(makeOrgAuth(ME), { memberId: 5, typeKey: "viewer" }, deps),
    ).rejects.toMatchObject({ code: "OWNER_LOCKED", status: 403 });
    await expect(removeTeamMember(makeOrgAuth(ME), { memberId: 5 }, deps)).rejects.toMatchObject({
      code: "OWNER_LOCKED",
    });
    expect(deps.deleteMemberAccount).not.toHaveBeenCalled();
  });

  it("ninguém mexe na própria conta", async () => {
    const deps = makeDeps({ getMember: vi.fn(async () => member(ME, "admin")) });
    await expect(removeTeamMember(makeOrgAuth(ME), { memberId: 5 }, deps)).rejects.toMatchObject({
      code: "CANNOT_CHANGE_SELF",
    });
  });

  it("uma conta de outra organização não aparece", async () => {
    const deps = makeDeps({ getMember: vi.fn(async () => null) });
    await expect(removeTeamMember(makeOrgAuth(), { memberId: 5 }, deps)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("muda o tipo e regista de onde para onde", async () => {
    const deps = makeDeps({ getMember: vi.fn(async () => member("p-uuid", "viewer")) });
    await expect(
      changeTeamMemberType(makeOrgAuth(), { memberId: 5, typeKey: "editor" }, deps),
    ).resolves.toEqual({ changed: true });
    expect(deps.updateMemberType).toHaveBeenCalledWith(188, 5, 2);
    expect(deps.recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ details: { from: "viewer", to: "editor" } }),
    );
  });

  it("reenvia o convite a quem ainda não entrou e regista no histórico", async () => {
    const deps = makeDeps({ getMember: vi.fn(async () => member("p-uuid", "editor")) });
    await expect(
      resendTeamInvite(makeOrgAuth(), { memberId: 5, redirectTo: "http://x/pt/reset/confirm" }, deps),
    ).resolves.toEqual({ email: "p-uuid@local.test", emailSent: true });
    expect(deps.inviteAuthUser).toHaveBeenCalledWith(
      "p-uuid@local.test",
      expect.objectContaining({ redirectTo: "http://x/pt/reset/confirm" }),
    );
    expect(deps.recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "team_member.invite_resent" }),
    );
  });

  it("não reenvia a quem já entrou, nem ao dono", async () => {
    const signedIn = makeDeps({
      getMember: vi.fn(async () => member("p-uuid")),
      getAuthUsersInfo: vi.fn(async () => ({
        "p-uuid": { email: "p@local.test", lastSignInAt: "2026-11-25T10:00:00Z" },
      })),
    });
    await expect(
      resendTeamInvite(makeOrgAuth(), { memberId: 5 }, signedIn),
    ).rejects.toMatchObject({ code: "NOT_PENDING", status: 409 });
    expect(signedIn.inviteAuthUser).not.toHaveBeenCalled();

    const owner = makeDeps({ getMember: vi.fn(async () => member(OWNER, "admin")) });
    await expect(
      resendTeamInvite(makeOrgAuth(ME), { memberId: 5 }, owner),
    ).rejects.toMatchObject({ code: "OWNER_LOCKED" });
  });

  it("se o email falhar, avisa e não regista nada", async () => {
    const deps = makeDeps({
      getMember: vi.fn(async () => member("p-uuid")),
      inviteAuthUser: vi.fn(async () => {
        throw new Error("rate limit");
      }),
    });
    await expect(resendTeamInvite(makeOrgAuth(), { memberId: 5 }, deps)).rejects.toMatchObject({
      code: "INVITE_FAILED",
    });
    expect(deps.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("remover apaga a conta (só existia para esta Equipa)", async () => {
    const deps = makeDeps({ getMember: vi.fn(async () => member("p-uuid")) });
    await expect(removeTeamMember(makeOrgAuth(), { memberId: 5 }, deps)).resolves.toEqual({
      removed: true,
    });
    expect(deps.deleteMemberAccount).toHaveBeenCalledWith("p-uuid");
  });
});
