import { claimCollaboratorMessage } from "@/lib/repos/collaboratorWeeklyMessages.repo";
import { weeklyMessagesWeekStart } from "@/lib/plans/weeklyMessages";

import { getOrgLimits } from "./planLimits";

/*
 * O aviso ao colaborador quando passa as mensagens da semana, sem números,
 * na língua da organização (a escolhida no topo do site).
 */
export const WEEKLY_LIMIT_NOTICE = {
  pt: "Atingiste o teu limite de mensagens semanais. Poderás voltar a utilizar o serviço a partir de segunda-feira.",
  en: "You've reached your weekly message limit. You'll be able to use the service again from Monday.",
};

export function weeklyLimitNotice(organization) {
  return WEEKLY_LIMIT_NOTICE[organization?.locale] || WEEKLY_LIMIT_NOTICE.pt;
}

/**
 * Conta uma mensagem do colaborador no limite semanal do canal: 100 por
 * semana em cada canal. `kind` é "assistant" (mensagem ao assistente) ou o
 * tipo da pergunta respondida ("quiz", "survey", "open").
 *
 * Devolve `{ allowed, notice }`:
 * - `allowed` false quando a mensagem já não cabe nesta semana;
 * - `notice` traz o texto do aviso só na primeira vez da semana (é para
 *   mandar ao colaborador); nas seguintes é null e não se responde nada.
 *
 * Se a contagem falhar (base de dados em baixo), deixa passar: é melhor o
 * colaborador ter resposta do que ficar sem ela por um erro nosso.
 */
export async function claimCollaboratorWeeklyMessage(
  { organization, user, channel, kind, sourceId = null },
  { now = new Date(), deps = {} } = {},
) {
  const claim = deps.claimCollaboratorMessage || claimCollaboratorMessage;
  const readLimits = deps.getOrgLimits || getOrgLimits;

  try {
    const { limits } = await readLimits(organization.id, { now });

    const result = await claim({
      organizationId: organization.id,
      userId: user.id,
      channel,
      kind,
      sourceId,
      limit: limits.collaboratorWeeklyMessages,
      since: weeklyMessagesWeekStart(now),
    });

    return {
      allowed: result.ok,
      notice: result.notify ? weeklyLimitNotice(organization) : null,
    };
  } catch (error) {
    console.error("[Weekly limit] failed to count message", {
      organizationId: organization?.id,
      userId: user?.id,
      channel,
      error: error?.message,
    });

    return { allowed: true, notice: null };
  }
}
