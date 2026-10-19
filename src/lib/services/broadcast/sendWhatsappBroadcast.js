import { getSupabaseAdminClient } from "@/lib/db/admin";
import crypto from "crypto";
import { toE164 } from "@/lib/whatsapp/E164";
import { getUserById } from "@/lib/repos/user.repo";
import { createMessage, isWindowOpenForUser } from "@/lib/repos/messages.repo";
import {
  createPendingOutreach,
  deletePendingOutreach,
  getAllPendingOutreachByUser,
  updatePendingOutreachTemplateMessageId,
} from "@/lib/repos/pendingOutreach.repo";
import {
  attachWhatsappOpeningGateOutreach,
  claimWhatsappOpeningGate,
  failWhatsappOpeningGate,
  getWhatsappOpeningGate,
  markWhatsappOpeningGateSent,
} from "@/lib/repos/whatsappOpeningGate.repo";
import { createQuestion, getQuestionById } from "@/lib/repos/questions.repo";
import { getLatestUserThreadForChannel } from "@/lib/repos/threads.repo";
import {
  buildQuizActions,
  hasReplyButtons,
  questionExpiryDate,
} from "@/lib/whatsapp/question";
import { BroadcastError, normalizeFiles, isImageType } from "./shared";
import {
  buildOpeningTemplateParams,
  getOpeningTemplateConfig,
  sanitizeOpeningBody,
} from "@/lib/whatsapp/openingTemplate";
import {
  findPendingOpeningGate,
  openingGateExpiresAt,
} from "@/lib/whatsapp/openingGate";
import {
  LINK_BUTTON_BODY_MAX_LENGTH,
  buildLinkButtonActions,
  buttonLinkBubbles,
  planLinkMessages,
} from "@/lib/whatsapp/linkButton";
import { interpolateBroadcastMessage } from "./interpolateMessage";
import { parseQuestionOptions } from "./questionOptions";
import {
  replaceTrackedLinksInText,
  resolveTrackedLinksForRecipient,
} from "./trackedLinks";

const supabaseAdmin = getSupabaseAdminClient();

function cleanText(value) {
  if (value === undefined || value === null) return null;

  const str = String(value).trim();
  return str.length ? str : null;
}

function extractBirdMessageId(data) {
  return (
    data?.id ||
    data?.message?.id ||
    data?.payload?.id ||
    data?.result?.id ||
    data?.results?.[0]?.id ||
    data?.messages?.[0]?.id ||
    null
  );
}

function normalizeRecipient(raw) {
  if (raw && typeof raw === "object") {
    return {
      raw,
      userId: raw.userId ?? raw.id ?? null,
    };
  }

  return {
    raw,
    userId: null,
  };
}

function getUserPhone(user) {
  if (!user) return null;

  if (cleanText(user.phone_number)) return cleanText(user.phone_number);

  if (cleanText(user.phone_country_code) && cleanText(user.phone_national)) {
    return `${cleanText(user.phone_country_code)}${String(
      user.phone_national,
    ).replace(/\D/g, "")}`;
  }

  return null;
}

function buildWhatsappContact({ phoneNumber, whatsappBsuid, birdContactId }) {
  if (cleanText(phoneNumber)) {
    return {
      identifierKey: "phonenumber",
      identifierValue: cleanText(phoneNumber),
    };
  }

  if (cleanText(whatsappBsuid)) {
    return {
      identifierKey: "whatsappbsuid",
      identifierValue: cleanText(whatsappBsuid),
    };
  }

  if (cleanText(birdContactId)) {
    return { id: cleanText(birdContactId) };
  }

  return null;
}

function getRecipientLabel(recipient, user, to) {
  return (
    cleanText(user?.name) ||
    cleanText(recipient.name) ||
    cleanText(user?.phone_number) ||
    cleanText(recipient.phoneNumber) ||
    cleanText(recipient.whatsappUsername) ||
    cleanText(recipient.whatsappBsuid) ||
    cleanText(to) ||
    "Unknown recipient"
  );
}

