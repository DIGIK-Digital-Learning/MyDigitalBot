"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";

/* O código que o servidor devolve e o texto de cada limite. */
const LIMIT_KINDS = {
  ASSISTANT_LIMIT_REACHED: "assistants",
  USER_LIMIT_REACHED: "users",
};

/**
 * Aviso de limite do plano, com o botão "Atualizar plano" que leva à página
 * de preços. Recebe a resposta de erro do servidor ({ code, plan, limit }).
 * Também trata a Demo terminada (PLAN_EXPIRED), com "Ativar plano".
 * Devolve true se era um erro de limite (e o aviso foi mostrado), false se
 * era outro erro, para quem chama mostrar o aviso normal.
 */
export default function usePlanLimitPrompt() {
  const translation = useTranslations("Plans.limits");
  const demoTranslation = useTranslations("Plans.demo");
  const locale = useLocale();
  const confirm = useConfirm();
  const router = useRouter();

  /*
   * Com a língua no caminho; o proxy do next-intl tira o prefixo da língua
   * por omissão (pt), como nos outros links da aplicação.
   */
  const goToPricing = () => router.push(`/${locale}/pricing`);

  return async function promptPlanLimit(error) {
    /* A Demo terminou (#209): criar e enviar só depois de ativar um plano. */
    if (error?.code === "PLAN_EXPIRED") {
      const activate = await confirm({
        title: demoTranslation("endedTitle"),
        message: demoTranslation("endedMessage"),
        confirmText: demoTranslation("activate"),
        cancelText: translation("later"),
      });

      if (activate) goToPricing();
      return true;
    }

    const kind = LIMIT_KINDS[error?.code];
    if (!kind) return false;

    /* Sem o plano e o máximo (não foi possível lê-los), um texto geral. */
    const message =
      error.plan && error.limit
        ? translation(kind, { plan: error.plan, limit: error.limit })
        : translation(`${kind}NoDetail`);

    const upgrade = await confirm({
      title: translation(`${kind}Title`),
      message,
      confirmText: translation("upgrade"),
      cancelText: translation("later"),
    });

    if (upgrade) goToPricing();
    return true;
  };
}
