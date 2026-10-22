"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useAuth } from "@/app/AuthContext.jsx";
import useOrganization from "@/app/hooks/useOrganization";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";

import { DashboardHeader } from "./components/DashboardHeader";
import { DashboardSection } from "./components/DashboardSection";
import { DashboardStat } from "./components/DashboardStat";
import { ActivityChart } from "./components/ActivityChart";
import { UpcomingList } from "./components/UpcomingList";
import { DashboardLoadingState } from "./components/DashboardLoadingState";

import useDashboardOverview from "./hooks/useDashboardOverview";

import { EMPTY_OVERVIEW } from "./lib/dashboard.constants";
import { percentage, toNumber } from "./lib/dashboard.helpers";

import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();

  const { user, loading: authLoading } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const { startLoading, stopLoading } = useGlobalLoader();

  const orgId = org?.id;

  const { overview, updatedAt, loading, error, refresh } = useDashboardOverview(
    orgId,
    !authLoading && !orgLoading,
  );

  useEffect(() => {
    const isInitialLoading =
      authLoading || orgLoading || (Boolean(orgId) && loading && !overview);

    if (isInitialLoading) {
      startLoading();
      return;
    }

    stopLoading();
  }, [
    authLoading,
    orgLoading,
    orgId,
    loading,
    overview,
    startLoading,
    stopLoading,
  ]);

  const users = overview?.users || EMPTY_OVERVIEW.users;
  const content = overview?.content || EMPTY_OVERVIEW.content;
  const automations = overview?.automations || EMPTY_OVERVIEW.automations;
  const activity = overview?.activity || EMPTY_OVERVIEW.activity;
  const upcoming = overview?.upcoming || EMPTY_OVERVIEW.upcoming;

  if (authLoading || orgLoading || (loading && orgId && !overview)) {
    return (
      <main className={styles.page}>
        {/* <DashboardHeader t={t} /> */}
        <DashboardLoadingState />
      </main>
    );
  }

  if (!orgId) {
    return (
      <main className={styles.page}>
        {/* <DashboardHeader t={t} /> */}

        <div className={styles.errorBox}>
          <p>{t("organizationMissing")}</p>
        </div>
      </main>
    );
  }

  const shareOf = (value) => percentage(value, users.total);

  const shareOfUsers = (value) =>
    t("meta.shareOfUsers", {
      percent: shareOf(value),
    });

  const updatedLabel = updatedAt
    ? t("updatedAt", {
        time: updatedAt.toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      })
    : null;

  return (
    <main className={styles.page}>
      {/* <DashboardHeader
        t={t}
        updatedLabel={updatedLabel}
        loading={loading}
        onRefresh={refresh}
      /> */}

      {error && (
        <div className={styles.errorBox} role="alert">
          <p>{t("loadError")}</p>

          <button type="button" onClick={refresh} disabled={loading}>
            {t("retry")}
          </button>
        </div>
      )}

      <div className={styles.content}>
        <DashboardSection
          title={t("groups.users")}
          description={t("sections.usersDescription")}
          linkHref="/users"
          linkLabel={t("actions.viewUsers")}
        >
          <div className={`${styles.stats} ${styles.statsFive}`}>
            <DashboardStat
              label={t("metrics.totalUsers")}
              value={users.total}
              meta={t("meta.inOrganization")}
              href="/users"
            />

            <DashboardStat
              label={t("metrics.teamsConfigured")}
              value={users.teamsConfigured}
              meta={shareOfUsers(users.teamsConfigured)}
              percent={shareOf(users.teamsConfigured)}
              href="/users"
            />

            <DashboardStat
              label={t("metrics.whatsappConfigured")}
              value={users.whatsappConfigured}
              meta={shareOfUsers(users.whatsappConfigured)}
              percent={shareOf(users.whatsappConfigured)}
              href="/users"
            />

            <DashboardStat
              label={t("metrics.teamsUsed")}
              value={users.teamsUsed}
              meta={shareOfUsers(users.teamsUsed)}
              percent={shareOf(users.teamsUsed)}
              href="/analytics"
            />

            <DashboardStat
              label={t("metrics.whatsappUsed")}
              value={users.whatsappUsed}
              meta={shareOfUsers(users.whatsappUsed)}
              percent={shareOf(users.whatsappUsed)}
              href="/analytics"
            />
          </div>
        </DashboardSection>

        <div className={styles.columns}>
          <DashboardSection
            title={t("groups.content")}
            description={t("sections.contentDescription")}
            linkHref="/assistants"
            linkLabel={t("actions.viewAssistants")}
          >
            <div className={`${styles.stats} ${styles.statsTwo}`}>
              <DashboardStat
                label={t("metrics.tags")}
                value={content.tags}
                meta={t("meta.tags")}
                href="/users"
              />
              <DashboardStat
                label={t("metrics.assistants")}
                value={content.assistants}
                meta={t("meta.assistants")}
                href="/assistants"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title={t("groups.automations")}
            description={t("sections.automationsDescription")}
            linkHref="/automations"
            linkLabel={t("actions.viewAutomations")}
          >
            <div className={`${styles.stats} ${styles.statsThree}`}>
              <DashboardStat
                label={t("metrics.automationsTotal")}
                value={automations.total}
                meta={t("meta.automationsTotal")}
                href="/automations"
              />
              <DashboardStat
                label={t("metrics.automationsActive")}
                value={automations.active}
                meta={t("meta.automationsActive", {
                  total: toNumber(automations.total),
                })}
                href="/automations"
              />
              <DashboardStat
                label={t("metrics.scheduledMessages")}
                value={automations.scheduledMessages}
                meta={t("meta.scheduledMessages")}
                href="/broadcast/scheduled"
              />
            </div>
          </DashboardSection>
        </div>

        <div className={styles.columnsWide}>
          <DashboardSection
            title={t("activity.title")}
            description={t("activity.description", {
              days: toNumber(activity.days),
            })}
            linkHref="/analytics"
            linkLabel={t("actions.viewAnalytics")}
          >
            <div className={styles.chartPanel}>
              <div className={styles.chartSummary}>
                <strong>
                  {t("activity.total", { count: toNumber(activity.total) })}
                </strong>
                <span className={styles.legend}>
                  <span>
                    <i className={styles.legendTeams} />
                    {t("activity.teams")}
                  </span>
                  <span>
                    <i className={styles.legendWhatsapp} />
                    {t("activity.whatsapp")}
                  </span>
                </span>
              </div>
              {activity.series.length ? (
                <ActivityChart series={activity.series} t={t} locale={locale} />
              ) : (
                <p className={styles.emptyState}>{t("activity.empty")}</p>
              )}
            </div>
          </DashboardSection>

          <DashboardSection
            title={t("upcoming.title")}
            description={t("upcoming.description")}
            linkHref="/broadcast/scheduled"
            linkLabel={t("actions.viewScheduled")}
          >
            <UpcomingList items={upcoming} t={t} locale={locale} />
          </DashboardSection>
        </div>
      </div>
    </main>
  );
}
