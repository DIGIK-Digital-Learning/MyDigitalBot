import { DEFAULT_BOT_LOCALE } from "@/lib/bot/botLanguage";
import { botText } from "@/lib/bot/botTexts";
import {
  isSwitchKeyword,
  switchConfirmationText,
} from "@/lib/whatsapp/assistantSwitch";
import { getAssistantsInOrg } from "@/lib/repos/assistants.repo";
import { getUserById, updateUser } from "@/lib/repos/user.repo";

/*
 * Troca de assistente no Teams (#155), como no WhatsApp (#132).
 *
 * O colaborador escreve "assistentes" (ou `--assistentes`) e recebe um
 * cartão com um botão por assistente. Cada botão leva o id do assistente,
 * por isso não há lista numerada nem janela para respostas escritas.
 * Só se aplica a quem tem mais de um assistente atribuído.
 */

export const ASSISTANT_SWITCH_ACTION = "mdbAssistantSwitch";

const SWITCH_COMMANDS = ["assistentes", "assistente", "assistants", "assistant"];

export function isSwitchCommand(command) {
  return SWITCH_COMMANDS.includes(String(command || "").toLowerCase());
}

/*
 * O Teams mostra poucos botões por cartão e esconde os restantes num "…".
 * Até este número vai um botão por assistente; acima disso, uma lista de
 * escolha com um botão "Trocar".
 */
export const SWITCH_MAX_BUTTONS = 5;

export function buildAssistantSwitchCard({
  assistants = [],
  activeId = null,
  locale = DEFAULT_BOT_LOCALE,
}) {
  const active = assistants.find((a) => Number(a.id) === Number(activeId));
  const current = active
    ? ` ${botText(locale, "switchCurrent", { name: active.name })}`
    : "";

  const question = {
    type: "TextBlock",
    text: `${botText(locale, "switchQuestion")}${current}`,
    wrap: true,
  };

  const useList = assistants.length > SWITCH_MAX_BUTTONS;

  return {
    contentType: "application/vnd.microsoft.card.adaptive",
    content: {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: useList
        ? [
            question,
            {
              type: "Input.ChoiceSet",
              id: "assistantId",
              style: "compact",
              value: active ? String(active.id) : String(assistants[0]?.id ?? ""),
              choices: assistants.map((assistant) => ({
                title: assistant.name,
                value: String(assistant.id),
              })),
            },
          ]
        : [question],
      actions: useList
        ? [
            {
              type: "Action.Submit",
              title: botText(locale, "switchSubmit"),
              /* O assistentId escolhido chega no value, junto com a ação. */
              data: {
                msteams: {
                  type: "messageBack",
                  displayText: botText(locale, "switchSubmitText"),
                  text: botText(locale, "switchSubmitText"),
                },
                action: ASSISTANT_SWITCH_ACTION,
              },
            },
          ]
        : assistants.map((assistant) => ({
            type: "Action.Submit",
            title: assistant.name,
            data: {
              msteams: {
                type: "messageBack",
                displayText: assistant.name,
                text: assistant.name,
              },
              action: ASSISTANT_SWITCH_ACTION,
              assistantId: assistant.id,
            },
          })),
    },
  };
}

const defaultDeps = { getAssistantsInOrg, getUserById, updateUser };

/**
 * Devolve `{ handled: false }` quando a mensagem não é um pedido de troca e
 * deve seguir para o assistente. `send({ text, attachments })` envia ao
 * colaborador. `locale` é a língua do colaborador (#241).
 */
export async function handleTeamsAssistantSwitch({
  userId,
  text = "",
  value = null,
  isCommand = false,
  locale = DEFAULT_BOT_LOCALE,
  send,
  deps,
}) {
  const d = { ...defaultDeps, ...deps };

  const isTap = value?.action === ASSISTANT_SWITCH_ACTION;

  if (!isTap && !isCommand && !isSwitchKeyword(text)) {
    return { handled: false };
  }

  const user = await d.getUserById(userId);
  const assignedIds = (user?.assistant_ids || []).map(Number);

  if (assignedIds.length < 2) {
    /* O comando pede uma resposta; a palavra solta segue para o assistente. */
    if (!isCommand) return { handled: false };

    await send({ text: botText(locale, "switchSingle") });

    return { handled: true, outcome: "single" };
  }

  const assistants = (await d.getAssistantsInOrg(user.organization_id))
    .filter((a) => assignedIds.includes(Number(a.id)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), locale));

  const chosen = isTap
    ? assistants.find((a) => Number(a.id) === Number(value.assistantId))
    : null;

  /* Palavra-chave, comando, ou botão de um assistente entretanto retirado. */
  if (!chosen) {
    await send({
      attachments: [
        buildAssistantSwitchCard({
          assistants,
          activeId: user.assistant_id,
          locale,
        }),
      ],
    });

    return { handled: true, outcome: "menu" };
  }

  const alreadyActive = Number(chosen.id) === Number(user.assistant_id);

  if (!alreadyActive) {
    await d.updateUser(user.id, { assistantId: chosen.id });
  }

  await send({
    text: switchConfirmationText(chosen, { alreadyActive, locale }),
  });

  return {
    handled: true,
    outcome: alreadyActive ? "unchanged" : "switched",
    assistantId: chosen.id,
  };
}
