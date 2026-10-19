import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
import {
  buildQuestionDetail,
  buildQuestionReports,
} from "@/lib/services/questions/questionReports";
import { buildQuestionExport } from "@/lib/services/questions/questionExport";

const QUESTION_SELECT = `
  id,
  organization_id,
  kind,
  body,
  options,
  feedback_correct,
  feedback_incorrect,
  expected_answer,
  ai_evaluation,
  scheduled_broadcast_id,
  send_group_id,
  created_by_user_id,
  expires_at,
  created_at
`;

const ANSWER_SELECT = `
  id,
  question_id,
  organization_id,
  user_id,
  message_id,
  inbound_message_id,
  answer_text,
  option_index,
  is_correct,
  verdict,
  ai_feedback,
  admin_verdict,
  review_needed,
  answered_at
`;

function toIso(value) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function createQuestion({
  organizationId,
  kind,
  body,
  options = null,
  feedbackCorrect = null,
  feedbackIncorrect = null,
  expectedAnswer = null,
  aiEvaluation = true,
  scheduledBroadcastId = null,
  sendGroupId = null,
  createdByUserId = null,
  expiresAt,
}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("question")
    .insert([
      {
        organization_id: organizationId,
        kind,
        body,
        options,
        feedback_correct: feedbackCorrect || null,
        feedback_incorrect: feedbackIncorrect || null,
        expected_answer: expectedAnswer || null,
        ai_evaluation: aiEvaluation !== false,
        scheduled_broadcast_id: scheduledBroadcastId,
        send_group_id: sendGroupId,
        created_by_user_id: createdByUserId,
        expires_at: toIso(expiresAt),
      },
    ])
    .select(QUESTION_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function getQuestionById(id) {
  const supabase = getRepositoryReadClient();
  if (!id) return null;

  const { data, error } = await supabase
    .from("question")
    .select(QUESTION_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getQuestionsByIds(ids = []) {
  const supabase = getRepositoryReadClient();
  const clean = [...new Set((ids || []).filter(Boolean))];

  if (!clean.length) return [];

  const { data, error } = await supabase
    .from("question")
    .select(QUESTION_SELECT)
    .in("id", clean);

  if (error) throw error;
  return data || [];
}

export async function getQuestionAnswer(questionId, userId) {
  const supabase = getRepositoryReadClient();
  if (!questionId || !userId) return null;

  const { data, error } = await supabase
    .from("question_answer")
    .select(ANSWER_SELECT)
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/** Guarda a avaliação depois de reservar atomicamente a primeira resposta. */
export async function updateQuestionAnswerEvaluation(
  id,
  { verdict = null, aiFeedback = null, reviewNeeded = false },
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("question_answer")
    .update({ verdict, ai_feedback: aiFeedback, review_needed: reviewNeeded })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Regista a primeira resposta de um contacto. Devolve null quando já havia
 * uma resposta a esta pergunta (violação da chave única).
 */
export async function createQuestionAnswer({
  questionId,
  organizationId,
  userId,
  messageId = null,
  inboundMessageId = null,
  answerText = null,
  optionIndex = null,
  isCorrect = null,
  verdict = null,
  aiFeedback = null,
  reviewNeeded = false,
}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("question_answer")
    .insert([
      {
        question_id: questionId,
        organization_id: organizationId,
        user_id: userId,
        message_id: messageId,
        inbound_message_id: inboundMessageId,
        answer_text: answerText,
        option_index: optionIndex,
        is_correct: isCorrect,
        verdict,
        ai_feedback: aiFeedback,
        review_needed: Boolean(reviewNeeded),
      },
    ])
    .select(ANSWER_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }

  return data;
}

/**
 * Mensagens de envio de perguntas (uma por destinatário) e utilizadores
 * envolvidos. Auxiliares dos relatórios.
 */
async function getQuestionMessages(questionIds) {
  const supabase = getRepositoryReadClient();
  if (!questionIds.length) return [];

  const { data, error } = await supabase
    .from("message")
    .select("question_id, user_id, channel, assistant_id, created_at")
    .in("question_id", questionIds)
    .in("role", ["assistant", "system"]);

  if (error) throw error;
  return data || [];
}

async function getQuestionAnswers(questionIds) {
  const supabase = getRepositoryReadClient();
  if (!questionIds.length) return [];

  const { data, error } = await supabase
    .from("question_answer")
    .select(ANSWER_SELECT)
    .in("question_id", questionIds);

  if (error) throw error;
  return data || [];
}

async function getUsersMap(userIds) {
  const supabase = getRepositoryReadClient();
  const ids = [...new Set(userIds.filter((id) => id != null))];

  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("user")
    .select("id, name, email, phone_number")
    .in("id", ids);

  if (error) throw error;
  return new Map((data || []).map((user) => [String(user.id), user]));
}

/**
 * Lista de perguntas da organização com os totais de respostas.
 */
export async function getQuestionReportsByOrg(orgId) {
  const supabase = getRepositoryReadClient();
  const { data: questions, error } = await supabase
    .from("question")
    .select(QUESTION_SELECT)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const ids = (questions || []).map((question) => question.id);
  const [messages, answers] = await Promise.all([
    getQuestionMessages(ids),
    getQuestionAnswers(ids),
  ]);

  return buildQuestionReports({
    questions: questions || [],
    messages,
    answers,
  });
}

/**
 * Detalhe de uma pergunta: resumo, quem respondeu e quem não respondeu.
 */
export async function getQuestionReportDetail({ orgId, questionId }) {
  const supabase = getRepositoryReadClient();
  const { data: question, error } = await supabase
    .from("question")
    .select(QUESTION_SELECT)
    .eq("organization_id", orgId)
    .eq("id", questionId)
    .maybeSingle();

  if (error) throw error;
  if (!question) return null;

  const [messages, answers] = await Promise.all([
    getQuestionMessages([question.id]),
    getQuestionAnswers([question.id]),
  ]);

  const users = await getUsersMap([
    ...messages.map((row) => row.user_id),
    ...answers.map((row) => row.user_id),
  ]);

  return buildQuestionDetail({ question, messages, answers, users });
}

/**
 * Perguntas e respostas da organização para a exportação em Excel, com
 * as etiquetas de cada colaborador e os nomes dos assistentes.
 */
export async function getQuestionExportByOrg(orgId) {
  const supabase = getRepositoryReadClient();
  const { data: questions, error } = await supabase
    .from("question")
    .select(QUESTION_SELECT)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const ids = (questions || []).map((question) => question.id);
  const [messages, answers, assistants] = await Promise.all([
    getQuestionMessages(ids),
    getQuestionAnswers(ids),
    supabase.from("assistant").select("id, name").eq("organization_id", orgId),
  ]);

  if (assistants.error) throw assistants.error;

  const userIds = [
    ...new Set(
      [...messages, ...answers]
        .map((row) => row.user_id)
        .filter((id) => id != null),
    ),
  ];

  let userRows = [];
  if (userIds.length) {
    const { data, error: usersError } = await supabase
      .from("user")
      .select("id, name, email, phone_number, user_tag ( tag:tags ( name ) )")
      .in("id", userIds);

    if (usersError) throw usersError;
    userRows = data || [];
  }

  const users = new Map(
    userRows.map((user) => [
      String(user.id),
      {
        ...user,
        tags: (user.user_tag || [])
          .map((link) => link.tag?.name)
          .filter(Boolean)
          .join(", "),
      },
    ]),
  );

  return buildQuestionExport({
    questions: questions || [],
    messages,
    answers,
    users,
    assistantNames: new Map(
      (assistants.data || []).map((row) => [String(row.id), row.name]),
    ),
  });
}

/**
 * Correção manual do veredicto. Corrigir tira a resposta da lista de
 * revisão; null volta ao veredicto da IA.
 */
export async function updateQuestionAnswerAdminVerdict({
  id,
  orgId,
  adminVerdict,
}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("question_answer")
    .update({ admin_verdict: adminVerdict, review_needed: false })
    .eq("id", id)
    .eq("organization_id", orgId)
    .select(ANSWER_SELECT)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}
