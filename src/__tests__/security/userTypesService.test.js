import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/admin", () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/db/readAccess", () => ({ getRepositoryReadClient: vi.fn() }));

import {
  ALL_PERMISSIONS,
  canGrant,
  permissionsWithin,
  typePermissions,
} from "@/lib/auth/permissions";
import {
  createUserType,
  deleteUserType,
  listUserTypes,
  updateUserType,
} from "@/lib/services/team/userTypes.service";

/*
 * Definições → Tipos de utilizador (#247, parte 4/4). Regras de 24/11/2026:
 * o Administrador, o Editor e o Leitor não se editam; até 10 personalizados
 * por organização; não se apaga um tipo em uso; ninguém dá o que não tem.
 */

const ADMIN = { isAdmin: true, permissions: [...ALL_PERMISSIONS] };
const MANAGER = {
  isAdmin: false,
  permissions: ["team.view", "team.user_types", "users.view", "users.edit"],
};

const SYSTEM = [
  { id: 1, key: "admin", name: "Administrador", isSystem: true, permissions: [] },
  { id: 2, key: "editor", name: "Editor", isSystem: true, permissions: ["users.edit"] },
  { id: 3, key: "viewer", name: "Leitor", isSystem: true, permissions: ["users.view"] },
];
const CUSTOM = { id: 7, key: null, name: "RH", isSystem: false, permissions: ["users.view", "users.edit"] };

function orgAuth(access = ADMIN) {
  return { orgId: 188, org: { id: 188 }, user: { id: "me" }, access };
}

function makeDeps(overrides = {}) {
  return {
    listUserTypes: vi.fn(async () => [...SYSTEM, CUSTOM]),
    countMembersByType: vi.fn(async () => ({ 1: 1, 7: 0 })),
    countCustomTypes: vi.fn(async () => 1),
    getUserType: vi.fn(async (_org, id) => [...SYSTEM, CUSTOM].find((t) => t.id === Number(id)) ?? null),
    createUserType: vi.fn(async (input) => ({ id: 8, key: null, isSystem: false, ...input })),
    updateUserType: vi.fn(async (_org, id, input) => ({ id, ...input })),
    deleteUserType: vi.fn(async () => {}),
    recordAuditEvent: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("regras das permissões", () => {
  it("o Administrador tem tudo, mesmo sem lista", () => {
    expect(typePermissions(SYSTEM[0])).toEqual([...ALL_PERMISSIONS]);
  });

  it("cada ação traz o «Ver» da área", () => {
    expect(typePermissions(SYSTEM[1])).toEqual(["users.view", "users.edit"]);
  });

  it("ninguém dá o que não tem, e o Administrador só se dá entre Administradores", () => {
    expect(canGrant(ADMIN, SYSTEM[0])).toBe(true);
    expect(canGrant(MANAGER, SYSTEM[0])).toBe(false);
    expect(canGrant(MANAGER, CUSTOM)).toBe(true);
    expect(canGrant(MANAGER, { permissions: ["assistants.edit"] })).toBe(false);
    expect(permissionsWithin(MANAGER, ["users.view"])).toBe(true);
    expect(canGrant(null, CUSTOM)).toBe(false);
  });
});

describe("tipos de utilizador", () => {
  it("lista os predefinidos e os da organização, com quantas pessoas têm cada um", async () => {
    const types = await listUserTypes(orgAuth(MANAGER), makeDeps());
    expect(types.map((t) => [t.name, t.memberCount, t.canAssign])).toEqual([
      ["Administrador", 1, false],
      ["Editor", 0, true],
      ["Leitor", 0, true],
      ["RH", 0, true],
    ]);
  });

  it("cria um tipo, arruma as permissões e regista no histórico", async () => {
    const deps = makeDeps();
    await createUserType(orgAuth(), { name: "  Recursos   Humanos ", permissions: ["users.edit", "x.y"] }, deps);
    expect(deps.createUserType).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Recursos Humanos", permissions: ["users.view", "users.edit"] }),
    );
    expect(deps.recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "user_type.created", entityLabel: "Recursos Humanos" }),
    );
  });

  it("pede um nome e pelo menos uma permissão", async () => {
    await expect(createUserType(orgAuth(), { name: " ", permissions: ["users.view"] }, makeDeps()))
      .rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(createUserType(orgAuth(), { name: "RH", permissions: [] }, makeDeps()))
      .rejects.toMatchObject({ code: "NO_PERMISSIONS" });
  });

  it("não passa dos 10 personalizados", async () => {
    const deps = makeDeps({ countCustomTypes: vi.fn(async () => 10) });
    await expect(createUserType(orgAuth(), { name: "Novo", permissions: ["users.view"] }, deps))
      .rejects.toMatchObject({ code: "TYPE_LIMIT_REACHED", status: 409 });
    expect(deps.createUserType).not.toHaveBeenCalled();
  });

  it("não cria um tipo com permissões que quem cria não tem", async () => {
    const deps = makeDeps();
    await expect(
      createUserType(orgAuth(MANAGER), { name: "Mais", permissions: ["assistants.edit"] }, deps),
    ).rejects.toMatchObject({ code: "NOT_ALLOWED", status: 403 });
    expect(deps.createUserType).not.toHaveBeenCalled();
  });

  it("um nome repetido dá um erro claro", async () => {
    const taken = Object.assign(new Error("dup"), { code: "NAME_TAKEN" });
    const deps = makeDeps({ createUserType: vi.fn(async () => { throw taken; }) });
    await expect(createUserType(orgAuth(), { name: "RH", permissions: ["users.view"] }, deps))
      .rejects.toMatchObject({ code: "NAME_TAKEN", status: 409 });
  });

  it("os predefinidos não se editam nem se apagam", async () => {
    await expect(updateUserType(orgAuth(), { typeId: 2, name: "X", permissions: ["users.view"] }, makeDeps()))
      .rejects.toMatchObject({ code: "SYSTEM_LOCKED" });
    await expect(deleteUserType(orgAuth(), { typeId: 3 }, makeDeps()))
      .rejects.toMatchObject({ code: "SYSTEM_LOCKED" });
  });

  it("edita e regista o que entrou e o que saiu", async () => {
    const deps = makeDeps();
    await updateUserType(orgAuth(), { typeId: 7, name: "RH", permissions: ["users.view", "users.import"] }, deps);
    expect(deps.recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user_type.updated",
        details: { added: ["users.import"], removed: ["users.edit"] },
      }),
    );
  });

  it("não apaga um tipo que alguém tem", async () => {
    const deps = makeDeps({ countMembersByType: vi.fn(async () => ({ 7: 2 })) });
    await expect(deleteUserType(orgAuth(), { typeId: 7 }, deps))
      .rejects.toMatchObject({ code: "TYPE_IN_USE", status: 409 });
    expect(deps.deleteUserType).not.toHaveBeenCalled();
  });

  it("apaga um tipo sem ninguém e regista no histórico", async () => {
    const deps = makeDeps();
    await expect(deleteUserType(orgAuth(), { typeId: 7 }, deps)).resolves.toEqual({ deleted: true });
    expect(deps.recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "user_type.deleted", entityLabel: "RH" }),
    );
  });

  it("um tipo de outra organização não aparece", async () => {
    const deps = makeDeps({ getUserType: vi.fn(async () => null) });
    await expect(deleteUserType(orgAuth(), { typeId: 99 }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
