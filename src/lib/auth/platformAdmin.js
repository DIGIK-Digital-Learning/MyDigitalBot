import { jsonError, requireUser } from "@/lib/auth/guards";

/*
 * Administradores da plataforma (#208): a equipa DIGIK, que gere os planos de
 * todas as organizações. São os donos das organizações 1 (conta principal) e
 * 2 (conta de testes). A lista pode ser trocada por PLATFORM_ADMIN_ORG_IDS
 * ("1,2"), por exemplo na réplica local, que não tem estas organizações.
 *
 * Não depende do plano: ao "experimentar como" outro plano, a organização sai
 * do Interno e os administradores têm de continuar a poder voltar.
 */
const DEFAULT_ADMIN_ORG_IDS = [1, 2];

export function platformAdminOrgIds() {
  const raw = process.env.PLATFORM_ADMIN_ORG_IDS;
  if (!raw) return DEFAULT_ADMIN_ORG_IDS;

  const ids = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

  return ids.length ? ids : DEFAULT_ADMIN_ORG_IDS;
}

/*
 * A organização de que o utilizador é dono e se é administrador. Cada
 * organização tem um só utilizador (o dono).
 */
export async function getPlatformAdminStatus(auth) {
  const { data: org, error } = await auth.admin
    .from("organization")
    .select("id, plan_id")
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    org: org ?? null,
    isAdmin: Boolean(org) && platformAdminOrgIds().includes(Number(org.id)),
  };
}

/** Para as rotas de administração: 401 sem sessão, 403 sem ser administrador. */
export async function requirePlatformAdmin() {
  const auth = await requireUser();
  if (auth.error) return auth;

  const { org, isAdmin } = await getPlatformAdminStatus(auth);

  if (!isAdmin) {
    return { error: jsonError("Forbidden", 403) };
  }

  return { ...auth, org, orgId: Number(org.id) };
}
