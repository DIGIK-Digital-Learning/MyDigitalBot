/**
 * Perguntas WhatsApp: quiz com botões de resposta rápida e pergunta aberta.
 *
 * Este ficheiro não lê variáveis de ambiente, por isso pode ser importado
 * tanto no servidor como no browser.
 *
 * Formato verificado com o Bird (issue #101):
 * - envio: body { type: "text", text: { text, actions: [{ type: "reply",
 *   reply: { text } }] } }, no máximo 3 botões, só com a janela aberta;
 * - toque: body.text.text é o título do botão e body.text.actions[0] é
 *   { type: "postback", postback: { text, payload: "item_<índice>" } };
 *   replyTo.id é o id da mensagem enviada.
 */

import { DEFAULT_BOT_LOCALE } from "@/lib/bot/botLanguage";
import { BOT_TEXTS, botText } from "@/lib/bot/botTexts";

export const QUESTION_KINDS = ["quiz", "survey", "open"];

/* Tipos com botões de resposta rápida. */
export const BUTTON_QUESTION_KINDS = ["quiz", "survey"];

export function hasReplyButtons(kind) {
  return BUTTON_QUESTION_KINDS.includes(kind);
}

export const QUIZ_MIN_OPTIONS = 2;
export const QUIZ_MAX_OPTIONS = 3;

/* Limites da Meta para botões de resposta rápida e corpo de mensagem. */
export const QUIZ_OPTION_MAX_LENGTH = 20;
export const QUESTION_BODY_MAX_LENGTH = 1024;
export const QUESTION_FEEDBACK_MAX_LENGTH = 1024;

/* Dias durante os quais uma pergunta aceita respostas. */
export const QUESTION_VALIDITY_DAYS = 7;

/*
 * Textos por omissão, em português. A versão na língua do colaborador (#241)
 * vem de BOT_TEXTS: quizFeedbackText e surveyThanksText recebem a língua.
 */
export const DEFAULT_QUIZ_FEEDBACK_CORRECT = BOT_TEXTS.pt.quizCorrect;
export const DEFAULT_QUIZ_FEEDBACK_INCORRECT = BOT_TEXTS.pt.quizIncorrect;

/* Agradecimento por omissão depois de escolher numa sondagem. */
export const DEFAULT_SURVEY_THANKS = BOT_TEXTS.pt.surveyThanks;

/* Resposta a um toque numa pergunta cujo prazo já passou. */
export const EXPIRED_QUESTION_TEXT = BOT_TEXTS.pt.questionExpired;

