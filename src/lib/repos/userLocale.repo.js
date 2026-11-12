import { getSupabaseAdminClient } from "@/lib/db/admin";
import { BOT_LOCALES } from "@/lib/bot/botLanguage";

/*
 * Língua em que o bot fala com o colaborador (#241), em `user.locale`.
 *
 * Fica num ficheiro à parte e não entra nas outras leituras do utilizador de
 * propósito: se a coluna ainda não existir (migração por correr), só isto
 * falha, e o bot continua a funcionar na língua da organização.
 */

/** A língua guardada (pt ou en), ou null. Nunca lança erro. */
export async function getUserLocale(userId) {
  if (!userId) return null;

  try {
    const { data, error } = await getSupabaseAdminClient()
      .from("user")
      .select("locale")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;

    return BOT_LOCALES.includes(data?.locale) ? data.locale : null;
  } catch (error) {
    console.warn("[bot language] could not read user locale", {
      userId,
      error: error?.message || String(error),
    });
    return null;
  }
}

export async function setUserLocale(userId, locale) {
  if (!userId || !BOT_LOCALES.includes(locale)) return;

  const { error } = await getSupabaseAdminClient()
    .from("user")
    .update({ locale })
    .eq("id", userId);

  if (error) throw error;
}
