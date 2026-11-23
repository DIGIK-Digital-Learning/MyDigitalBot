"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatCount, formatPrice, getPlan } from "../pricing/plans";
import { lerOrigemVisita } from "@/lib/origemVisita";
import styles from "./contact.module.css";

const INITIAL_FORM = {
  name: "",
  email: "",
  company: "",
  message: "",
};

export default function ContactForm() {
  const t = useTranslations("LandingPage.Contact");
  const tPlans = useTranslations("PricingPage.plans");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [form, setForm] = useState(INITIAL_FORM);
  const [plan, setPlan] = useState(null);

  // Vindo da página de preços (?plano=team): mostra o plano escolhido e
  // começa a mensagem por ele. A pessoa pode editar ou tirar o plano.
  useEffect(() => {
    const chosen = getPlan(searchParams.get("plano"));
    if (!chosen) return;

    setPlan(chosen);
    setForm((current) =>
      current.message
        ? current
        : {
            ...current,
            message: t("form.planMessage", {
              plan: tPlans(`${chosen.id}.name`),
              users: formatCount(chosen.users, locale),
            }),
          },
    );
  }, [searchParams, t, tPlans, locale]);

  function clearPlan() {
    setPlan(null);
    setForm((current) => ({ ...current, message: "" }));
  }
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Plano, origem da visita e página seguem para o HubSpot (ver api/contact).
        body: JSON.stringify({
          ...form,
          plan: plan?.id ?? null,
          origem: lerOrigemVisita(),
          pageUri: window.location.href,
          pageName: document.title,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // A API responde em inglês; mostramos sempre a mensagem traduzida.
        throw new Error(data?.error || "contact-failed");
      }

      setStatus("success");
      setForm(INITIAL_FORM);
      setPlan(null);
    } catch {
      setStatus("error");
      setError(t("form.errors.generic"));
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {plan ? (
        <div className={styles.planChip}>
          <span>
            <span className={styles.planChipLabel}>{t("form.planLabel")}</span>{" "}
            <strong>{tPlans(`${plan.id}.name`)}</strong>
            {" · "}
            {t("form.planUsers", { users: formatCount(plan.users, locale) })}
            {" · "}
            {plan.price === 0
              ? t("form.planFree")
              : t("form.planPrice", { price: formatPrice(plan.price, locale) })}
          </span>
          <button
            type="button"
            className={styles.planChipRemove}
            onClick={clearPlan}
          >
            {t("form.planRemove")}
          </button>
        </div>
      ) : null}

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="name" className={styles.label}>
            {t("form.name")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={updateField}
            placeholder={t("form.namePlaceholder")}
            className={styles.input}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>
            {t("form.email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={updateField}
            placeholder={t("form.emailPlaceholder")}
            className={styles.input}
            required
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="company" className={styles.label}>
          {t("form.company")}
        </label>
        <input
          id="company"
          name="company"
          type="text"
          autoComplete="organization"
          value={form.company}
          onChange={updateField}
          placeholder={t("form.companyPlaceholder")}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="message" className={styles.label}>
          {t("form.message")}
        </label>
        <textarea
          id="message"
          name="message"
          value={form.message}
          onChange={updateField}
          placeholder={t("form.messagePlaceholder")}
          className={styles.textarea}
          required
        />
      </div>

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={status === "loading"}
        >
          {status === "loading" ? t("form.sending") : t("form.submit")}
        </button>

        <p className={styles.helper}>
          {t.rich("form.consent", {
            privacy: (chunks) => (
              <Link
                href="/legal?doc=privacy-policy"
                className={styles.helperLink}
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>

      <div aria-live="polite">
        {status === "success" ? (
          <p className={styles.success}>{t("form.success")}</p>
        ) : null}

        {status === "error" ? <p className={styles.error}>{error}</p> : null}
      </div>
    </form>
  );
}
