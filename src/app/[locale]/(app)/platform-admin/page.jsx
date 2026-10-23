"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import {
  announceAdminPlanChanged,
  changeOrganizationPlan,
  fetchAdminOverview,
  updatePlanLimits,
} from "@/lib/admin/admin.api";

import styles from "./admin.module.css";

/* Os limites pela ordem em que aparecem na tabela dos planos. */
const LIMIT_ORDER = [
  "users",
  "assistants",
  "assistantInstructionChars",
  "filesPerAssistant",
  "automations",
  "scheduledMessages",
  "trackedLinks",
  "dailyMessagesPerChannel",
  "collaboratorWeeklyMessages",
  "messageChars",
  "filesPerMessage",
  "fileSizeMb",
  "chainMessages",
];

/* O uso que se mostra de cada organização, com o limite correspondente. */
const USAGE_COLUMNS = [
  ["users", "users"],
  ["assistants", "assistants"],
  ["automations", "automations"],
  ["scheduledMessages", "scheduledMessages"],
  ["trackedLinks", "trackedLinks"],
];

/* Os valores de um plano como texto, para os campos ("" = sem limite). */
function planDraft(plan) {
  const draft = { durationDays: plan.durationDays ?? "" };
  for (const name of LIMIT_ORDER) draft[name] = plan.limits[name] ?? "";
  return draft;
}

/**
 * Área de administração dos planos (#208), só para a equipa DIGIK: mudar o
 * plano de cada organização e ver o que já gastou, editar os limites dos
 * planos e experimentar a app como outro plano na própria organização.
 */
