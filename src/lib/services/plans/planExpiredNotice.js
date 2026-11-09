import { claimLimitNotice } from "@/lib/repos/collaboratorWeeklyMessages.repo";

import { getOrgLimits } from "./planLimits";

/*
 * O aviso ao colaborador quando a Demo da empresa terminou (#209), na língua
 * da organização (a escolhida no topo do site).
 */
export const PLAN_EXPIRED_NOTICE = {
  pt: "O assistente não está disponível de momento. Fala com o responsável da tua empresa.",
  en: "The assistant isn't available right now. Please talk to the person in charge at your company.",
};

export function planExpiredNotice(organization) {
  return PLAN_EXPIRED_NOTICE[organization?.locale] || PLAN_EXPIRED_NOTICE.pt;
}

/**
 * Antes de responder a um colaborador: se a Demo da empresa terminou, o
 * assistente não responde, nem às perguntas nem às mensagens pendentes.
 *
 * Devolve `{ allowed, notice }`:
 * - `allowed` false quando a Demo terminou;
 * - `notice` traz o texto do aviso só na primeira mensagem depois de a Demo
 *   terminar, uma vez por canal; nas seguintes é null e não se responde.
 *
 * O aviso fica registado na tabela dos avisos do limite semanal, com o fim
 * da Demo no lugar do início da semana: se a Demo for prolongada e voltar a
 * terminar, o colaborador volta a ser avisado.
 *
 * Se a leitura falhar, deixa passar: é melhor o colaborador ter resposta do
 * que ficar sem ela por um erro nosso.
 */
export async function checkCollaboratorPlanActive(
  { organization, user, channel },
  { now = new Date(), deps = {} } = {},
) {
  const readLimits = deps.getOrgLimits || getOrgLimits;
  const claimNotice = deps.claimLimitNotice || claimLimitNotice;

  try {
    const { expired, expiresAt } = await readLimits(organization.id, { now });
    if (!expired) return { allowed: true, notice: null };

    const first = await claimNotice({
      userId: user.id,
      channel,
      periodStart: expiresAt,
    });

    return {
      allowed: false,
      notice: first ? planExpiredNotice(organization) : null,
    };
  } catch (error) {
    console.error("[Plan] failed to check expired plan", {
      organizationId: organization?.id,
      userId: user?.id,
      channel,
      error: error?.message,
    });

    return { allowed: true, notice: null };
  }
}
