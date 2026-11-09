import crypto from "crypto";
import { getBotToken } from "@/lib/teams/auth";
import { getOrganization } from "@/lib/repos/organizations.repo";
import { getTeamsUserInstallation } from "@/lib/repos/teamsInstallations.repo";
import { getUserById } from "@/lib/repos/user.repo";
import { createMessage } from "@/lib/repos/messages.repo";
import { createQuestion, getQuestionById } from "@/lib/repos/questions.repo";
import { hasReplyButtons, questionExpiryDate } from "@/lib/whatsapp/question";
import { buildQuestionCard } from "@/lib/teams/questionCard";
import { parseQuestionOptions } from "./questionOptions";
import { getUserThreadForChannel } from "@/lib/repos/threads.repo";
import { BroadcastError, normalizeFiles } from "./shared";
import { buildTeamsFileParts } from "./teamsAttachments";
import { interpolateBroadcastMessage } from "./interpolateMessage";
import {
  replaceTrackedPlaceholders,
  resolveTrackedLinksForRecipient,
} from "./trackedLinks";
import { withButtonLinksInText } from "@/lib/whatsapp/linkButton";
import { isTrustedTeamsServiceUrl } from "@/lib/teams/serviceUrl";

export async function sendTeamsBroadcast(input = {}) {
  const {
    orgId,
    userIds = [],
    message = "",
    files = [],
    imageUrls = [],
    trackedLinks = [],
    scheduledBroadcastId = null,
    automationRunId = null,
    chainMetadata = null,
    question: rawQuestion = null,
    questionId: existingQuestionId = null,
    sendGroupId = crypto.randomUUID(),
    createdByUserId = null,
  } = input;

  if (!orgId || !Array.isArray(userIds) || userIds.length === 0) {
    throw new BroadcastError("Missing orgId or userIds", 400);
  }

  const parsed = parseQuestionOptions({ question: rawQuestion });
  if (parsed.error) throw new BroadcastError(parsed.error, 400);

  /*
   * Como no WhatsApp: o passo de uma cadeia traz a pergunta já criada em
   * `questionId`; um envio normal traz-a por criar em `question`.
   */
  let questionRow = null;
  let question = parsed.question;

  if (existingQuestionId) {
    questionRow = await getQuestionById(existingQuestionId);

    if (!questionRow || Number(questionRow.organization_id) !== Number(orgId)) {
      throw new BroadcastError("Question not found", 404);
    }

    question = {
      kind: questionRow.kind,
      body: questionRow.body,
      options: questionRow.options,
    };
  }

  const withButtons = Boolean(question) && hasReplyButtons(question.kind);

  /* A pergunta é a própria mensagem. */
  const messageText = question ? question.body : message;

  const normalizedFiles = normalizeFiles({ files, imageUrls });

  if (!String(messageText || "").trim() && normalizedFiles.length === 0) {
    throw new BroadcastError("Message or files must be provided", 400);
  }

  const org = await getOrganization(orgId);
  if (!org) {
    throw new BroadcastError("Organization not found", 400);
  }

  if (question && !questionRow) {
    questionRow = await createQuestion({
      organizationId: orgId,
      kind: question.kind,
      body: question.body,
      options: withButtons ? question.options : null,
      /* Na sondagem, feedback_correct guarda o agradecimento. */
      feedbackCorrect:
        question.kind === "quiz"
          ? question.feedbackCorrect
          : question.kind === "survey"
            ? question.thanksText
            : null,
      feedbackIncorrect:
        question.kind === "quiz" ? question.feedbackIncorrect : null,
      expectedAnswer: question.expectedAnswer,
      aiEvaluation: withButtons ? true : question.aiEvaluation !== false,
      scheduledBroadcastId,
      sendGroupId,
      createdByUserId,
      expiresAt: questionExpiryDate(),
    });
  }

  const results = [];

  for (const userId of userIds) {
    const install = await getTeamsUserInstallation({
      userId,
      organizationId: orgId,
      conversationType: "personal",
    });

    if (
      !install ||
      !install?.tenant_id ||
      !install?.service_url ||
      !install?.conversation_id
    ) {
      results.push({
        userId,
        ok: false,
        error: "No Teams installation found for this user (personal).",
      });
      continue;
    }

    if (!isTrustedTeamsServiceUrl(install.service_url)) {
      results.push({ userId, ok: false, error: "Endereço do serviço Teams não autorizado." });
      continue;
    }

    try {
      const token = await getBotToken(install.tenant_id);

      const endpoint = `${String(install.service_url).replace(/\/$/, "")}/v3/conversations/${encodeURIComponent(install.conversation_id)}/activities`;

      const fileParts = buildTeamsFileParts(normalizedFiles);

      const resolvedTrackedLinks = await resolveTrackedLinksForRecipient({
        trackedLinks,
        orgId,
        channel: "teams",
        recipientUserId: userId,
        scheduledBroadcastId,
        sendGroupId,
        createdByUserId,
      });

      const user = await getUserById(userId);

      // Nome, empresa, email e telemóvel, como no WhatsApp.
      let text = interpolateBroadcastMessage(
        replaceTrackedPlaceholders(
          withButtonLinksInText(messageText, resolvedTrackedLinks, {
            markdown: true,
          }),
          resolvedTrackedLinks,
        ),
        { user, org, assistant: null },
      ).trim();

      /* Quiz e sondagem: o texto vai dentro do cartão, com os botões. */
      const questionCard = withButtons
        ? buildQuestionCard({ text, options: question.options })
        : null;

      if (fileParts.linksText) {
        text = [text, fileParts.linksText].filter(Boolean).join("\n\n");
      }

      if (!text) text = " ";

      console.log("[Teams final message]", {
        sendGroupId,
        userId,
        text,
        resolvedTrackedLinks,
      });

      const payload = {
        type: "message",
        ...(questionCard ? {} : { text, textFormat: "markdown" }),
        attachments: [
          ...fileParts.attachments,
          ...(questionCard ? [questionCard] : []),
        ],
      };

      const res = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }

      /*
       * Keep the Teams activity id so read receipts can mark it read.
       * The message already went out, so a failure here is only logged.
       */
      let messageRow = null;

      if (res.ok && user) {
        try {
          const thread = user.assistant_id
            ? await getUserThreadForChannel({
                userId,
                assistantId: user.assistant_id,
                channel: "teams",
              })
            : null;

          messageRow = await createMessage({
            threadId: thread?.id ?? null,
            userId,
            organizationId: orgId,
            assistantId: user.assistant_id ?? null,
            channel: "teams",
            messageId: data?.id ?? null,
            content: text,
            role: "assistant",
            deliveryStatus: "accepted",
            scheduledBroadcastId,
            automationRunId,
            questionId: questionRow?.id ?? null,
            ...(chainMetadata || {}),
          });
        } catch (recordErr) {
          console.error("[Teams broadcast] could not record message", {
            userId,
            error: recordErr?.message || String(recordErr),
          });
        }
      }

      results.push({
        userId,
        ok: res.ok,
        status: res.status,
        providerMessageId: data?.id ?? null,
        messageRowId: messageRow?.id ?? null,
        data,
      });
    } catch (err) {
      results.push({
        userId,
        ok: false,
        error: err.message || String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - okCount;

  return {
    sendGroupId,
    ok: okCount,
    failed: failedCount,
    results,
    error:
      okCount === 0
        ? results[0]?.error ||
          results[0]?.data?.error ||
          "Teams broadcast failed for all recipients."
        : null,
  };
}
