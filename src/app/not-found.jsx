// app/not-found.jsx
import Link from "next/link";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import styles from "./[locale]/(auth)/login/login.module.css";

export default async function NotFound() {
  /* #243: a língua vem do pedido (next-intl). Antes tentava-se lê-la de um
     cabeçalho que não chega, e /en/... aparecia sempre em português. */
  const locale = await getLocale();

  // Consider user "authed" if Supabase cookies exist
  const c = await cookies();
  const isAuthed = !!(c.get("sb-access-token") || c.get("sb:token"));

  const targetHref = `/${locale}${isAuthed ? "/dashboard" : "/login"}`;
  const t = await getTranslations({ locale, namespace: "NotFound" });
  const targetLabel = isAuthed ? t("buttonUsers") : t("buttonLogin");

  return (
    <main className={styles.page}>
      <h1 className={styles.brand}>MyDigitalBot</h1>
      <section className={styles.card}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.message} style={{ marginBottom: "0.75rem" }}>
          {t("message")}
        </p>
        <div
          style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}
        >
          <Link href={targetHref} className={styles.btnPrimary}>
            {targetLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
