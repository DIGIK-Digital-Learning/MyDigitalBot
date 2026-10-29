"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import {
  announceAdminPlanChanged,
  changeOrganizationPlan,
  extendOrganizationPlan,
  fetchAdminOverview,
  setOrganizationPlanEnd,
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

const INTERNAL_PLAN_NAME = "Interno";

/* O dia de uma data em Lisboa, no formato dos campos de data ("2026-11-04"). */
function lisbonDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/* Até onde se pode levar uma Demo de uma vez (o servidor valida o mesmo). */
const MAX_END_DAYS_AHEAD = 90;

/*
 * Ordem da lista: primeiro o que pede atenção (Demos terminadas, depois as que
 * acabam mais cedo, depois as que passaram algum limite) e o resto por nome.
 */
function attentionRank(org) {
  if (org.expired) return 0;
  if (org.expiresAt) return 1;
  if (org.overLimits?.length) return 2;
  return 3;
}

function compareOrganizations(a, b) {
  const rank = attentionRank(a) - attentionRank(b);
  if (rank) return rank;
  if (a.expiresAt && b.expiresAt) return (a.daysLeft ?? 0) - (b.daysLeft ?? 0);
  return String(a.name).localeCompare(String(b.name), "pt");
}

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
  const [query, setQuery] = useState("");
  /* A data escolhida no calendário de cada organização, ainda por aplicar. */
  const [endDrafts, setEndDrafts] = useState({});
  /*
   * Os prazos anteriores de cada organização, mudados nesta visita à página:
   * "Desfazer" volta ao último. Ao recarregar, a lista começa vazia.
   */
  const [endHistory, setEndHistory] = useState({});

  /* Pesquisa pelo nome ou pelo email do dono, com o que pede atenção no topo. */
  const organizations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.organizations || [])
      .filter(
        (org) =>
          !term ||
          String(org.name).toLowerCase().includes(term) ||
          String(org.ownerEmail || "")
            .toLowerCase()
            .includes(term),
      )
      .sort(compareOrganizations);
  }, [data, query]);

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

  /* Guarda o prazo atual antes de o mudar, para o "Desfazer". */
  function rememberEnd(org) {
    setEndHistory((prev) => ({
      ...prev,
      [org.id]: [...(prev[org.id] || []), lisbonDate(org.expiresAt)],
    }));
  }

  function clearEndDraft(orgId) {
    setEndDrafts((prev) => {
      const next = { ...prev };
      delete next[orgId];
      return next;
    });
  }

  /*
   * "Aplicar": a Demo passa a terminar no dia escolhido no calendário (até às
   * 23:59). Corrige um "+7 dias" a mais ou dá um prazo à medida.
   */
  async function applyPlanEnd(org) {
    const endsOn = endDrafts[org.id];
    if (!endsOn || endsOn === lisbonDate(org.expiresAt)) return;

    const [year, month, day] = endsOn.split("-");
    const confirmed = await confirm({
      title: translation("Admin.organizations.endTitle"),
      message: translation("Admin.organizations.endMessage", {
        org: org.name,
        plan: org.plan?.name ?? "",
        date: `${day}/${month}/${year}`,
      }),
      confirmText: translation("Admin.organizations.endConfirm"),
      cancelText: translation("Admin.cancel"),
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await setOrganizationPlanEnd(org.id, endsOn);
      rememberEnd(org);
      clearEndDraft(org.id);
      if (org.id === data.adminOrgId) announceAdminPlanChanged();
      await load();
    } catch (error) {
      await showError(error);
    } finally {
      setBusy(false);
    }
  }

  /*
   * "Desfazer": volta ao prazo de antes da última mudança feita nesta visita.
   * Um prazo que já tinha passado volta a hoje (o fim não pode ser no
   * passado). Fica no histórico do cliente, como as outras mudanças.
   */
  async function undoPlanEnd(org) {
    const history = endHistory[org.id] || [];
    const previous = history[history.length - 1];
    if (!previous) return;

    const today = lisbonDate(Date.now());
    const endsOn = previous < today ? today : previous;

    setBusy(true);
    try {
      await setOrganizationPlanEnd(org.id, endsOn);
      setEndHistory((prev) => ({ ...prev, [org.id]: history.slice(0, -1) }));
      clearEndDraft(org.id);
      if (org.id === data.adminOrgId) announceAdminPlanChanged();
      await load();
    } catch (error) {
      await showError(error);
    } finally {
      setBusy(false);
    }
  }

  /* Mais 7 dias de Demo, sem mudar de plano (#208). */
  async function extendPlan(org) {
    const confirmed = await confirm({
      title: translation("Admin.organizations.extendTitle"),
      message: translation("Admin.organizations.extendMessage", {
        org: org.name,
        plan: org.plan?.name ?? "",
      }),
      confirmText: translation("Admin.organizations.extend"),
      cancelText: translation("Admin.cancel"),
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await extendOrganizationPlan(org.id, 7);
      rememberEnd(org);
      clearEndDraft(org.id);
      if (org.id === data.adminOrgId) announceAdminPlanChanged();
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

        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={translation("Admin.organizations.search")}
          aria-label={translation("Admin.organizations.search")}
        />

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
              {organizations.map((org) => (
                <tr
                  key={org.id}
                  className={
                    org.expired || org.overLimits?.length
                      ? styles.rowAttention
                      : undefined
                  }
                >
                  <td>
                    <strong>{org.name}</strong>
                    <span className={styles.muted}>
                      #{org.id}
                      {org.ownerEmail ? ` · ${org.ownerEmail}` : ""}
                    </span>
                    {org.overLimits?.length ? (
                      <span className={styles.badge}>
                        {translation("Admin.organizations.overLimit", {
                          count: org.overLimits.length,
                        })}
                      </span>
                    ) : null}
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
                      {/* O Interno só aparece às organizações da DIGIK. */}
                      {data.plans
                        .filter(
                          (plan) =>
                            org.isPlatformOrg ||
                            plan.name !== INTERNAL_PLAN_NAME ||
                            plan.id === org.plan?.id,
                        )
                        .map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    {org.expiresAt ? (
                      <span className={styles.deadline}>
                        {org.expired ? (
                          <span className={styles.danger}>
                            {translation("Admin.organizations.ended")}
                          </span>
                        ) : (
                          translation("Admin.organizations.daysLeft", {
                            days: org.daysLeft,
                          })
                        )}
                        <input
                          type="date"
                          className={styles.dateInput}
                          value={endDrafts[org.id] ?? lisbonDate(org.expiresAt)}
                          min={lisbonDate(Date.now())}
                          max={lisbonDate(
                            Date.now() +
                              MAX_END_DAYS_AHEAD * 24 * 60 * 60 * 1000,
                          )}
                          disabled={busy}
                          aria-label={translation(
                            "Admin.organizations.endsOn",
                            {
                              org: org.name,
                            },
                          )}
                          title={translation("Admin.organizations.endsOn", {
                            org: org.name,
                          })}
                          onChange={(e) =>
                            setEndDrafts((prev) => ({
                              ...prev,
                              [org.id]: e.target.value,
                            }))
                          }
                        />
                        {/* Só com uma data nova escolhida. */}
                        {endDrafts[org.id] &&
                        endDrafts[org.id] !== lisbonDate(org.expiresAt) ? (
                          <button
                            type="button"
                            className={styles.applyButton}
                            disabled={busy}
                            onClick={() => applyPlanEnd(org)}
                          >
                            {translation("Admin.organizations.apply")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={styles.linkButton}
                          disabled={busy}
                          onClick={() => extendPlan(org)}
                        >
                          {translation("Admin.organizations.extendShort")}
                        </button>
                        {/* Depois de uma mudança nesta visita à página. */}
                        {endHistory[org.id]?.length ? (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={busy}
                            title={translation("Admin.organizations.undoHint", {
                              date: endHistory[org.id][
                                endHistory[org.id].length - 1
                              ]
                                .split("-")
                                .reverse()
                                .join("/"),
                            })}
                            onClick={() => undoPlanEnd(org)}
                          >
                            {translation("Admin.organizations.undo")}
                          </button>
                        ) : null}
                      </span>
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
                        /* O Interno (sem limites) não se edita. */
                        disabled={plan.name === INTERNAL_PLAN_NAME}
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
                    {plan.name === INTERNAL_PLAN_NAME ? (
                      <span className={styles.muted}>
                        {translation("Admin.plans.locked")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.button}
                        disabled={busy}
                        onClick={() => savePlan(plan)}
                      >
                        {translation("Admin.plans.save")}
                      </button>
                    )}
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