export function sanitizeOptionLabel(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMultiline(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function makeQuizOption(label = "", correct = false) {
  return { label, correct: Boolean(correct) };
}

export function makeEmptyQuiz() {
  return {
    body: "",
    options: [makeQuizOption("", true), makeQuizOption(), makeQuizOption()],
    feedbackCorrect: "",
    feedbackIncorrect: "",
  };
}

/**
 * Valida e normaliza um quiz vindo do cliente ou de um payload guardado.
 * Devolve `{ error }` quando não é válido.
 */
export function normalizeQuiz(input) {
  if (!input || typeof input !== "object") {
    return { error: "Quiz is missing" };
  }

  const body = cleanMultiline(input.body);

  if (!body) {
    return { error: "The quiz question cannot be empty" };
  }

  if (body.length > QUESTION_BODY_MAX_LENGTH) {
    return {
      error: `The quiz question must have at most ${QUESTION_BODY_MAX_LENGTH} characters`,
    };
  }

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const options = rawOptions.map((option) => ({
    label: sanitizeOptionLabel(option?.label),
    correct: option?.correct === true,
  }));

  if (options.length < QUIZ_MIN_OPTIONS || options.length > QUIZ_MAX_OPTIONS) {
    return {
      error: `A quiz needs between ${QUIZ_MIN_OPTIONS} and ${QUIZ_MAX_OPTIONS} options`,
    };
  }

  if (options.some((option) => !option.label)) {
    return { error: "Every quiz option needs a label" };
  }

  if (options.some((option) => option.label.length > QUIZ_OPTION_MAX_LENGTH)) {
    return {
      error: `Quiz options must have at most ${QUIZ_OPTION_MAX_LENGTH} characters`,
    };
  }

  const labels = new Set(options.map((option) => option.label.toLowerCase()));

  if (labels.size !== options.length) {
    return { error: "Quiz options must be different from each other" };
  }

  if (options.filter((option) => option.correct).length !== 1) {
    return { error: "A quiz needs exactly one correct option" };
  }

  const feedbackCorrect = cleanMultiline(input.feedbackCorrect);
  const feedbackIncorrect = cleanMultiline(input.feedbackIncorrect);

  if (
    feedbackCorrect.length > QUESTION_FEEDBACK_MAX_LENGTH ||
    feedbackIncorrect.length > QUESTION_FEEDBACK_MAX_LENGTH
  ) {
    return {
      error: `Quiz feedback must have at most ${QUESTION_FEEDBACK_MAX_LENGTH} characters`,
    };
  }

  return {
    quiz: {
      kind: "quiz",
      body,
      options,
      feedbackCorrect,
      feedbackIncorrect,
    },
  };
}

/**
 * Verificação rápida para o botão de enviar, sem mensagens de erro.
 */
export function isQuizValid(input) {
  return !normalizeQuiz(input).error;
}

export function makeEmptySurvey() {
  return {
    body: "",
    options: [makeQuizOption(), makeQuizOption(), makeQuizOption()],
    thanksText: "",
  };
}

/**
 * Valida e normaliza uma sondagem: pergunta com 2 a 3 opções, sem resposta
 * certa, e um agradecimento opcional enviado depois da escolha.
 */
export function normalizeSurvey(input) {
  if (!input || typeof input !== "object") {
    return { error: "Survey is missing" };
  }

  const body = cleanMultiline(input.body);

  if (!body) {
    return { error: "The survey question cannot be empty" };
  }

  if (body.length > QUESTION_BODY_MAX_LENGTH) {
    return {
      error: `The survey question must have at most ${QUESTION_BODY_MAX_LENGTH} characters`,
    };
  }

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const options = rawOptions.map((option) => ({
    label: sanitizeOptionLabel(option?.label),
  }));

  if (options.length < QUIZ_MIN_OPTIONS || options.length > QUIZ_MAX_OPTIONS) {
    return {
      error: `A survey needs between ${QUIZ_MIN_OPTIONS} and ${QUIZ_MAX_OPTIONS} options`,
    };
  }

  if (options.some((option) => !option.label)) {
    return { error: "Every survey option needs a label" };
  }

  if (options.some((option) => option.label.length > QUIZ_OPTION_MAX_LENGTH)) {
    return {
      error: `Survey options must have at most ${QUIZ_OPTION_MAX_LENGTH} characters`,
    };
  }

  const labels = new Set(options.map((option) => option.label.toLowerCase()));

  if (labels.size !== options.length) {
    return { error: "Survey options must be different from each other" };
  }

  const thanksText = cleanMultiline(input.thanksText);

  if (thanksText.length > QUESTION_FEEDBACK_MAX_LENGTH) {
    return {
      error: `The survey thanks text must have at most ${QUESTION_FEEDBACK_MAX_LENGTH} characters`,
    };
  }

  return { survey: { kind: "survey", body, options, thanksText } };
}

export function isSurveyValid(input) {
  return !normalizeSurvey(input).error;
}

/**
 * Texto enviado depois da escolha numa sondagem. O administrador pode
 * escrevê-lo; fica guardado em feedback_correct.
 */
export function surveyThanksText(question, locale = DEFAULT_BOT_LOCALE) {
  const custom = cleanMultiline(
    question?.feedback_correct ?? question?.thanksText,
  );

  return custom || botText(locale, "surveyThanks");
}

export function makeEmptyOpenQuestion() {
  return { body: "", expectedAnswer: "", aiEvaluation: true };
}

export function normalizeOpenQuestion(input) {
  const body =
    typeof input?.body === "string" ? cleanMultiline(input.body) : "";
  const expectedAnswer =
    typeof input?.expectedAnswer === "string"
      ? cleanMultiline(input.expectedAnswer)
      : "";

  if (!body || body.length > QUESTION_BODY_MAX_LENGTH) {
    return {
      error: `Escreve uma pergunta com até ${QUESTION_BODY_MAX_LENGTH} caracteres.`,
    };
  }
  if (!expectedAnswer || expectedAnswer.length > QUESTION_FEEDBACK_MAX_LENGTH) {
    return {
      error: `Escreve a resposta esperada com até ${QUESTION_FEEDBACK_MAX_LENGTH} caracteres.`,
    };
  }
  if (
    input.aiEvaluation !== undefined &&
    typeof input.aiEvaluation !== "boolean"
  ) {
    return { error: "A avaliação pela IA tem de ser um valor booleano." };
  }
  return {
    question: {
      kind: "open",
      body,
      expectedAnswer,
      aiEvaluation: input.aiEvaluation !== false,
    },
  };
}

export function getCorrectOptionIndex(options = []) {
  return (options || []).findIndex((option) => option?.correct === true);
}

/**
 * Botões de resposta rápida no formato do Bird.
 */
export function buildQuizActions(options = []) {
  return (options || []).map((option) => ({
    type: "reply",
    reply: { text: option.label },
  }));
}

function fill(text, values) {
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    values[key] == null ? "" : String(values[key]),
  );
}

/**
 * Texto enviado ao contacto depois de responder. Quando o administrador não
 * escreveu feedback, usa-se o texto por omissão, na língua do colaborador.
 * `{{certa}}` é o título da opção certa.
 */
export function quizFeedbackText(
  question,
  isCorrect,
  locale = DEFAULT_BOT_LOCALE,
) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const correctIndex = getCorrectOptionIndex(options);
  const values = { certa: options[correctIndex]?.label || "" };

  const custom = isCorrect
    ? (question?.feedback_correct ?? question?.feedbackCorrect)
    : (question?.feedback_incorrect ?? question?.feedbackIncorrect);

  const text = cleanMultiline(custom);

  return fill(
    text || botText(locale, isCorrect ? "quizCorrect" : "quizIncorrect"),
    values,
  );
}

