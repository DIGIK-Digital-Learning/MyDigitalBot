import { botLocale } from "@/lib/bot/botLanguage";
import { extractInboundReply } from "@/lib/whatsapp/question";
import {
  buildSwitchMenu,
  isSwitchKeyword,
  isSwitchMenuFresh,
  resolveSwitchChoice,
  switchConfirmationText,
} from "@/lib/whatsapp/assistantSwitch";
import { getAssistantsInOrg } from "@/lib/repos/assistants.repo";
import { createMessage } from "@/lib/repos/messages.repo";
import { getUserThreadForChannel } from "@/lib/repos/threads.repo";
import { setUserAssistantMenu, updateUser } from "@/lib/repos/user.repo";

const defaultDeps = {
  getAssistantsInOrg,
  createMessage,
  getUserThreadForChannel,
  setUserAssistantMenu,
  updateUser,
};

/**
 * Trata uma mensagem recebida como pedido de troca de assistente (#132).
 *
 * Devolve `{ handled: false }` quando a mensagem não tem a ver com a troca e
 * deve seguir o caminho normal (perguntas, depois o assistente). Só se aplica
 * a contactos com mais de um assistente atribuído.
 *
 * - palavra-chave: envia o menu com os assistentes do contacto;
 * - toque num botão do último menu, ou número/nome escrito logo a seguir ao
 *   menu: muda o assistente ativo e confirma.
 *
 * `send({ text, actions, list })` envia a mensagem e devolve o resultado do
 * Bird. Os textos saem na língua do colaborador (#241).
 */
export async function handleAssistantSwitch({
  user,
  organization = null,
  payload,
  inboundMsgId = null,
  contactId = null,
  send,
  deps,
}) {
  const d = { ...defaultDeps, ...deps };
  const locale = botLocale({ organization, user });

  const assignedIds = (user.assistant_ids || []).map(Number);
  if (assignedIds.length < 2) return { handled: false };

  const reply = extractInboundReply(payload);

  const isMenuTap =
    reply.isTap &&
    Boolean(reply.replyToMessageId) &&
    reply.replyToMessageId === user.assistant_menu_message_id;

  const isKeyword = !reply.isTap && isSwitchKeyword(reply.text);

  const mayBeTypedChoice =
    !reply.isTap &&
    !isKeyword &&
    isSwitchMenuFresh(user.assistant_menu_sent_at);

  if (!isMenuTap && !isKeyword && !mayBeTypedChoice) return { handled: false };

  const assistants = (await d.getAssistantsInOrg(user.organization_id))
    .filter((a) => assignedIds.includes(Number(a.id)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), locale));

  if (assistants.length < 2) return { handled: false };

  const chosen = isKeyword ? null : resolveSwitchChoice({ reply, assistants });

  // Texto normal escrito depois do menu: não é escolha, segue para o assistente.
  if (mayBeTypedChoice && !chosen) return { handled: false };

  const activeId = chosen ? chosen.id : user.assistant_id;

  const thread = activeId
    ? await d.getUserThreadForChannel({
        userId: user.id,
        assistantId: activeId,
        channel: "whatsapp",
      })
    : null;

  async function record({ content, role, sendRes = null }) {
    await d.createMessage({
      threadId: thread?.id ?? null,
      userId: user.id,
      organizationId: user.organization_id,
      assistantId: activeId ?? null,
      channel: "whatsapp",
      messageId:
        role === "user" ? inboundMsgId : sendRes?.providerMessageId || null,
      externalContactId: contactId,
      content,
      role,
      ...(role === "assistant"
        ? {
            deliveryStatus: sendRes?.ok ? "accepted" : "failed",
            failedAt: sendRes?.ok ? null : new Date().toISOString(),
          }
        : {}),
    });
  }

  await record({ content: reply.text, role: "user" });

  // Palavra-chave, ou toque num botão de um assistente entretanto retirado.
  if (!chosen) {
    const menu = buildSwitchMenu({
      assistants,
      activeId: user.assistant_id,
      locale,
    });
    const sendRes = await send(menu);

    await record({ content: menu.text, role: "assistant", sendRes });

    if (sendRes?.ok) {
      await d.setUserAssistantMenu(user.id, {
        messageId: sendRes.providerMessageId || null,
        sentAt: new Date().toISOString(),
      });
    }

    return { handled: true, outcome: "menu", sent: Boolean(sendRes?.ok) };
  }

  const alreadyActive = Number(chosen.id) === Number(user.assistant_id);

  if (!alreadyActive) {
    await d.updateUser(user.id, { assistantId: chosen.id });
  }

  // O menu fica válido para novos toques; só a resposta escrita deixa de contar.
  await d.setUserAssistantMenu(user.id, { sentAt: null });

  const text = switchConfirmationText(chosen, { alreadyActive, locale });
  const sendRes = await send({ text, actions: null, list: null });

  await record({ content: text, role: "assistant", sendRes });

  return {
    handled: true,
    outcome: alreadyActive ? "unchanged" : "switched",
    assistantId: chosen.id,
  };
}
