"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import LoaderLink from "../components/TopLoader/LoaderLink";
import {
  FEATURED_PLAN_ID,
  PLANS,
  formatCount,
  formatPrice,
  pricePerUser,
} from "./plans";
import styles from "./pricingPage.module.css";
import site from "../components/Site/site.module.css";
import planStyles from "./plans.module.css";

const INCLUDED_KEYS = ["channels", "messages", "assistants", "metrics"];
const FAQ_KEYS = ["users", "free", "limits", "teams", "vat", "bigger"];

function contactHref(planId) {
  return { pathname: "/contact", query: { plano: planId } };
}

function PlanCard({ plan, featured, t, locale }) {
  const name = t(`plans.${plan.id}.name`);

  return (
    <article
      className={`${planStyles.card} ${featured ? planStyles.cardFeatured : ""}`}
      data-tier={plan.id}
      aria-labelledby={`plan-${plan.id}`}
    >
      <div className={planStyles.cardHead}>
        <h3 className={planStyles.cardName} id={`plan-${plan.id}`}>
          {name}
        </h3>
        {featured ? (
          <span className={planStyles.badge}>{t("featuredBadge")}</span>
        ) : null}
      </div>

      <p className={planStyles.users}>
        {t.rich("usersUpTo", {
          users: formatCount(plan.users, locale),
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      <p className={planStyles.price}>
        <span className={planStyles.priceValue}>
          {formatPrice(plan.price, locale)}
        </span>
        <span className={planStyles.priceUnit}>{t("perMonth")}</span>
      </p>
      <p className={planStyles.perUser}>
        <span className={planStyles.perUserChip}>
          {t.rich("perUser", {
            price: formatPrice(pricePerUser(plan), locale, { decimals: 2 }),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </span>
        <span className={planStyles.flatNote}>{t("flatNote")}</span>
      </p>

      <LoaderLink
        href={contactHref(plan.id)}
        className={`${site.primary} ${planStyles.tierCta}`}
      >
        <span>{t("choose", { plan: name })}</span>
        <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
      </LoaderLink>
    </article>
  );
}

export default function PricingExplorer() {
  const t = useTranslations("PricingPage");
  const locale = useLocale();
  const [openFaq, setOpenFaq] = useState(-1);

  const freePlan = PLANS.find((plan) => plan.price === 0);
  const paidPlans = PLANS.filter((plan) => plan.price > 0);
  const largestPlan = paidPlans[paidPlans.length - 1];
  const paidDailyMessages = paidPlans[0]?.dailyMessages;

  return (
    <section className={site.section}>
      <div className={site.wrap}>
        <header className={planStyles.header}>
          <h2 className={site.sectionTitle}>{t("explorer.title")}</h2>
          <p className={planStyles.headerNote}>{t("explorer.note")}</p>
        </header>

        <div className={planStyles.grid}>
          {paidPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={plan.id === FEATURED_PLAN_ID}
              t={t}
              locale={locale}
            />
          ))}
        </div>

        <div className={planStyles.included}>
          <p className={planStyles.includedTitle}>{t("included.title")}</p>
          <ul className={planStyles.includedList}>
            {INCLUDED_KEYS.map((key) => (
              <li key={key}>
                <span className={styles.featureCheck} aria-hidden="true">
                  <Check size={13} strokeWidth={2.7} />
                </span>
                <span>
                  {t(`included.items.${key}`, {
                    messages: paidDailyMessages,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={planStyles.bands}>
          {freePlan ? (
            <article className={`${planStyles.band} ${planStyles.bandFree}`}>
              <div>
                <h3 className={planStyles.bandTitle}>
                  {t(`plans.${freePlan.id}.name`)}
                  <span className={planStyles.bandPrice}>
                    {formatPrice(0, locale)}
                  </span>
                </h3>
                <p className={planStyles.bandText}>
                  {t("freeBand.text", {
                    users: formatCount(freePlan.users, locale),
                    messages: freePlan.dailyMessages,
                  })}
                </p>
              </div>
              <LoaderLink
                href={contactHref(freePlan.id)}
                className={planStyles.bandButton}
              >
                <span>{t("freeBand.cta")}</span>
                <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
              </LoaderLink>
            </article>
          ) : null}

          <article className={planStyles.band}>
            <div>
              <h3 className={planStyles.bandTitle}>
                {t("customBand.title", {
                  users: formatCount(largestPlan.users, locale),
                })}
              </h3>
              <p className={planStyles.bandText}>{t("customBand.text")}</p>
            </div>
            <LoaderLink href="/contact" className={planStyles.bandButtonGhost}>
              <span>{t("customBand.cta")}</span>
              <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </LoaderLink>
          </article>
        </div>

        <section className={styles.faqWrap}>
          <header className={styles.faqHeader}>
            <h2 className={styles.faqTitle}>{t("faq.title")}</h2>
          </header>

          <div className={styles.faqList}>
            {FAQ_KEYS.map((key, index) => {
              const isOpen = openFaq === index;
              const answerId = `pricing-faq-answer-${key}`;

              return (
                <div
                  key={key}
                  className={`${styles.faqItem} ${
                    isOpen ? styles.faqItemOpen : ""
                  }`}
                >
                  <button
                    type="button"
                    className={styles.faqTrigger}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  >
                    <span>
                      {t(`faq.items.${key}.question`, {
                        users: formatCount(largestPlan.users, locale),
                      })}
                    </span>
                    <ChevronDown size={20} strokeWidth={2} aria-hidden="true" />
                  </button>

                  <div
                    id={answerId}
                    className={styles.faqAnswerWrap}
                    aria-hidden={!isOpen}
                  >
                    <div>
                      <p className={styles.faqAnswer}>
                        {t(`faq.items.${key}.answer`, {
                          freeUsers: formatCount(freePlan?.users ?? 0, locale),
                          freeMessages: freePlan?.dailyMessages ?? 0,
                          messages: paidDailyMessages,
                          users: formatCount(largestPlan.users, locale),
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
