import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  CUSTOM_USER_TYPE_LIMIT,
  canGrant,
  normalizePermissions,
  permissionsWithin,
  typePermissions,
} from "@/lib/auth/permissions";
import * as userTypesRepo from "@/lib/repos/userTypes.repo";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { TeamError } from "@/lib/services/team/team.service";

/*
 * Definições → Tipos de utilizador (#247, parte 4/4). Regras de 24/11/2026:
 *   - o Administrador não se edita nem se apaga;
 *   - o Editor e o Leitor não se editam, mas duplicam-se (no ecrã);
 *   - cada organização tem até 10 tipos personalizados;
 *   - não se apaga um tipo que alguém tem;
 *   - ninguém dá o que não tem.
 */

const defaultDeps = { ...userTypesRepo, recordAuditEvent };

const NAME_MAX = 80;

function cleanName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name && name.length <= NAME_MAX ? name : null;
}

/* O que se mostra de cada tipo, já com o que quem pede pode fazer com ele. */
function present(type, access, memberCount = 0) {
  const grantable = canGrant(access, type);
  return {
    id: type.id,
    key: type.key,
    name: type.name,
    isSystem: type.isSystem,
    permissions: typePermissions(type),
    memberCount,
    /* Pode dar este tipo a alguém, e editá-lo ou apagá-lo se for personalizado. */
    canAssign: grantable,
  };
}

export async function listUserTypes(orgAuth, deps = defaultDeps) {
  const [types, counts] = await Promise.all([
    deps.listUserTypes(orgAuth.orgId),
    deps.countMembersByType(orgAuth.orgId),
  ]);
  return types.map((type) => present(type, orgAuth.access, counts[type.id] ?? 0));
}

/* Valida o nome e as permissões de um tipo novo ou editado. */
function validateInput(orgAuth, { name: rawName, permissions: rawPermissions }) {
  const name = cleanName(rawName);
  if (!name) throw new TeamError("INVALID_NAME");

  const permissions = normalizePermissions(
    Array.isArray(rawPermissions) ? rawPermissions : [],
  );
  if (permissions.length === 0) throw new TeamError("NO_PERMISSIONS");

  if (!permissionsWithin(orgAuth.access, permissions)) {
    throw new TeamError("NOT_ALLOWED", 403);
  }

  return { name, permissions };
}

export async function createUserType(orgAuth, input, deps = defaultDeps) {
  const { name, permissions } = validateInput(orgAuth, input);

  const count = await deps.countCustomTypes(orgAuth.orgId);
  if (count >= CUSTOM_USER_TYPE_LIMIT) throw new TeamError("TYPE_LIMIT_REACHED", 409);

  const type = await createOrMap(() =>
    deps.createUserType({
      organizationId: orgAuth.orgId,
      name,
      permissions,
      createdBy: orgAuth.user?.id ?? null,
    }),
  );

  await deps.recordAuditEvent(orgAuth, {
    action: AUDIT_ACTIONS.USER_TYPE_CREATED,
    entityId: type.id,
    entityLabel: name,
    details: { permissions: permissions.length },
  });

  return present(type, orgAuth.access, 0);
}

/* Um personalizado desta organização que quem pede pode mexer. */
async function editableTypeOrFail(orgAuth, typeId, deps) {
  const type = await deps.getUserType(orgAuth.orgId, typeId);
  if (!type) throw new TeamError("NOT_FOUND", 404);
  if (type.isSystem) throw new TeamError("SYSTEM_LOCKED", 403);
  if (!canGrant(orgAuth.access, type)) throw new TeamError("NOT_ALLOWED", 403);
  return type;
}

export async function updateUserType(orgAuth, { typeId, ...input }, deps = defaultDeps) {
  const current = await editableTypeOrFail(orgAuth, typeId, deps);
  const { name, permissions } = validateInput(orgAuth, input);

  const updated = await createOrMap(() =>
    deps.updateUserType(orgAuth.orgId, current.id, { name, permissions }),
  );
  if (!updated) throw new TeamError("NOT_FOUND", 404);

  const before = new Set(typePermissions(current));
  const after = new Set(permissions);
  await deps.recordAuditEvent(orgAuth, {
    action: AUDIT_ACTIONS.USER_TYPE_UPDATED,
    entityId: current.id,
    entityLabel: name,
    details: {
      ...(current.name !== name ? { renamedFrom: current.name } : {}),
      added: permissions.filter((p) => !before.has(p)),
      removed: [...before].filter((p) => !after.has(p)),
    },
  });

  return { updated: true };
}

export async function deleteUserType(orgAuth, { typeId }, deps = defaultDeps) {
  const type = await editableTypeOrFail(orgAuth, typeId, deps);

  const counts = await deps.countMembersByType(orgAuth.orgId);
  if ((counts[type.id] ?? 0) > 0) throw new TeamError("TYPE_IN_USE", 409);

  await createOrMap(() => deps.deleteUserType(orgAuth.orgId, type.id));

  await deps.recordAuditEvent(orgAuth, {
    action: AUDIT_ACTIONS.USER_TYPE_DELETED,
    entityId: type.id,
    entityLabel: type.name,
    details: {},
  });

  return { deleted: true };
}

/* Os erros com código do repositório (nome repetido, tipo em uso) passam a TeamError. */
async function createOrMap(run) {
  try {
    return await run();
  } catch (error) {
    if (error?.code === "NAME_TAKEN" || error?.code === "TYPE_IN_USE") {
      throw new TeamError(error.code, 409);
    }
    throw error;
  }
}
