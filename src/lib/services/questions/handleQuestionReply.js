import {
  EXPIRED_QUESTION_TEXT,
  extractInboundReply,
  isQuestionExpired,
  quizFeedbackText,
  resolveQuizOption,
  surveyThanksText,
} from "@/lib/whatsapp/question";
import {
  createMessage,
  getMessageByProviderId,
  getRecentQuestionMessagesForUser,
} from "@/lib/repos/messages.repo";
import {
  createQuestionAnswer,
  getQuestionAnswer,
  getQuestionById,
  updateQuestionAnswerEvaluation,
} from "@/lib/repos/questions.repo";
import { interpolateBroadcastMessage } from "@/lib/services/broadcast/interpolateMessage";
import { evaluateOpenQuestion } from "./evaluateOpenQuestion";
import { appendQuestionContext } from "./appendQuestionContext";

const defaultDeps = {
  createMessage,
  getMessageByProviderId,
  getRecentQuestionMessagesForUser,
  createQuestionAnswer,
  getQuestionAnswer,
  getQuestionById,
  updateQuestionAnswerEvaluation,
  evaluateOpenQuestion,
  appendQuestionContext,
};

/**
 * Descobre a que pergunta esta mensagem responde.
 *
 * 1. Um toque num botão traz `replyTo.id`, o id da mensagem que enviámos.
 *    Se essa mensagem tiver pergunta, é essa.
 * 2. Texto escrito à mão: responde à pergunta aberta mais recente ainda por
 *    responder, ou a uma opção do quiz mais recente com texto igual.
 *
 * Devolve null quando a mensagem não é resposta a nenhuma pergunta.
 *
 * `reply` já interpretado substitui o `payload` do Bird (é o caso do Teams,
 * #151). Só conta a pergunta enviada pelo mesmo canal.
 */
export async function findQuestionForReply({
  user,
  payload,
  reply: givenReply = null,
  channel = "whatsapp",
  inboundMsgId = null,
  deps,
}) {
  const d = { ...defaultDeps, ...deps };
  const reply = givenReply ?? extractInboundReply(payload);

  if (reply.replyToMessageId) {
    const message = await d.getMessageByProviderId(
      reply.replyToMessageId,
      user.organization_id,
    );

    if (message?.question_id && Number(message.user_id) === Number(user.id)) {
      const question = await d.getQuestionById(message.question_id);

      if (
        question &&
        Number(question.organization_id) === Number(user.organization_id)
      ) {
        return { reply, question, message };
      }
    }

    /*
     * Um toque num botão que não é de pergunta (por exemplo o "Aceito" da
     * abertura) não é resposta a nada.
     */
    if (reply.isTap) return null;
  }

  if (reply.isTap || !reply.text.trim()) return null;

  const recent = await d.getRecentQuestionMessagesForUser(user.id, 1, channel);
  const message = recent[0];

  if (!message?.question_id) return null;

  const question = await d.getQuestionById(message.question_id);

  if (
    !question ||
    Number(question.organization_id) !== Number(user.organization_id) ||
    isQuestionExpired(question, Date.now(), message.created_at)
  ) {
    return null;
  }

  if (question.kind === "open") {
    // Depois da primeira resposta, texto livre volta à conversa normal.
    const previous = await d.getQuestionAnswer(question.id, user.id);
    if (
      previous &&
      (!inboundMsgId || previous.inbound_message_id !== inboundMsgId)
    )
      return null;
    return { reply, question, message };
  }

  if (!resolveQuizOption({ reply, options: question.options })) {
    return null;
  }

  return { reply, question, message };
}

/**
 * Trata uma mensagem recebida como resposta a uma pergunta.
 *
 * Devolve `{ handled: false }` quando a mensagem não responde a nenhuma
 * pergunta e deve seguir o caminho normal (assistente de IA). Caso
 * contrário regista a resposta, envia o feedback e devolve o resultado.
 *
 * Só a primeira resposta conta: toques seguintes à mesma pergunta ficam
 * guardados na conversa mas não recebem feedback nem vão à IA.
 *
 * `claimWeeklyMessage({ kind })` conta a resposta no limite semanal do
 * colaborador e devolve `{ allowed, notice }`. Acima do limite a resposta
 * fica registada na mesma: o quiz e a sondagem recebem o feedback (texto
 * fixo), a pergunta aberta só a resposta esperada (sem avaliação da IA), e
 * na primeira vez da semana segue o aviso.
 */
