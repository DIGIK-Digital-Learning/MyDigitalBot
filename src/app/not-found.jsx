// app/not-found.jsx
import Link from "next/link";
import { headers, cookies } from "next/headers";
import styles from "./[locale]/(auth)/login/login.module.css";

export default async function NotFound() {
  // Get current path (works for both absolute and relative)
  const h = await headers();
  const raw = h.get("x-next-url") || h.get("x-request-url") || "";
  const pathish = raw.startsWith("http") ? new URL(raw).pathname : raw || "/";

  // Derive locale from first segment, default to 'pt'
  const segs = pathish.split("/").filter(Boolean);
  const locale = /^(pt|en)$/i.test(segs[0]) ? segs[0].toLowerCase() : "pt";

  // Consider user "authed" if Supabase cookies exist
  const c = await cookies();
  const isAuthed = !!(c.get("sb-access-token") || c.get("sb:token"));

  const targetHref = `/${locale}${isAuthed ? "/dashboard" : "/login"}`;
  const targetLabel = isAuthed ? "Ir para Utilizadores" : "Ir para Login";

  return (
    <main className={styles.page}>
      <h1 className={styles.brand}>MyDigitalBot</h1>
      <section className={styles.card}>
        <h2 className={styles.title}>Página não encontrada</h2>
        <p className={styles.message} style={{ marginBottom: "0.75rem" }}>
          Ups! A página que procura não existe ou foi movida.
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
