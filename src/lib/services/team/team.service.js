import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import { SYSTEM_USER_TYPES } from "@/lib/auth/permissions";
import * as membersRepo from "@/lib/repos/organizationMembers.repo";
import { countSeatsByOrg } from "@/lib/repos/user.repo";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { getOrgLimits, hasRoomFor } from "@/lib/services/plans/planLimits";

/*
 * Definições → Equipa (#247, parte 3/4). Regras decididas a 24/11/2026:
 *   - cada plano tem um máximo de contas (limits.teamMembers);
 *   - cada conta ocupa também um lugar de colaborador (limits.users);
 *   - o dono conta nos dois e é sempre Administrador;
 *   - cada pessoa só está numa organização;
 *   - o convite é um email com link, e a pessoa escolhe a palavra-passe.
 */

/* Tipos que se podem dar a alguém. Os personalizados chegam na parte 4/4. */
export const ASSIGNABLE_TYPES = Object.freeze([
  SYSTEM_USER_TYPES.ADMIN,
  SYSTEM_USER_TYPES.EDITOR,
  SYSTEM_USER_TYPES.VIEWER,
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class TeamError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

const defaultDeps = {
  ...membersRepo,
  countSeatsByOrg,
  getOrgLimits,
  recordAuditEvent,
};

/* Quanto está gasto e o máximo de cada limite, para o ecrã e para recusar. */
export async function getTeamLimits(orgId, deps = defaultDeps) {
  const [{ limits }, teamMembers, seats] = await Promise.all([
    deps.getOrgLimits(orgId),
    deps.countMembers(orgId),
    deps.countSeatsByOrg(orgId),
  ]);

  return {
    limits: { teamMembers: limits.teamMembers ?? null, users: limits.users ?? null },
    usage: { teamMembers, users: seats },
  };
}

export async function listTeam(orgAuth, deps = defaultDeps) {
  const members = await deps.listMembers(orgAuth.orgId);
  const info = await deps.getAuthUsersInfo(members.map((m) => m.authUserId));
  const ownerId = orgAuth.org?.owner_user_id ?? null;

  return members.map((member) => {
    const account = info[member.authUserId] ?? {};
    return {
      id: member.id,
      email: account.email ?? null,
      typeKey: member.typeKey,
      typeName: member.typeName,
      isOwner: member.authUserId === ownerId,
      isYou: member.authUserId === orgAuth.user?.id,
      /* Ainda não aceitou o convite: nunca entrou. */
      pending: !account.lastSignInAt,
      invitedAt: account.invitedAt ?? member.createdAt,
      lastSignInAt: account.lastSignInAt ?? null,
    };
  });
}

async function systemTypeOrFail(typeKey, deps) {
  if (!ASSIGNABLE_TYPES.includes(typeKey)) throw new TeamError("INVALID_TYPE");
  const type = await deps.getSystemUserType(typeKey);
  if (!type) throw new TeamError("INVALID_TYPE");
  return type;
}

/*
 * Convida uma pessoa. Verifica os limites antes de mandar o email (para
 * ninguém receber um convite que depois falha); a base de dados volta a
 * verificar ao gravar, e se recusar a conta acabada de criar é apagada.
 */
export async function inviteTeamMember(
  orgAuth,
  { email: rawEmail, typeKey, redirectTo },
  deps = defaultDeps,
) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new TeamError("INVALID_EMAIL");
  const type = await systemTypeOrFail(typeKey, deps);

  const existingId = await deps.findAuthUserIdByEmail(email);
  if (existingId) {
    const membership = await deps.getMemberByAuthUser(existingId);
    if (membership) {
      throw new TeamError(
        membership.organizationId === Number(orgAuth.orgId)
          ? "ALREADY_MEMBER"
          : "IN_OTHER_ORGANIZATION",
        409,
      );
    }
  }

  const { limits, usage } = await getTeamLimits(orgAuth.orgId, deps);
  if (!hasRoomFor(limits.teamMembers, usage.teamMembers)) {
    throw new TeamError("TEAM_LIMIT_REACHED", 409);
  }
  if (!hasRoomFor(limits.users, usage.users)) {
    throw new TeamError("USER_LIMIT_REACHED", 409);
  }

  /* Já tem conta, mas sem organização: entra com a palavra-passe que tem. */
  const authUserId =
    existingId ??
    (await deps.inviteAuthUser(email, {
      redirectTo,
      data: { invited_to_organization: Number(orgAuth.orgId) },
    }));

  if (!authUserId) throw new TeamError("INVITE_FAILED", 502);

  try {
    await deps.addMemberWithLimits({
      organizationId: orgAuth.orgId,
      authUserId,
      userTypeId: type.id,
      invitedBy: orgAuth.user?.id ?? null,
    });
  } catch (error) {
    if (!existingId) {
      await deps.deleteMemberAccount(authUserId).catch(() => {});
    }
    if (error?.code) throw new TeamError(error.code, 409);
    throw error;
  }

  await deps.recordAuditEvent(orgAuth, {
    action: AUDIT_ACTIONS.TEAM_MEMBER_INVITED,
    entityLabel: email,
    details: { typeKey, existingAccount: Boolean(existingId) },
  });

  return { email, typeKey, emailSent: !existingId };
}

/* O dono é sempre Administrador e ninguém mexe na própria conta. */
async function editableMemberOrFail(orgAuth, memberId, deps) {
  const member = await deps.getMember(orgAuth.orgId, memberId);
  if (!member) throw new TeamError("NOT_FOUND", 404);
  if (member.authUserId === orgAuth.org?.owner_user_id) {
    throw new TeamError("OWNER_LOCKED", 403);
  }
  if (member.authUserId === orgAuth.user?.id) {
    throw new TeamError("CANNOT_CHANGE_SELF", 403);
  }
  return member;
}

async function emailOf(authUserId, deps) {
  const info = await deps.getAuthUsersInfo([authUserId]);
  return info[authUserId]?.email ?? null;
}

export async function changeTeamMemberType(
  orgAuth,
  { memberId, typeKey },
  deps = defaultDeps,
) {
  const member = await editableMemberOrFail(orgAuth, memberId, deps);
  const type = await systemTypeOrFail(typeKey, deps);
  if (member.userTypeId === type.id) return { changed: false };

  await deps.updateMemberType(orgAuth.orgId, member.id, type.id);
  await deps.recordAuditEvent(orgAuth, {
    action: AUDIT_ACTIONS.TEAM_MEMBER_TYPE_CHANGED,
    entityId: member.id,
    entityLabel: await emailOf(member.authUserId, deps),
    details: { from: member.typeKey, to: typeKey },
  });

  return { changed: true };
}

/*
 * Volta a mandar o email do convite. Os links do Supabase expiram (1 hora
 * por omissão), e sem isto o administrador tinha de remover a pessoa e
 * convidá-la de novo. Só serve para quem ainda nunca entrou.
 */
export async function resendTeamInvite(
  orgAuth,
  { memberId, redirectTo },
  deps = defaultDeps,
) {
  const member = await editableMemberOrFail(orgAuth, memberId, deps);
  const info = await deps.getAuthUsersInfo([member.authUserId]);
  const account = info[member.authUserId];
  if (!account?.email) throw new TeamError("NOT_FOUND", 404);
  if (account.lastSignInAt) throw new TeamError("NOT_PENDING", 409);

  try {
    await deps.inviteAuthUser(account.email, {
      redirectTo,
      data: { invited_to_organization: Number(orgAuth.orgId) },
    });
  } catch {
    throw new TeamError("INVITE_FAILED", 502);
  }

  await deps.recordAuditEvent(orgAuth, {
    action: AUDIT_ACTIONS.TEAM_MEMBER_INVITE_RESENT,
    entityId: member.id,
    entityLabel: account.email,
    details: { typeKey: member.typeKey },
  });

  return { email: account.email, emailSent: true };
}

export async function removeTeamMember(orgAuth, { memberId }, deps = defaultDeps) {
  const member = await editableMemberOrFail(orgAuth, memberId, deps);
  const email = await emailOf(member.authUserId, deps);

  await deps.deleteMemberAccount(member.authUserId);
  await deps.recordAuditEvent(orgAuth, {
    action: AUDIT_ACTIONS.TEAM_MEMBER_REMOVED,
    entityId: member.id,
    entityLabel: email,
    details: { typeKey: member.typeKey },
  });

  return { removed: true };
}