async function loadOrgForWhatsapp(orgId) {
  const { data: org, error } = await supabaseAdmin
    .from("organization")
    .select(
      "id, name, channel_id, waba_namespace, default_phone_country_code, whatsapp_opening_body",
    )
    .eq("id", orgId)
    .single();

  if (error || !org?.channel_id) {
    throw new BroadcastError("Could not load organization/channel_id", 400);
  }

  return org;
}

function getMessagesEndpoint(channelId) {
  const workspaceId = process.env.WORKSPACE_ID;
  const accessKey = process.env.BIRD_API_KEY;

  if (!workspaceId || !channelId || !accessKey) {
    throw new BroadcastError(
      "Missing Bird config (WORKSPACE_ID, channel_id, BIRD_API_KEY)",
      500,
    );
  }

  return {
    url: `https://api.bird.com/workspaces/${workspaceId}/channels/${channelId}/messages`,
    accessKey,
  };
}

async function sendFreeform({
  endpoint,
  accessKey,
  contact,
  message,
  imageUrls,
  actions = null,
}) {
  const payload = {
    receiver: {
      contacts: [contact],
    },
    /*
     * Botões de resposta rápida (quiz, sondagem) vão em `actions`, tanto
     * na mensagem de texto como na de imagem: verificado a 15-09-2026 com
     * o Bird, a imagem, o texto e os botões chegam numa só mensagem e o
     * toque responde ao id dela.
     */
    body: imageUrls.length
      ? {
          type: "image",
          image: {
            images: imageUrls.map((u) => ({
              mediaUrl: u,
            })),
            ...(message ? { text: message } : {}),
            ...(actions?.length ? { actions } : {}),
          },
        }
      : {
          type: "text",
          text: {
            text: message,
            ...(actions?.length ? { actions } : {}),
          },
        },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `AccessKey ${accessKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  return {
    ok: res.ok,
    status: res.status,
    data,
    providerMessageId: extractBirdMessageId(data),
  };
}

/*
 * Balões à parte de uma mensagem com vários links, cada um com o seu
 * botão. Seguem por ordem, à espera da resposta do Bird entre um e outro;
 * um balão que falhe não impede os seguintes.
 */
async function sendFollowUps({ endpoint, accessKey, contact, followUps }) {
  const results = [];

  for (const followUp of followUps) {
    const r = await sendFreeform({
      endpoint,
      accessKey,
      contact,
      message: followUp.message,
      imageUrls: [],
      actions: followUp.actions,
    });

    if (!r.ok) {
      console.warn("[WA follow-up failed]", { status: r.status, data: r.data });
    }

    results.push({
      ok: r.ok,
      status: r.status,
      providerMessageId: r.providerMessageId,
    });
  }

  return results;
}

/**
 * Envia o template de abertura. É sempre o mesmo projeto do Bird, na versão
 * mais recente; só os valores das variáveis mudam por destinatário.
 */
async function sendOpeningTemplate({
  endpoint,
  accessKey,
  contact,
  config,
  kvPairs,
}) {
  const payload = {
    receiver: {
      contacts: [contact],
    },
    template: {
      projectId: config.projectId,
      version: "latest",
      locale: config.locale,
      parameters: kvPairs.map((kv) => {
        const [k, ...rest] = kv.split("=");

        return {
          type: "string",
          key: k.trim(),
          value: rest.join("=").trim(),
        };
      }),
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `AccessKey ${accessKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  return {
    ok: res.ok,
    status: res.status,
    data,
    providerMessageId: extractBirdMessageId(data),
  };
}

/**
 * Envio WhatsApp em massa.
 *
 * - Contacto com a janela de 24h aberta: recebe a mensagem livre.
 * - Contacto fora da janela: recebe um template de abertura; a mensagem
 *   fica em espera até tocar no Quick Reply associado a esse template.
 * - O template pendente não se repete durante 14 dias; novos envios juntam-se
 *   à fila existente.
 * - `openingOnly`: envia só o template de abertura e regista a sua resposta.
 * - `openingBody`: corpo do template só para este envio; sem ele usa-se o
 *   corpo guardado na organização.
 * - `question`: quiz com botões ou pergunta aberta em texto simples. Cria uma linha em
 *   `question` e liga-lhe cada mensagem entregue (message.question_id).
 */
export async function sendWhatsappBroadcast(input = {}) {
  const {
    orgId,
    message = "",
    files = [],
    imageUrls = [],
    recipients = [],
    openingBody = null,
    openingOnly = false,
    trackedLinks = [],
    scheduledBroadcastId = null,
    sendGroupId = crypto.randomUUID(),
    createdByUserId = null,
    chainMetadata = null,
    question: rawQuestion = null,
    questionId: existingQuestionId = null,
  } = input;

  if (!orgId) {
    throw new BroadcastError("Missing orgId", 400);
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new BroadcastError("Missing recipients", 400);
  }

  const normalizedFiles = normalizeFiles({ files, imageUrls });
  const onlyImageUrls = normalizedFiles
    .filter((f) => isImageType(f.contentType))
    .map((f) => f.url);

  const sendOpeningOnly = Boolean(openingOnly);

  const parsed = parseQuestionOptions({ question: rawQuestion });
  if (parsed.error) throw new BroadcastError(parsed.error, 400);

  /*
   * Uma pergunta já criada (passo de uma cadeia de leitura, partilhada por
   * todos os destinatários) chega por `questionId`; um envio normal traz a
   * pergunta por definir em `question`.
   */
  let questionRow = null;
  let question = parsed.question;

  if (existingQuestionId) {
    questionRow = await getQuestionById(existingQuestionId);

    if (
      !questionRow ||
      Number(questionRow.organization_id) !== Number(orgId)
    ) {
      throw new BroadcastError("Question not found", 404);
    }

    question = {
      kind: questionRow.kind,
      body: questionRow.body,
      options: questionRow.options,
      expectedAnswer: questionRow.expected_answer,
      aiEvaluation: questionRow.ai_evaluation !== false,
    };
  }

  const quiz = question?.kind === "quiz" ? question : null;
  const survey = question?.kind === "survey" ? question : null;
  const withButtons = question && hasReplyButtons(question.kind);

  if (question && sendOpeningOnly) {
    throw new BroadcastError(
      "Uma pergunta não pode ser apenas uma abertura.",
      400,
    );
  }

  /* A pergunta é a própria mensagem. */
  const messageText = question ? question.body : message;

  const hasInitialFreeformContent =
    String(messageText || "").trim().length > 0 || onlyImageUrls.length > 0;

  if (!hasInitialFreeformContent && !sendOpeningOnly) {
    throw new BroadcastError("Missing message/images", 400);
  }

  const org = await loadOrgForWhatsapp(orgId);
  const { url: messagesEndpoint, accessKey } = getMessagesEndpoint(
    org.channel_id,
  );

  const resolvedOpeningBody =
    sanitizeOpeningBody(openingBody) || org.whatsapp_opening_body || null;

  /*
   * A configuração do template só é obrigatória quando há mesmo um template
   * para enviar, por isso é lida uma única vez, na primeira necessidade.
   */
  let openingConfig = null;

  function getOpeningConfig() {
    if (!openingConfig) {
      openingConfig = getOpeningTemplateConfig();
    }

    return openingConfig;
  }

  const defaultCc =
    org.default_phone_country_code ||
    process.env.DEFAULT_COUNTRY_CODE ||
    "+351";

  /*
   * Uma linha em `question` por envio. Cada mensagem entregue fica ligada a
   * ela, e um toque num botão chega com a referência a essa mensagem.
   */
  if (question && !questionRow) {
    questionRow = await createQuestion({
      organizationId: orgId,
      kind: question.kind,
      body: question.body,
      options: withButtons ? question.options : null,
      /* Na sondagem, feedback_correct guarda o agradecimento. */
      feedbackCorrect: quiz?.feedbackCorrect ?? survey?.thanksText ?? null,
      feedbackIncorrect: quiz?.feedbackIncorrect,
      expectedAnswer: question.expectedAnswer,
      aiEvaluation: withButtons ? true : question.aiEvaluation !== false,
      scheduledBroadcastId,
      sendGroupId,
      createdByUserId,
      expiresAt: questionExpiryDate(),
    });
  }

  const quizActions = withButtons ? buildQuizActions(question.options) : null;

  async function resolveRecipient(rawRecipient) {
    const recipient = normalizeRecipient(rawRecipient);

    if (!recipient.userId) {
      throw new BroadcastError("Recipient userId is required", 400);
    }

    const user = await getUserById(recipient.userId);

    if (!user || Number(user.organization_id) !== Number(orgId)) {
      throw new BroadcastError(
        "Recipient does not belong to this organization",
        403,
      );
    }

    let to = getUserPhone(user);

    if (to) {
      to = await toE164(to, defaultCc);
    }

    const whatsappBsuid = user.whatsapp_bsuid || null;
    const birdContactId = user.bird_contact_id || null;

    const contact = buildWhatsappContact({
      phoneNumber: to,
      whatsappBsuid,
      birdContactId,
    });

    return {
      recipient,
      user,
      to,
      whatsappBsuid,
      birdContactId,
      contact,
      label: getRecipientLabel(recipient, user, to),
    };
  }

  async function handleOne(rawRecipient) {
    const resolved = await resolveRecipient(rawRecipient);
    const {
      recipient,
      user,
      to,
      whatsappBsuid,
      birdContactId,
      contact,
      label,
    } = resolved;

    const base = {
      recipient: label,
      to,
      whatsappBsuid,
      birdContactId,
      userId: user?.id || recipient.userId || null,
      userName: user?.name || recipient.name || null,
    };

    if (!contact) {
      return {
        ...base,
        kind: "none",
        resolvedMessage: "",
        providerMessageId: null,
        ok: false,
        status: 400,
        data: {
          error:
            "No WhatsApp identity available. Need phone_number, whatsapp_bsuid, or bird_contact_id",
        },
      };
    }

    const resolvedTrackedLinks = await resolveTrackedLinksForRecipient({
      trackedLinks,
      orgId,
      channel: "whatsapp",
      recipientUserId: user?.id || recipient.userId || null,
      scheduledBroadcastId,
      sendGroupId,
      createdByUserId,
    });

    /*
     * No texto só se trocam os links: a formatação fica com os marcadores do
     * WhatsApp, e o link do botão é tratado à parte (planLinkMessages).
     */
    const resolveText = (text) =>
      interpolateBroadcastMessage(
        replaceTrackedLinksInText(text, resolvedTrackedLinks),
        {
          user,
          org,
          assistant: null,
        },
      );

    /*
     * Os links dos botões vão em botões, sem o URL à vista: o primeiro na
     * mensagem, os outros em balões à parte, logo a seguir (o WhatsApp só
     * deixa um botão de link por mensagem).
     */
    const plan = planLinkMessages({
      message: messageText,
      trackedLinks: resolvedTrackedLinks,
      hasReplyButtons: Boolean(withButtons),
      hasImages: onlyImageUrls.length > 0,
    });

    let resolvedMessage = resolveText(plan.message);
    let linkActions = plan.button
      ? buildLinkButtonActions(
          plan.button.buttonText,
          plan.button.link.trackedUrl,
        )
      : null;
    let linkBubbles = plan.extras;

    /*
     * Um corpo acima do limite de uma mensagem com botão vai sem botão: o
     * link do botão segue num balão à parte e um link antigo, que estava no
     * texto, volta para o texto.
     */
    if (linkActions && resolvedMessage.length > LINK_BUTTON_BODY_MAX_LENGTH) {
      resolvedMessage = resolveText(messageText);
      linkActions = null;
      linkBubbles = plan.button.link.button
        ? buttonLinkBubbles(resolvedTrackedLinks)
        : plan.extras;
    }

    const followUps = linkBubbles.map((bubble) => ({
      message: resolveText(bubble.text),
      actions: buildLinkButtonActions(
        bubble.buttonText,
        bubble.link.trackedUrl,
      ),
    }));

    /* Quiz e sondagem têm botões de resposta; os outros, talvez o do link. */
    const actions = quizActions || linkActions;

    const hasResolvedFreeformContent =
      String(resolvedMessage || "").trim().length > 0 ||
      onlyImageUrls.length > 0;

    const pendingRows = user
      ? await getAllPendingOutreachByUser(user.id)
      : [];
    const persistedGate = user
      ? await getWhatsappOpeningGate({ orgId, userId: user.id })
      : null;
    const legacyGate = persistedGate
      ? null
      : findPendingOpeningGate(pendingRows);
    const activeOpeningGate =
      persistedGate &&
      ["sending", "pending"].includes(persistedGate.status) &&
      Date.parse(persistedGate.expires_at) > Date.now()
        ? persistedGate
        : legacyGate;

    const pendingPayload = {
      message: resolvedMessage,
      imageUrls: onlyImageUrls,
      ...(questionRow
        ? {
            type: question.kind,
            questionId: questionRow.id,
            actions: quizActions,
          }
        : {}),
      ...(linkActions ? { actions: linkActions } : {}),
      ...(followUps.length ? { followUps } : {}),
    };

    const persistPendingOutreach = ({
      expiresAt,
      templateMessageId = null,
      openingGate = false,
    }) =>
      createPendingOutreach({
        orgId,
        userId: user.id,
        payload: {
          ...(hasResolvedFreeformContent ? pendingPayload : {}),
          ...(openingGate ? { openingGate: true } : {}),
        },
        expiresAt,
        templateMessageId,
        messageChainId: chainMetadata?.messageChainId || null,
        messageChainStepId: chainMetadata?.messageChainStepId || null,
        messageChainRecipientId:
          chainMetadata?.messageChainRecipientId || null,
        messageChainStepIndex: chainMetadata?.messageChainStepIndex || null,
      });

    if (activeOpeningGate) {
      if (!sendOpeningOnly && hasResolvedFreeformContent) {
        await persistPendingOutreach({
          expiresAt: activeOpeningGate.expires_at,
        });

        return {
          ...base,
          kind: "queued",
          resolvedMessage,
          questionId: questionRow?.id ?? null,
          providerMessageId: null,
          ok: true,
          status: 202,
          data: {
            queued: true,
            waitingForQuickReply: true,
            expiresAt: activeOpeningGate.expires_at,
          },
        };
      }

      return {
        ...base,
        kind: "suppressed",
        resolvedMessage,
        questionId: questionRow?.id ?? null,
        providerMessageId: null,
        ok: true,
        status: 202,
        data: {
          reason: "opening_template_already_pending",
          expiresAt: activeOpeningGate.expires_at,
        },
      };
    }

    const windowOpen =
      !sendOpeningOnly && user ? await isWindowOpenForUser(user.id) : false;

    if (windowOpen && hasResolvedFreeformContent) {
      /* Uma pergunta com imagens vai numa só mensagem, com os botões. */
      const r = await sendFreeform({
        endpoint: messagesEndpoint,
        accessKey,
        contact,
        message: resolvedMessage,
        imageUrls: onlyImageUrls,
        actions,
      });

      /* Os balões à parte só saem depois da mensagem, e um de cada vez. */
      const followUpResults = r.ok
        ? await sendFollowUps({
            endpoint: messagesEndpoint,
            accessKey,
            contact,
            followUps,
          })
        : [];

      /*
       * Regista a mensagem da pergunta. Numa cadeia de leitura é o passo
       * que a regista, com os dados da cadeia.
       */
      if (r.ok && questionRow && user && !chainMetadata) {
        /* Liga a pergunta à conversa do contacto, quando já existe. */
        const thread = await getLatestUserThreadForChannel(
          user.id,
          "whatsapp",
        ).catch(() => null);

        await createMessage({
          threadId: thread?.id ?? null,
          userId: user.id,
          organizationId: orgId,
          assistantId: thread?.assistant_id ?? user.assistant_id ?? null,
          channel: "whatsapp",
          messageId: r.providerMessageId,
          content: resolvedMessage,
          role: "assistant",
          deliveryStatus: "accepted",
          scheduledBroadcastId,
          questionId: questionRow.id,
        });
      }

      console.log("[WA freeform result]", {
        sendGroupId,
        recipient: label,
        to,
        whatsappBsuid,
        birdContactId,
        contact,
        ok: r.ok,
        status: r.status,
        providerMessageId: r.providerMessageId,
        data: r.data,
      });

      return {
        ...base,
        kind: "freeform",
        resolvedMessage,
        questionId: questionRow?.id ?? null,
        ...r,
        ...(followUpResults.length ? { followUps: followUpResults } : {}),
      };
    }

    let config;

    try {
      config = getOpeningConfig();
    } catch (err) {
      return {
        ...base,
        kind: "template",
        resolvedMessage,
        providerMessageId: null,
        ok: false,
        status: 500,
        data: { error: err.message },
      };
    }

    const kvPairs = buildOpeningTemplateParams({
      userName: user?.name || "",
      orgName: org?.name || "",
      body: resolvedOpeningBody,
    });

    const gateExpiresAt = openingGateExpiresAt();
    let gateClaim = null;
    let gateQueueRow = null;

    if (user) {
      gateClaim = await claimWhatsappOpeningGate({
        orgId,
        userId: user.id,
        expiresAt: gateExpiresAt,
      });

      if (!gateClaim.claimed) {
        const concurrentGate = gateClaim.gate;
        if (
          concurrentGate &&
          ["sending", "pending"].includes(concurrentGate.status) &&
          Date.parse(concurrentGate.expires_at) > Date.now()
        ) {
          if (!sendOpeningOnly && hasResolvedFreeformContent) {
            await persistPendingOutreach({
              expiresAt: concurrentGate.expires_at,
            });

            return {
              ...base,
              kind: "queued",
              resolvedMessage,
              questionId: questionRow?.id ?? null,
              providerMessageId: null,
              ok: true,
              status: 202,
              data: {
                queued: true,
                waitingForQuickReply: true,
                expiresAt: concurrentGate.expires_at,
              },
            };
          }

          return {
            ...base,
            kind: "suppressed",
            resolvedMessage,
            questionId: questionRow?.id ?? null,
            providerMessageId: null,
            ok: true,
            status: 202,
            data: {
              reason: "opening_template_already_pending",
              expiresAt: concurrentGate.expires_at,
            },
          };
        }

        return {
          ...base,
          kind: "suppressed",
          resolvedMessage,
          questionId: questionRow?.id ?? null,
          providerMessageId: null,
          ok: true,
          status: 202,
          data: { reason: "opening_template_claim_not_acquired" },
        };
      }

      try {
        gateQueueRow = await persistPendingOutreach({
          expiresAt: gateClaim.gate.expires_at,
          openingGate: true,
        });
        await attachWhatsappOpeningGateOutreach({
          orgId,
          userId: user.id,
          pendingOutreachId: gateQueueRow?.id,
        });
      } catch (err) {
        await failWhatsappOpeningGate({ orgId, userId: user.id }).catch(
          (cleanupError) =>
            console.error("Could not release an unsent opening gate", {
              userId: user.id,
              error: cleanupError?.message || String(cleanupError),
            }),
        );
        if (gateQueueRow?.id) {
          await deletePendingOutreach(gateQueueRow.id).catch((cleanupError) =>
            console.error("Could not remove an unsent pending outreach", {
              pendingOutreachId: gateQueueRow.id,
              error: cleanupError?.message || String(cleanupError),
            }),
          );
        }
        throw err;
      }
    }

    console.log("[WA template final]", {
      sendGroupId,
      recipient: label,
      to,
      whatsappBsuid,
      birdContactId,
      contact,
      projectId: config.projectId,
      kvPairs,
    });

    let r;
    try {
      r = await sendOpeningTemplate({
        endpoint: messagesEndpoint,
        accessKey,
        contact,
        config,
        kvPairs,
      });
    } catch (err) {
      /*
       * O resultado da ligação é incerto: conserva-se a reserva durante o
       * prazo para impedir que outro envio repita o template às cegas.
       */
      throw err;
    }

    console.log("[WA template result]", {
      sendGroupId,
      recipient: label,
      to,
      whatsappBsuid,
      birdContactId,
      contact,
      ok: r.ok,
      status: r.status,
      providerMessageId: r.providerMessageId,
      data: r.data,
    });

    if (gateClaim?.claimed) {
      if (r.ok) {
        try {
          await markWhatsappOpeningGateSent({
            orgId,
            userId: user.id,
            templateMessageId: r.providerMessageId,
            pendingOutreachId: gateQueueRow?.id ?? null,
          });
        } catch (err) {
          console.error("Could not mark WhatsApp opening template as sent", {
            userId: user.id,
            error: err?.message || String(err),
          });
        }

        if (gateQueueRow?.id && r.providerMessageId) {
          try {
            await updatePendingOutreachTemplateMessageId(
              gateQueueRow.id,
              r.providerMessageId,
            );
          } catch (err) {
            console.error("Could not attach template id to pending outreach", {
              userId: user.id,
              error: err?.message || String(err),
            });
          }
        }
      } else if (r.status >= 400 && r.status < 500) {
        await failWhatsappOpeningGate({ orgId, userId: user.id });
        if (gateQueueRow?.id) {
          await deletePendingOutreach(gateQueueRow.id);
        }
      }
    }

    return {
      ...base,
      kind: "template",
      resolvedMessage,
      questionId: questionRow?.id ?? null,
      ...r,
    };
  }

  const settled = await Promise.allSettled(recipients.map(handleOne));

  const results = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          recipient:
            typeof recipients[i] === "object"
              ? recipients[i]?.name ||
                recipients[i]?.phoneNumber ||
                recipients[i]?.phone_number ||
                recipients[i]?.whatsappUsername ||
                recipients[i]?.whatsapp_username ||
                recipients[i]?.whatsappBsuid ||
                recipients[i]?.whatsapp_bsuid ||
                recipients[i]?.userId ||
                "Unknown recipient"
              : recipients[i],
          to:
            typeof recipients[i] === "object"
              ? recipients[i]?.phoneNumber
              : recipients[i],
          userId:
            typeof recipients[i] === "object"
              ? recipients[i]?.userId || recipients[i]?.id || null
              : null,
          ok: false,
          status: 0,
          kind: "error",
          providerMessageId: null,
          resolvedMessage: "",
          data: { error: String(r.reason) },
        },
  );

  const okCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - okCount;
  const queuedCount = results.filter(
    (r) =>
      r.ok &&
      ["template", "queued"].includes(r.kind) &&
      !sendOpeningOnly,
  ).length;
  const suppressedCount = results.filter(
    (r) => r.ok && r.kind === "suppressed",
  ).length;

  return {
    sendGroupId,
    questionId: questionRow?.id ?? null,
    ok: okCount,
    failed: failedCount,
    queued: queuedCount,
    suppressed: suppressedCount,
    results,
    error:
      okCount === 0
        ? results[0]?.data?.error ||
          results[0]?.error ||
          "WhatsApp broadcast failed for all recipients."
        : null,
    note:
      queuedCount > 0
        ? "Some messages are waiting for the opening template's Quick Reply. They will be delivered after the contact taps its button."
        : suppressedCount > 0
          ? "An opening template is already waiting for the contact's Quick Reply, so no duplicate was sent."
          : null,
  };
}
