import {
  assertTeamsGroupsBelongToOrg,
  assertUsersBelongToOrg,
  requireAllRecipientsToBeKnownUsers,
} from "@/lib/auth/guards";
import {
  assertGroupBroadcastContent,
  parseGroupIds,
} from "@/lib/services/broadcast/groupBroadcastOptions";
import { parseOpeningOptions } from "@/lib/services/broadcast/openingOptions";
import { parseQuestionOptions } from "@/lib/services/broadcast/questionOptions";

/**
 * Constrói o payload guardado numa mensagem agendada a partir do que vem do
 * cliente. Serve o agendamento (POST) e a edição (PATCH), para que as duas
 * rotas apliquem exatamente as mesmas validações: o cliente nunca grava um
 * payload em bruto.
 *
 * Devolve `{ error }` para erros de conteúdo (a rota responde 400) e
 * `{ payload, recipientCount }` quando está tudo certo. Os erros de
 * autorização (utilizadores ou grupos de outra organização) são lançados
 * pelos guards.
 */
export async function buildScheduledPayload({ orgAuth, channel, payload }) {
  const input = payload && typeof payload === "object" ? payload : {};

  /* Grupos do Teams (#166): só mensagem em branco, sem colaboradores. */
  if (channel === "teams" && Array.isArray(input.groupIds)) {
    assertGroupBroadcastContent(input);

    const groups = await assertTeamsGroupsBelongToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      parseGroupIds(input.groupIds),
    );

    return {
      payload: {
        orgId: orgAuth.orgId,
        message: input.message || "",
        files: Array.isArray(input.files) ? input.files : [],
        imageUrls: Array.isArray(input.imageUrls) ? input.imageUrls : [],
        trackedLinks: [],
        groupIds: groups.map((group) => group.id),
        /* Só para mostrar nas agendadas; o envio relê os grupos. */
        groups: groups.map((group) => ({ id: group.id, name: group.name })),
      },
      recipientCount: groups.length,
    };
  }

  const rawRecipients =
    channel === "teams"
      ? (Array.isArray(input.userIds) ? input.userIds : []).map((userId) => ({
          userId,
        }))
      : Array.isArray(input.recipients)
        ? input.recipients
        : [];

  const recipientUserIds = requireAllRecipientsToBeKnownUsers(rawRecipients);

  await assertUsersBelongToOrg(orgAuth.admin, orgAuth.orgId, recipientUserIds);

  let opening = { openingBody: null, openingOnly: false };

  if (channel === "whatsapp") {
    opening = parseOpeningOptions(input);

    if (opening.error) return { error: opening.error };
  }

  /* Perguntas nos dois canais; no Teams desde o #151. */
  const question = parseQuestionOptions(input);

  if (question.error) return { error: question.error };

  return {
    payload: {
      orgId: orgAuth.orgId,
      message: input.message || "",
      files: Array.isArray(input.files) ? input.files : [],
      imageUrls: Array.isArray(input.imageUrls) ? input.imageUrls : [],
      trackedLinks: Array.isArray(input.trackedLinks) ? input.trackedLinks : [],
      ...(channel === "teams"
        ? { userIds: recipientUserIds, question: question.question }
        : {
            recipients: recipientUserIds.map((userId) => ({ userId })),
            openingBody: opening.openingBody,
            openingOnly: opening.openingOnly,
            question: question.question,
          }),
    },
    recipientCount: recipientUserIds.length,
  };
}