export default function AdminPage() {
  const translation = useTranslations();
  const showAlert = useAlert();
  const confirm = useConfirm();

  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const overview = await fetchAdminOverview();
      setData(overview);
      setDrafts(
        Object.fromEntries(
          overview.plans.map((plan) => [plan.id, planDraft(plan)]),
        ),
      );
      setStatus("ready");
    } catch (error) {
      setStatus(
        error.status === 403 || error.status === 401 ? "forbidden" : "failed",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function showError(error) {
    await showAlert({
      title: translation("Common.error"),
      message: error.message,
      tone: "danger",
    });
  }

  async function switchPlan(org, planId) {
    const plan = data.plans.find((item) => item.id === Number(planId));
    if (!plan || plan.id === org.plan?.id) return;

    const own = org.id === data.adminOrgId;
    const confirmed = await confirm({
      title: translation("Admin.organizations.confirmTitle"),
      message: translation(
        own
          ? "Admin.organizations.confirmOwn"
          : "Admin.organizations.confirmMessage",
        { org: org.name, plan: plan.name },
      ),
      confirmText: translation("Admin.organizations.confirm"),
      cancelText: translation("Admin.cancel"),
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await changeOrganizationPlan(org.id, plan.id);
      if (own) announceAdminPlanChanged();
      await load();
    } catch (error) {
      await showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(plan) {
    const draft = drafts[plan.id];
    const confirmed = await confirm({
      title: translation("Admin.plans.confirmTitle", { plan: plan.name }),
      message: translation("Admin.plans.confirmMessage", {
        count: plan.orgCount,
      }),
      confirmText: translation("Admin.plans.save"),
      cancelText: translation("Admin.cancel"),
    });
    if (!confirmed) return;

    const limits = {};
    for (const name of LIMIT_ORDER) {
      limits[name] = draft[name] === "" ? null : Number(draft[name]);
    }

    setBusy(true);
    try {
      await updatePlanLimits(plan.id, {
        limits,
        durationDays:
          draft.durationDays === "" ? null : Number(draft.durationDays),
      });
      await load();
    } catch (error) {
      await showError(error);
    } finally {
      setBusy(false);
    }
  }

  function setDraft(planId, name, value) {
    setDrafts((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], [name]: value.replace(/[^\d]/g, "") },
    }));
  }

  if (status === "loading") {
    return <div className={styles.page}>{translation("Admin.loading")}</div>;
  }

  if (status === "forbidden") {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{translation("Admin.title")}</h1>
        <p className={styles.pageDescription}>
          {translation("Admin.forbidden")}
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className={styles.page}>
        <p className={styles.pageDescription}>{translation("Admin.failed")}</p>
        <button type="button" className={styles.button} onClick={load}>
          {translation("Admin.retry")}
        </button>
      </div>
    );
  }

  const ownOrg = data.organizations.find((org) => org.id === data.adminOrgId);

  return (
    <div className={styles.page}>

      {/* Experimentar a app como outro plano, na própria organização. */}
      {ownOrg ? (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>{translation("Admin.try.title")}</h2>
            <p>{translation("Admin.try.description", { org: ownOrg.name })}</p>
          </div>

          <label className={styles.tryRow}>
            <span>{translation("Admin.try.label")}</span>
            <select
              className={styles.select}
              value={ownOrg.plan?.id ?? ""}
              disabled={busy}
              onChange={(e) => switchPlan(ownOrg, e.target.value)}
            >
              {data.plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>{translation("Admin.organizations.title")}</h2>
          <p>{translation("Admin.organizations.description")}</p>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{translation("Admin.organizations.name")}</th>
                <th>{translation("Admin.organizations.plan")}</th>
                <th>{translation("Admin.organizations.demo")}</th>
                {USAGE_COLUMNS.map(([usage]) => (
                  <th key={usage}>{translation(`Admin.limits.${usage}`)}</th>
                ))}
                <th>{translation("Admin.organizations.sendsToday")}</th>
              </tr>
            </thead>
            <tbody>
              {data.organizations.map((org) => (
                <tr key={org.id}>
                  <td>
                    <strong>{org.name}</strong>
                    <span className={styles.muted}>#{org.id}</span>
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={org.plan?.id ?? ""}
                      disabled={busy}
                      aria-label={translation("Admin.organizations.planFor", {
                        org: org.name,
                      })}
                      onChange={(e) => switchPlan(org, e.target.value)}
                    >
                      {!org.plan && <option value="">—</option>}
                      {data.plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {org.expiresAt ? (
                      org.expired ? (
                        <span className={styles.danger}>
                          {translation("Admin.organizations.ended")}
                        </span>
                      ) : (
                        translation("Admin.organizations.daysLeft", {
                          days: org.daysLeft,
                        })
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  {USAGE_COLUMNS.map(([usage, limit]) => (
                    <td key={usage}>
                      <UsageCounter
                        used={org.usage[usage]}
                        limit={org.limits?.[limit]}
                      />
                      {org.limits?.[limit] == null ? org.usage[usage] : null}
                    </td>
                  ))}
                  <td className={styles.sends}>
                    {["whatsapp", "teams"].map((channel) => (
                      <span key={channel}>
                        {channel === "whatsapp" ? "WhatsApp" : "Teams"}{" "}
                        <UsageCounter
                          used={org.usage.dailySends[channel]}
                          limit={org.limits?.dailyMessagesPerChannel}
                        />
                        {org.limits?.dailyMessagesPerChannel == null
                          ? org.usage.dailySends[channel]
                          : null}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>{translation("Admin.plans.title")}</h2>
          <p>{translation("Admin.plans.description")}</p>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{translation("Admin.plans.limit")}</th>
                {data.plans.map((plan) => (
                  <th key={plan.id}>
                    {plan.name}
                    <span className={styles.muted}>
                      {translation("Admin.plans.orgCount", {
                        count: plan.orgCount,
                      })}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {["durationDays", ...LIMIT_ORDER].map((name) => (
                <tr key={name}>
                  <th scope="row">{translation(`Admin.limits.${name}`)}</th>
                  {data.plans.map((plan) => (
                    <td key={plan.id}>
                      <input
                        className={styles.input}
                        inputMode="numeric"
                        value={drafts[plan.id]?.[name] ?? ""}
                        placeholder={translation("Admin.plans.unlimited")}
                        aria-label={`${plan.name}: ${translation(`Admin.limits.${name}`)}`}
                        onChange={(e) =>
                          setDraft(plan.id, name, e.target.value)
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td />
                {data.plans.map((plan) => (
                  <td key={plan.id}>
                    <button
                      type="button"
                      className={styles.button}
                      disabled={busy}
                      onClick={() => savePlan(plan)}
                    >
                      {translation("Admin.plans.save")}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>{translation("Admin.plans.hint")}</p>
      </section>
    </div>
  );
}
