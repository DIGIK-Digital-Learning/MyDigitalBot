"use client";

import { use, useEffect, useMemo, useState } from "react";
import styles from "./redirect.module.css";
import { useTranslations } from "next-intl";

export default function TrackedRedirectPage({ params }) {
  const resolvedParams = use(params);
  const token = String(resolvedParams?.token || "");

  const translation = useTranslations("Redirect");
  const [status, setStatus] = useState("loading");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch(`/api/tracked-links/${token}`, {
          method: "GET",
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          console.error("Tracked link API failed", {
            status: res.status,
            data,
            token,
          });

          /* O erro da API fica no registo acima; ao visitante mostra-se o texto traduzido. */
          throw new Error(translation("openFailed"));
        }

        const url = String(data?.destinationUrl || "").trim();

        if (!url) {
          throw new Error(translation("noDestination"));
        }

        if (cancelled) return;

        setDestinationUrl(url);
        setStatus("redirecting");

        window.location.replace(url);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || translation("openFailed"));
        setStatus("error");
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [token, translation]);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <div className={styles.logo}>MyDigitalBot</div>
        </div>

        <h1 className={styles.title}>
          {status === "error"
            ? translation("unavailable")
            : translation("opening")}
        </h1>

        {status !== "error" && (
          <>
            <p className={styles.text}>{translation("preparing")}</p>

            <div className={styles.spinnerWrap}>
              <div className={styles.spinner} />
            </div>
          </>
        )}

        {status === "error" && (
          <p className={styles.errorText}>
            {error || translation("openFailed")}
          </p>
        )}

        {destinationUrl && (
          <div className={styles.statusBox}>
            <div className={styles.statusLabel}>
              {translation("destination")}
            </div>
            <div className={styles.statusValue}>{destinationUrl}</div>
          </div>
        )}

        <div className={styles.actions}>
          {destinationUrl && (
            <a href={destinationUrl} className={styles.primaryBtn}>
              {translation("continue")}
            </a>
          )}

          {status === "redirecting" && destinationUrl && (
            <button
              type="button"
              onClick={() => window.location.assign(destinationUrl)}
              className={styles.secondaryBtn}
            >
              {translation("retry")}
            </button>
          )}
        </div>

        <p className={styles.footnote}>{translation("footnote")}</p>
      </div>
    </main>
  );
}