/**
 * Lê de um evento `whatsapp.inbound` o que interessa para uma resposta:
 * o texto, a ação de toque (se houver) e a mensagem a que responde.
 */
export function extractInboundReply(payload = {}) {
  const text = String(payload?.body?.text?.text ?? "");
  const actions = Array.isArray(payload?.body?.text?.actions)
    ? payload.body.text.actions
    : [];

  const postback = actions.find((action) => action?.type === "postback");

  const payloadMatch = /^item_(\d+)$/.exec(
    String(postback?.postback?.payload ?? ""),
  );

  return {
    text,
    isTap: Boolean(postback),
    tappedIndex: payloadMatch ? Number(payloadMatch[1]) : null,
    tappedText: postback?.postback?.text ?? null,
    replyToMessageId: payload?.replyTo?.id ? String(payload.replyTo.id) : null,
  };
}

/**
 * Descobre a opção escolhida. Primeiro pelo índice do toque, depois pelo
 * texto igual a uma opção (quem escreve a resposta à mão).
 */
export function resolveQuizOption({ reply, options = [] }) {
  const list = Array.isArray(options) ? options : [];

  if (
    reply?.tappedIndex != null &&
    reply.tappedIndex >= 0 &&
    reply.tappedIndex < list.length
  ) {
    return { index: reply.tappedIndex, matchedBy: "postback" };
  }

  const wanted = sanitizeOptionLabel(
    reply?.tappedText || reply?.text,
  ).toLowerCase();

  if (!wanted) return null;

  const index = list.findIndex(
    (option) => sanitizeOptionLabel(option?.label).toLowerCase() === wanted,
  );

  return index >= 0 ? { index, matchedBy: "text" } : null;
}

/**
 * Uma pergunta aceita respostas durante QUESTION_VALIDITY_DAYS depois de
 * ser entregue ao contacto (`deliveredAt`, a data da mensagem enviada).
 * Sem data de entrega vale o limite da própria pergunta, `expires_at`.
 */
export function isQuestionExpired(
  question,
  now = Date.now(),
  deliveredAt = null,
) {
  if (deliveredAt) {
    const delivered = new Date(deliveredAt).getTime();

    if (Number.isFinite(delivered)) {
      return delivered + QUESTION_VALIDITY_DAYS * 24 * 60 * 60 * 1000 <= now;
    }
  }

  const expiresAt = question?.expires_at ?? question?.expiresAt;

  if (!expiresAt) return false;

  return new Date(expiresAt).getTime() <= now;
}

export function questionExpiryDate(from = Date.now()) {
  return new Date(from + QUESTION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}
