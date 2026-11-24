/*
 * Catálogo único das permissões (#247, vários utilizadores).
 *
 * É a mesma lista que as rotas da API verificam e que, mais tarde, desenha a
 * árvore de caixas em Definições → Tipos de utilizador. Uma permissão nova
 * nasce aqui e aparece nos dois sítios.
 *
 * Os textos das permissões ficam gravados na base de dados
 * (`user_type.permissions`): nunca mudar o texto de uma que já exista.
 */

export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: "dashboard.view",

  USERS_VIEW: "users.view",
  USERS_EDIT: "users.edit",
  USERS_DELETE: "users.delete",
  USERS_IMPORT: "users.import",
  USERS_GROUPS: "users.groups",

  TEAMS_GROUPS_VIEW: "teams_groups.view",
  TEAMS_GROUPS_EDIT: "teams_groups.edit",

  ASSISTANTS_VIEW: "assistants.view",
  ASSISTANTS_EDIT: "assistants.edit",
  ASSISTANTS_DELETE: "assistants.delete",
  ASSISTANTS_TEST: "assistants.test",

  SEND_WHATSAPP: "messages.send_whatsapp",
  SEND_TEAMS: "messages.send_teams",
  IMAGE_AI: "messages.image_ai",

  SCHEDULED_VIEW: "messages.scheduled_view",
  SCHEDULED_EDIT: "messages.scheduled_edit",

  LINKS_VIEW: "links.view",
  LINKS_CREATE: "links.create",

  QUESTIONS_VIEW: "questions.view",
  QUESTIONS_REVIEW: "questions.review",
  QUESTIONS_EXPORT: "questions.export",

  MEDIA_VIEW: "media.view",
  MEDIA_EDIT: "media.edit",

  AUTOMATIONS_VIEW: "automations.view",
  AUTOMATIONS_EDIT: "automations.edit",
  AUTOMATIONS_RUN: "automations.run",

  ANALYTICS_VIEW: "analytics.view",
  ANALYTICS_EXPORT: "analytics.export",

  SETTINGS_ORGANIZATION: "settings.organization",
  SETTINGS_INTEGRATIONS: "settings.integrations",
  SETTINGS_AUDIT_VIEW: "settings.audit_view",

  TEAM_VIEW: "team.view",
  TEAM_MANAGE: "team.manage",
  TEAM_USER_TYPES: "team.user_types",
});

const P = PERMISSIONS;

/*
 * A árvore, por áreas, na ordem do menu. `view` é a permissão de «Ver» da
 * área: quem tem uma ação da área tem também o «Ver» (regra de dependência).
 * As chaves `area` e `key` servem para os textos (next-intl) na branch das
 * páginas.
 */
export const PERMISSION_TREE = Object.freeze([
  { area: "dashboard", view: P.DASHBOARD_VIEW, actions: [] },
  {
    area: "users",
    view: P.USERS_VIEW,
    actions: [P.USERS_EDIT, P.USERS_DELETE, P.USERS_IMPORT, P.USERS_GROUPS],
  },
  { area: "teamsGroups", view: P.TEAMS_GROUPS_VIEW, actions: [P.TEAMS_GROUPS_EDIT] },
  {
    area: "assistants",
    view: P.ASSISTANTS_VIEW,
    actions: [P.ASSISTANTS_EDIT, P.ASSISTANTS_DELETE, P.ASSISTANTS_TEST],
  },
  { area: "send", view: null, actions: [P.SEND_WHATSAPP, P.SEND_TEAMS, P.IMAGE_AI] },
  { area: "scheduled", view: P.SCHEDULED_VIEW, actions: [P.SCHEDULED_EDIT] },
  { area: "links", view: P.LINKS_VIEW, actions: [P.LINKS_CREATE] },
  {
    area: "questions",
    view: P.QUESTIONS_VIEW,
    actions: [P.QUESTIONS_REVIEW, P.QUESTIONS_EXPORT],
  },
  { area: "media", view: P.MEDIA_VIEW, actions: [P.MEDIA_EDIT] },
  {
    area: "automations",
    view: P.AUTOMATIONS_VIEW,
    actions: [P.AUTOMATIONS_EDIT, P.AUTOMATIONS_RUN],
  },
  { area: "analytics", view: P.ANALYTICS_VIEW, actions: [P.ANALYTICS_EXPORT] },
  {
    area: "settings",
    view: null,
    actions: [P.SETTINGS_ORGANIZATION, P.SETTINGS_INTEGRATIONS, P.SETTINGS_AUDIT_VIEW],
  },
  { area: "team", view: P.TEAM_VIEW, actions: [P.TEAM_MANAGE, P.TEAM_USER_TYPES] },
]);

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const KNOWN = new Set(ALL_PERMISSIONS);

