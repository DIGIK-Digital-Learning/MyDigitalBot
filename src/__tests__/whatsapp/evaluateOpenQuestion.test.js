import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/openai/client", () => ({ openai: {} }));
vi.mock("@/lib/services/openaiResponses.service", () => ({
  resolveAssistantVectorStore: vi.fn(),
}));
import { AI_MODELS } from "@/lib/openai/models";
import { evaluateOpenQuestion } from "@/lib/services/questions/evaluateOpenQuestion";
import { appendQuestionContext } from "@/lib/services/questions/appendQuestionContext";

const evaluation = {
  verdict: "completa",
  missing_points: [],
  feedback: "Certo, os pneus devem estar frios.",
};
function setup(
  response = { status: "completed", output_text: JSON.stringify(evaluation) },
) {
  const create = vi.fn(async () => response);
  return {
    assistant: {
      id: 7,
      model: "gpt-5.6",
      instructions: "Sê breve.",
      vector_store_id: 2,
    },
    question: { body: "Como verificas?", expected_answer: "A frio." },
    answerText: "A frio.",
    deps: {
      openai: { responses: { create } },
      resolveAssistantVectorStore: vi.fn(async () => "vs_123"),
    },
  };
}
describe("avaliação isolada", () => {
  it("usa modelo, instruções, ficheiros e esquema JSON sem conversa", async () => {
    const args = setup();
    expect(await evaluateOpenQuestion(args)).toEqual(evaluation);
    const [request, options] = args.deps.openai.responses.create.mock.calls[0];
    // #250: o modelo da app, com respostas rápidas e sem temperatura.
    expect(request.model).toBe(AI_MODELS.text);
    expect(request.reasoning).toEqual({ effort: "none" });
    expect(request).not.toHaveProperty("temperature");
    expect(request.instructions).toContain("Sê breve.");
    expect(request.conversation).toBeUndefined();
    expect(request.tools).toEqual([
      { type: "file_search", vector_store_ids: ["vs_123"] },
    ]);
    expect(request.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
    expect(options).toMatchObject({ timeout: 10000, maxRetries: 0 });
  });
  it.each([
    { status: "incomplete", output_text: JSON.stringify(evaluation) },
    { status: "completed", output_text: "não é JSON" },
    {
      status: "completed",
      output_text: JSON.stringify({ ...evaluation, verdict: "certa" }),
    },
    {
      status: "completed",
      output_text: JSON.stringify({ ...evaluation, feedback: "" }),
    },
    {
      status: "completed",
      output_text: JSON.stringify({ ...evaluation, missing_points: [42] }),
    },
    {
      status: "completed",
      output_text: JSON.stringify({
        ...evaluation,
        feedback: "a".repeat(1025),
      }),
    },
  ])("rejeita avaliação inválida ou incompleta (%j)", async (response) => {
    await expect(evaluateOpenQuestion(setup(response))).rejects.toThrow();
  });
  it("funciona sem base de conhecimento", async () => {
    const args = setup();
    args.deps.resolveAssistantVectorStore.mockResolvedValue(null);
    await evaluateOpenQuestion(args);
    expect(
      args.deps.openai.responses.create.mock.calls[0][0].tools,
    ).toBeUndefined();
  });
  it("guarda pergunta, resposta e feedback por ordem sem gerar resposta", async () => {
    const create = vi.fn();
    await appendQuestionContext({
      conversationId: "conv_1",
      question: { body: "Pergunta" },
      answerText: "Resposta",
      replies: ["Feedback", "Esperada"],
      deps: { openai: { conversations: { items: { create } } } },
    });
    expect(create.mock.calls[0].slice(0, 2)).toEqual([
      "conv_1",
      {
        items: [
          { type: "message", role: "assistant", content: "Pergunta" },
          { type: "message", role: "user", content: "Resposta" },
          { type: "message", role: "assistant", content: "Feedback" },
          { type: "message", role: "assistant", content: "Esperada" },
        ],
      },
    ]);
  });
});