export async function handleQuestionReply({
  user,
  payload,
  reply: givenReply = null,
  channel = "whatsapp",
  inboundMsgId = null,
  contactId = null,
  organization = null,
  sendText,
  resolveThread,
  claimWeeklyMessage = null,
  deps,
}) {
  const d = { ...defaultDeps, ...deps };

  /* Variáveis do contacto ({{nome}}, {{empresa}}) nos textos de feedback. */
  const personalize = (text) =>
    interpolateBroadcastMessage(text, { user, org: organization });

  const found = await findQuestionForReply({
    user,
    payload,
    reply: givenReply,
    channel,
    inboundMsgId,
    deps: d,
  });

  if (!found) return { handled: false };

  const { reply, question, message } = found;

  const isOpen = question.kind === "open";
  const isSurvey = question.kind === "survey";
  if (!isOpen && !isSurvey && question.kind !== "quiz") {
    return { handled: false };
  }
  if (isOpen && (reply.isTap || !reply.text.trim())) return { handled: false };

  const option = resolveQuizOption({ reply, options: question.options });

  if (!isOpen && !option) return { handled: false };

  const thread = (await resolveThread?.({ question, message })) || {};

  const inboundRow = await d.createMessage({
    threadId: thread.threadId ?? null,
    userId: user.id,
    organizationId: user.organization_id,
    assistantId: thread.assistantId ?? user.assistant_id ?? null,
    channel,
    messageId: inboundMsgId,
    externalContactId: contactId,
    content: reply.text,
    role: "user",
  });

  async function reply_(text) {
    const sendRes = await sendText(text);

    await d.createMessage({
      threadId: thread.threadId ?? null,
      userId: user.id,
      organizationId: user.organization_id,
      assistantId: thread.assistantId ?? user.assistant_id ?? null,
      channel,
      messageId: sendRes?.providerMessageId || null,
      externalContactId: contactId,
      content: text,
      role: "assistant",
      deliveryStatus: sendRes?.ok ? "accepted" : "failed",
      failedAt: sendRes?.ok ? null : new Date().toISOString(),
    });

    return sendRes;
  }

  if (isQuestionExpired(question, Date.now(), message?.created_at)) {
    await reply_(EXPIRED_QUESTION_TEXT);

    return {
      handled: true,
      outcome: "expired",
      questionId: question.id,
    };
  }

  /* Na sondagem não há resposta certa. */
  const isCorrect =
    isOpen || isSurvey
      ? null
      : Boolean(question.options?.[option.index]?.correct);

  const answer = await d.createQuestionAnswer({
    questionId: question.id,
    organizationId: user.organization_id,
    userId: user.id,
    messageId: message?.id ?? null,
    /* A coluna é uuid (ids do Bird); os ids do Teams têm outro formato. */
    inboundMessageId: channel === "whatsapp" ? inboundMsgId : null,
    answerText: reply.text,
    optionIndex: option?.index ?? null,
    isCorrect,
    ...(isOpen ? { reviewNeeded: true } : {}),
  });

  if (!answer) {
    return {
      handled: true,
      outcome: "duplicate",
      questionId: question.id,
      inboundMessageRowId: inboundRow?.id ?? null,
    };
  }

  /* Limite semanal do colaborador: a resposta conta 1. */
  const weekly = (await claimWeeklyMessage?.({ kind: question.kind })) || {
    allowed: true,
    notice: null,
  };

  if (isOpen) {
    let evaluation = null;
    let reviewNeeded = false;
    if (question.ai_evaluation !== false && weekly.allowed) {
      try {
        evaluation = await d.evaluateOpenQuestion({
          assistant: thread.assistant,
          question: { ...question, body: message.content || question.body },
          answerText: reply.text,
        });
      } catch (error) {
        reviewNeeded = true;
        console.warn("Falha na avaliação da pergunta", {
          questionId: question.id,
          error: error.message,
        });
      }
    }

    const replies = [];
    async function sendOpenReply(text) {
      try {
        const result = await reply_(text);
        if (result?.ok) replies.push(text);
        else reviewNeeded = true;
      } catch (error) {
        reviewNeeded = true;
        console.warn("Falha no envio da resposta à pergunta", {
          questionId: question.id,
          error: error.message,
        });
      }
    }
    if (evaluation) {
      await sendOpenReply(evaluation.feedback);
    }
    const expected = `Resposta esperada:\n${question.expected_answer}`;
    await sendOpenReply(expected);

    try {
      await d.appendQuestionContext({
        conversationId: thread.conversationId,
        question: { ...question, body: message.content || question.body },
        answerText: reply.text,
        replies,
      });
    } catch (error) {
      reviewNeeded = true;
      console.warn("Falha ao guardar o contexto da pergunta", {
        questionId: question.id,
        error: error.message,
      });
    }
    await d.updateQuestionAnswerEvaluation(answer.id, {
      verdict: evaluation?.verdict ?? null,
      aiFeedback: evaluation?.feedback ?? null,
      reviewNeeded,
    });
    if (weekly.notice) await reply_(weekly.notice);
    return {
      handled: true,
      outcome: "answered",
      questionId: question.id,
      answerId: answer.id,
      verdict: evaluation?.verdict ?? null,
      reviewNeeded,
      weeklyLimitReached: !weekly.allowed,
    };
  }

  const feedback = personalize(
    isSurvey
      ? surveyThanksText(question)
      : quizFeedbackText(question, isCorrect),
  );

  await reply_(feedback);
  if (weekly.notice) await reply_(weekly.notice);

  return {
    handled: true,
    outcome: "answered",
    questionId: question.id,
    answerId: answer.id,
    optionIndex: option.index,
    matchedBy: option.matchedBy,
    isCorrect,
    feedback,
    weeklyLimitReached: !weekly.allowed,
  };
}