/* «Ver» de que cada ação depende. */
const VIEW_OF = new Map(
  PERMISSION_TREE.flatMap(({ view, actions }) =>
    view ? actions.map((action) => [action, view]) : [],
  ),
);

/*
 * Junta o «Ver» de cada ação e tira o que não está no catálogo. Sem isto
 * aparecem tipos com botões para páginas que não abrem.
 */
export function normalizePermissions(list = []) {
  const result = new Set();

  for (const permission of list || []) {
    if (!KNOWN.has(permission)) continue;
    result.add(permission);
    const view = VIEW_OF.get(permission);
    if (view) result.add(view);
  }

  return ALL_PERMISSIONS.filter((permission) => result.has(permission));
}

/* Os três tipos que vêm com a app (decididos a 24/11/2026). */
export const SYSTEM_USER_TYPES = Object.freeze({
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
});

/*
 * Permissões dos predefinidos. O Administrador tem tudo, incluindo o que
 * venha a ser criado depois, por isso não tem lista. A migração grava estas
 * listas na base de dados; um teste confirma que as duas são iguais.
 */
export const SYSTEM_TYPE_PERMISSIONS = Object.freeze({
  [SYSTEM_USER_TYPES.EDITOR]: normalizePermissions(
    ALL_PERMISSIONS.filter(
      (permission) =>
        ![
          P.SETTINGS_ORGANIZATION,
          P.SETTINGS_INTEGRATIONS,
          P.TEAM_VIEW,
          P.TEAM_MANAGE,
          P.TEAM_USER_TYPES,
        ].includes(permission),
    ),
  ),
  [SYSTEM_USER_TYPES.VIEWER]: normalizePermissions([
    P.DASHBOARD_VIEW,
    P.ANALYTICS_VIEW,
    P.LINKS_VIEW,
    P.QUESTIONS_VIEW,
    P.USERS_VIEW,
    P.TEAMS_GROUPS_VIEW,
    P.ASSISTANTS_VIEW,
    P.AUTOMATIONS_VIEW,
  ]),
});

/*
 * O que uma rota pede. Sem `permission`, a rota fica só para Administradores:
 * uma rota esquecida fica fechada, não aberta.
 */
export const ADMIN_ONLY = "__admin_only__";
/* Qualquer pessoa da organização (por exemplo, ler os limites do plano). */
export const ANY_MEMBER = "__any_member__";

/*
 * O acesso de quem está a fazer o pedido, a partir do tipo de utilizador.
 * O dono da organização é sempre Administrador, mesmo sem linha de membro.
 */
export function resolveAccess({ isOwner = false, member = null } = {}) {
  const typeKey = isOwner ? SYSTEM_USER_TYPES.ADMIN : member?.typeKey ?? null;

  if (!isOwner && !member) return null;

  const isAdmin = typeKey === SYSTEM_USER_TYPES.ADMIN;

  return {
    isOwner,
    isAdmin,
    typeKey,
    userTypeId: member?.userTypeId ?? null,
    permissions: isAdmin
      ? [...ALL_PERMISSIONS]
      : normalizePermissions(member?.permissions || []),
  };
}

/*
 * `required` é uma permissão, uma lista (basta uma), ANY_MEMBER ou
 * ADMIN_ONLY / vazio.
 */
export function accessAllows(access, required = ADMIN_ONLY) {
  if (!access) return false;
  if (access.isAdmin) return true;
  if (required === ANY_MEMBER) return true;
  if (!required || required === ADMIN_ONLY) return false;

  const wanted = Array.isArray(required) ? required : [required];
  const has = new Set(access.permissions);

  return wanted.some((permission) => has.has(permission));
}

/*
 * «Ver como» (como o «Experimentar como» dos planos): um Administrador vê a
 * app com as permissões de outro tipo. Fica num cookie e só tira
 * permissões: quem não é Administrador ignora-o.
 */
export const VIEW_AS_COOKIE = "mdb_view_as";
export const VIEW_AS_TYPES = Object.freeze([
  SYSTEM_USER_TYPES.EDITOR,
  SYSTEM_USER_TYPES.VIEWER,
]);

/* A permissão de envio de um canal; se o canal não for válido, qualquer uma. */
export function sendPermissionFor(channel) {
  if (channel === "whatsapp") return P.SEND_WHATSAPP;
  if (channel === "teams") return P.SEND_TEAMS;
  return [P.SEND_WHATSAPP, P.SEND_TEAMS];
}
