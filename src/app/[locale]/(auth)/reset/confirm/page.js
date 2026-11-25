"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  DEFAULT_AUTH_REDIRECT,
  getSafeRedirectPath,
} from "@/lib/auth/safeRedirect";
import { changePassword } from "./actions";
import styles from "../../login/login.module.css";
import Link from "next/link";

export default function ResetConfirmPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();
  const locale = useLocale();
  const redirectPath = getSafeRedirectPath(
    searchParams.get("next"),
    `/${locale}${DEFAULT_AUTH_REDIRECT}`,
  );

  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    let unsub = () => {};

    (async () => {
      // Supabase parses #access_token when detectSessionInUrl: true
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
        return;
      }

      // Fallback: wait for auth event in case parsing is async
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_evt, sess) => {
        if (sess) setReady(true);
      });
      unsub = () => subscription.unsubscribe();
    })();

    return () => unsub();
  }, [supabase]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setStatus("loading");

    const result = await changePassword(newPw);
    if (!result.success) {
      setStatus("idle");
      setMsg(
        t(
          result.error === "password_policy"
            ? "Auth.resetConfirm.passwordPolicy"
            : "Auth.resetConfirm.genericError",
        ),
      );
      return;
    }

    setStatus("done");
    setTimeout(() => router.push(redirectPath), 800);
  }

  if (!ready) {
    return (
      <main className={styles.page}>
        <h1 className={styles.brand}>MyDigitalBot</h1>
        <p className={styles.message} style={{ textAlign: "center" }}>
          {msg || t("Auth.resetConfirm.preparing")}
        </p>
      </main>
    );
  }

  const disabled = status === "loading";

  return (
    <main className={styles.page}>
      <h1 className={styles.brand}>MyDigitalBot</h1>
      <form onSubmit={handleSubmit} className={styles.card}>
        <h1 className={styles.title}>{t("Auth.resetConfirm.title")}</h1>
        <label className={styles.label}>
          {t("Auth.resetConfirm.newPassword")}
        </label>
        <input
          className={styles.input}
          type="password"
          placeholder="••••••••"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          minLength={8}
          required
          disabled={disabled}
        />
        <button
          type="submit"
          className={styles.btnPrimary}
          data-state={status}
          disabled={disabled}
          aria-busy={status === "loading"}
          aria-live="polite"
        >
          <span className={styles.btnLabel}>
            {status === "done"
              ? t("Auth.resetConfirm.updated")
              : t("Auth.resetConfirm.confirm")}
          </span>
          {status === "loading" && (
            <span
              className={styles.spinner}
              role="status"
              aria-label={t("Auth.resetConfirm.updating")}
            />
          )}
        </button>
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(redirectPath)}`}
          className={styles.link}
        >
          {t("Auth.resetConfirm.back")}
        </Link>
        {msg && <p className={styles.message}>{msg}</p>}
      </form>
    </main>
  );
}
