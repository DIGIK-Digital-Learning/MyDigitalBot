import { parseWhatsappFormat } from "@/lib/whatsapp/textFormat";

/*
 * Limites do conteúdo de uma mensagem (#187): caracteres e ficheiros. Não lê
 * nada, para o balão (browser) e as rotas (servidor) contarem exatamente da
 * mesma forma: o contador nunca diz 1.490 quando o servidor conta 1.510.
 */

/*
 * Quanto vale uma variável ({{nome}}, {{empresa}}, {{link.x}}) na contagem.
 * O valor real só se sabe no envio (cada contacto tem o seu nome); 20 é um
 * nome ou empresa comprido, para o contador raramente ficar abaixo do real.
 */
export const VARIABLE_VISIBLE_LENGTH = 20;

const VARIABLE_RE = /\{\{\s*[\w.-]+\s*\}\}/g;

/* O texto da árvore de formatação sem as marcas (*, _, ~, ```). */
function plainText(nodes) {
  return nodes
    .map((node) =>
      node.type === "text" || node.type === "mono"
        ? node.value
        : plainText(node.children || []),
    )
    .join("");
}

/**
 * Tamanho da mensagem como a pessoa a vê: sem as marcas de formatação e com
 * cada variável a valer VARIABLE_VISIBLE_LENGTH. "*olá* {{nome}}" vale
 * 3 + 1 + 20 = 24.
 */
export function visibleMessageLength(text) {
  const plain = plainText(parseWhatsappFormat(String(text || "")));
  const variables = plain.match(VARIABLE_RE) || [];
  const withoutVariables = plain.replace(VARIABLE_RE, "");
  return withoutVariables.length + variables.length * VARIABLE_VISIBLE_LENGTH;
}

/**
 * O que está a mais numa mensagem, segundo os limites do plano. Devolve
 * `{ code, limit }` do primeiro problema, ou null se estiver tudo dentro.
 * As perguntas não passam por aqui: o enunciado tem o seu limite (1.024).
 */
export function messageContentProblem({ message = "", files = [] }, limits = {}) {
  const charLimit = limits?.messageChars ?? null;
  if (charLimit !== null && visibleMessageLength(message) > charLimit) {
    return { code: "MESSAGE_TOO_LONG", limit: charLimit };
  }

  const fileLimit = limits?.filesPerMessage ?? null;
  if (fileLimit !== null && Array.isArray(files) && files.length > fileLimit) {
    return { code: "TOO_MANY_FILES", limit: fileLimit };
  }

  return null;
}

/* O máximo técnico por ficheiro, hoje (bucket broadcast-media no Supabase). */
export const TECHNICAL_FILE_MAX_MB = 20;

/**
 * MB por ficheiro: o mais baixo entre o máximo técnico (20 MB) e o do plano
 * (#187, 4b). Hoje o plano diz 50, por isso valem os 20 técnicos.
 */
export function effectiveFileSizeMb(planFileSizeMb) {
  if (planFileSizeMb === null || planFileSizeMb === undefined) {
    return TECHNICAL_FILE_MAX_MB;
  }
  return Math.min(TECHNICAL_FILE_MAX_MB, planFileSizeMb);
}
