import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { DEFAULT_AUTH_REDIRECT } from "@/lib/auth/safeRedirect";
import styles from "../login/login.module.css";

/* Com MAINTENANCE_MODE=true o proxy manda as páginas de marketing para aqui.
   O login, a app, a /legal e os links rastreados continuam a funcionar. */
export default async function UnderConstructionPage() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "UnderConstruction" });
  const { user } = await getCurrentSession();

  return (
    <main className={styles.page}>
      <h1 className={styles.brand}>MyDigitalBot</h1>
      <section className={styles.card}>
        <h2 className={styles.title}>{t("title")}</h2>
        {/* .message do login é vermelho (erro); aqui o texto é informativo. */}
        <p
          className={styles.message}
          style={{ marginBottom: "0.75rem", color: "var(--ink)" }}
        >
          {t("message")}
        </p>
        <div
          style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}
        >
          <Link
            href={user ? DEFAULT_AUTH_REDIRECT : "/login"}
            className={styles.btnPrimary}
          >
            {user ? t("buttonPortal") : t("buttonLogin")}
          </Link>
        </div>
      </section>
    </main>
  );
}
