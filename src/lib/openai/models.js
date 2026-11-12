/**
 * Os modelos da OpenAI que a app usa, num sítio só (#250).
 *
 * Para mudar de modelo:
 * 1. Confirmar que o modelo novo aceita os parâmetros que mandamos:
 *    `npm run check:ai-model -- <modelo>`
 * 2. Mudar o nome aqui.
 * 3. Correr os testes. Um deles falha se algum ficheiro da app tiver o nome
 *    de um modelo escrito fora deste.
 *
 * Todos os assistentes seguem o modelo de texto daqui: o modelo guardado em
 * cada assistente (coluna `assistant.model`) já não conta. Assim, ao mudar o
 * modelo aqui, mudam todos, dos clientes todos, sem migração.
 */
export const AI_MODELS = {
  /*
   * Assistentes (WhatsApp, Teams e o teste na página dos Assistentes),
   * correção das perguntas abertas e sugestões de texto no Enviar mensagem.
   */
  text: "gpt-6-luna",

  /* Imagens geradas no Enviar mensagem. */
  image: "gpt-image-2.5-flare",
};

/**
 * O modelo e os parâmetros que o acompanham em cada pedido de texto.
 *
 * - `reasoning.effort: "none"`: respostas rápidas, como no 5.6. Sem isto o
 *   6 Luna pensa em "medium", o que é mais lento e mais caro.
 * - Não vai `temperature` nem `top_p`: o 6 Luna recusa os dois. Por isso
 *   os comportamentos Normal / Formal / Criativo saíram; o tom fica nas
 *   instruções de cada assistente.
 */
export function textModelRequest() {
  return {
    model: AI_MODELS.text,
    reasoning: { effort: "none" },
  };
}
