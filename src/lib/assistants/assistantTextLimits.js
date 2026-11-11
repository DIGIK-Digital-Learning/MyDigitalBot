import { limitKeepingCurrent } from "@/lib/plans/limitRules";

/*
 * Tamanho do título e da descrição de um assistente, iguais em todos os
 * planos. Servem ao ecrã (contador e caixa) e ao servidor (recusa), para os
 * dois nunca ficarem diferentes.
 */
export const ASSISTANT_NAME_MAX_CHARS = 80;
export const ASSISTANT_DESCRIPTION_MAX_CHARS = 200;

/**
 * Limites de um assistente concreto. Um assistente gravado antes destes
 * limites (ex.: título com 95 caracteres) pode ficar como está ou encurtar,
 * mas não crescer — a mesma regra das instruções (#185). Ao criar, sem
 * `current`, vale o limite.
 */
export function assistantTextLimits(current = {}) {
  return {
    name: limitKeepingCurrent(
      ASSISTANT_NAME_MAX_CHARS,
      String(current?.name ?? "").length,
    ),
    description: limitKeepingCurrent(
      ASSISTANT_DESCRIPTION_MAX_CHARS,
      String(current?.description ?? "").length,
    ),
  };
}

/**
 * Para o servidor: o primeiro campo acima do limite, ou null se estiver tudo
 * bem. Só verifica os campos que vêm no pedido.
 */
export function assistantTextTooLong(fields = {}, current = {}) {
  const limits = assistantTextLimits(current);

  if (
    fields.name !== undefined &&
    fields.name !== null &&
    String(fields.name).trim().length > limits.name
  ) {
    return { code: "ASSISTANT_NAME_TOO_LONG", limit: limits.name };
  }

  if (
    fields.description !== undefined &&
    fields.description !== null &&
    String(fields.description).length > limits.description
  ) {
    return {
      code: "ASSISTANT_DESCRIPTION_TOO_LONG",
      limit: limits.description,
    };
  }

  return null;
}
