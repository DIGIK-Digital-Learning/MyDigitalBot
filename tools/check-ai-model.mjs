// Confirma que um modelo da OpenAI aceita o pedido que a app lhe manda,
// antes de o pôr em src/lib/openai/models.js (#250).
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local tools/check-ai-model.mjs gpt-6-luna
//
// Faz um pedido mínimo (poucos tokens, nada guardado na OpenAI) com os mesmos
// parâmetros de textModelRequest() e diz se correu bem.

const model = process.argv[2];
const key = process.env.OPENAI_API_KEY;

if (!model) {
  console.error(
    "Falta o modelo. Ex.: node --env-file=.env.local tools/check-ai-model.mjs gpt-6-luna",
  );
  process.exit(1);
}
if (!key) {
  console.error("Falta OPENAI_API_KEY (correr com --env-file=.env.local).");
  process.exit(1);
}

const res = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    reasoning: { effort: "none" },
    instructions: "Responde só com a palavra: ok",
    input: "Teste",
    store: false,
    max_output_tokens: 40,
  }),
});

const data = await res.json().catch(() => ({}));

/*
 * exitCode em vez de process.exit(): no Windows, sair à força logo a seguir a
 * um fetch faz o Node rebentar com um erro interno.
 */
if (!res.ok || data.error) {
  console.error(
    `✗ ${model} recusou o pedido: ${data.error?.message || res.status}`,
  );
  process.exitCode = 1;
} else {
  const text = data.output
    ?.find((item) => item.type === "message")
    ?.content?.find((part) => part.type === "output_text")?.text;

  console.log(`✓ ${model} aceita o pedido da app.`);
  console.log(`  resposta: ${JSON.stringify(text)}`);
  console.log(
    `  reasoning: ${data.reasoning?.effort} | tokens: ${data.usage?.total_tokens}`,
  );
}
