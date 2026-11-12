import { detectMessageLanguage } from "@/lib/bot/botLanguage";
import { getUserLocale, setUserLocale } from "@/lib/repos/userLocale.repo";

const defaultDeps = { getUserLocale, setUserLocale };

/**
 * Junta ao colaborador a língua em que o bot lhe deve responder (#241).
 *
 * - `typedText` é o que o colaborador escreveu à mão. Toques em botões não
 *   contam: o texto do botão é do administrador, não do colaborador.
 * - Se a mensagem for claramente em português ou em inglês e diferente da
 *   língua guardada, passa a ser essa (e fica guardada para as seguintes).
 * - Senão mantém-se a guardada; sem nenhuma, `locale` fica null e as
 *   mensagens usam a da organização (botLocale).
 *
 * Nunca lança erro: se não conseguir guardar, responde na mesma na língua
 * em que o colaborador escreveu.
 */
export async function withConversationLanguage(user, typedText = "", deps) {
  if (!user?.id) return user;

  const d = { ...defaultDeps, ...deps };

  const stored = await d.getUserLocale(user.id);
  const detected = detectMessageLanguage(typedText);

  if (detected && detected !== stored) {
    try {
      await d.setUserLocale(user.id, detected);
    } catch (error) {
      console.warn("[bot language] could not save user locale", {
        userId: user.id,
        error: error?.message || String(error),
      });
    }

    return { ...user, locale: detected };
  }

  return { ...user, locale: stored };
}
