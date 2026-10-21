"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CalendarClock,
  ChevronDown,
  Clock3,
  Eye,
  MessageSquare,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserPlus,
} from "lucide-react";
import styles from "./automations.module.css";
import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import { useAlert } from "@/app/components/Alert/AlertProvider";
import { RuleModal } from "./RuleModal/RuleModal";
import { useTranslations } from "next-intl";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";

const TRIGGER_OPTIONS = [
  {
    value: "user.created",
    labelKey: "userCreated",
    descriptionKey: "triggerDescriptions.userCreated",
    icon: UserPlus,
  },
  {
    value: "user.inactive",
    labelKey: "userInactive",
    descriptionKey: "triggerDescriptions.userInactive",
    icon: Clock3,
  },
  {
    value: "message.read",
    labelKey: "messageRead",
    descriptionKey: "triggerDescriptions.messageRead",
    icon: Eye,
    disabled: true,
  },
  {
    value: "message.unread",
    labelKey: "messageUnread",
    descriptionKey: "triggerDescriptions.messageUnread",
    icon: MessageSquare,
  },
];

const STATUS_META = {
  queued: { label: "Queued", className: styles.chipDark },
  materialized: { label: "Materialized", className: styles.chip },
  processing: { label: "Processing", className: styles.chip },
  sent: { label: "Sent", className: styles.chipSuccess || styles.chip },
  partial: { label: "Partial", className: styles.chip },
  failed: { label: "Failed", className: styles.rowActBtnDanger },
  cancelled: { label: "Cancelled", className: styles.chipDark },
  skipped: { label: "Skipped", className: styles.chipDark },
};

const IN_FLIGHT_QUEUE_STATUSES = new Set([
  "queued",
  "materialized",
  "processing",
]);

function formatDateTime(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function safeJsonParse(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function summarizeMessage(payload) {
  const p = safeJsonParse(payload, {});
  return p.messageResolved || p.message || "-";
}

function summarizeMaterializedMessage(item) {
  const scheduledPayload = safeJsonParse(
    item?.scheduled_broadcast?.payload,
    {},
  );

  return (
    scheduledPayload.messageResolved ||
    scheduledPayload.message ||
    summarizeMessage(item?.payload)
  );
}

function summarizeError(value) {
  if (!value) return "-";

  if (typeof value !== "string") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return value;
}

function summarizeQueueDetails(run) {
  if (run?.last_error) return summarizeError(run.last_error);
  return summarizeMessage(run?.payload);
}

function RunStatusChip({ status }) {
  const meta = STATUS_META[status] || {
    label: status || "-",
    className: styles.chipDark,
  };

  return (
    <span className={`${styles.chip} ${meta.className || ""}`}>
      {meta.label}
    </span>
  );
}

export default function AutomationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const { startLoading, stopLoading } = useGlobalLoader();
  const confirm = useConfirm();
  const showAlert = useAlert();

  const showAlertRef = useRef(showAlert);

  useEffect(() => {
    showAlertRef.current = showAlert;
  }, [showAlert]);

  const translation = useTranslations("Automations");
  const planTranslation = useTranslations("Plans.limits");
  const usageTranslation = useTranslations("Plans.usage");

  const translatedTriggerOptions = useMemo(
    () =>
      TRIGGER_OPTIONS.map((option) => ({
        ...option,
        label: translation(option.labelKey),
        description: translation(option.descriptionKey),
      })),
    [translation],
  );

  const [rules, setRules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [materialized, setMaterialized] = useState([]);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("rules");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef(null);

  const [readChainsEnabled, setReadChainsEnabled] = useState(false);
  const [readChainsSaving, setReadChainsSaving] = useState(false);

  const orgId = org?.id;

  const assistantsById = useMemo(() => {
    const map = new Map();

    assistants.forEach((a) => map.set(Number(a.id), a));

    return map;
  }, [assistants]);

  const ruleMap = useMemo(() => {
    const map = new Map();

    rules.forEach((r) => map.set(r.id, r));

    return map;
  }, [rules]);

  /*
   * Limite de automações do plano (#186): contador "6 / 20" ao lado do botão
   * de criar, que fica desativado quando a conta está cheia.
   */
  const { limits: planLimits, usage: planUsage, reload: reloadPlanUsage } =
    usePlanLimits(orgId);
  const automationsFull =
    planLimits?.automations != null &&
    planUsage?.automations != null &&
    planUsage.automations >= planLimits.automations;

  const refreshAll = useCallback(
    async (showSuccessAlert = false) => {
      /* O contador acompanha cada criação, alteração e remoção. */
      reloadPlanUsage();

      if (!orgId) {
        if (showSuccessAlert && typeof showAlertRef.current === "function") {
          await showAlertRef.current({
            title: translation("alerts.noOrg.title"),
            message: translation("alerts.noOrg.message"),
            tone: "warning",
          });
        }

        return;
      }

      startLoading();

      try {
        const responses = await Promise.all([
          fetch(`/api/automations/rules?orgId=${orgId}`),
          fetch(`/api/automations/runs?orgId=${orgId}&limit=100`),
          fetch(`/api/automations/materialized?orgId=${orgId}&limit=100`),
          fetch(`/api/assistants?orgId=${orgId}`),
          fetch(
            `/api/organizations/messaging-feature?orgId=${orgId}&channel=whatsapp`,
          ),
        ]);

        const [
          rulesRes,
          runsRes,
          materializedRes,
          assistantsRes,
          featureRes,
        ] = responses;

        const [
          rulesData,
          runsData,
          materializedData,
          assistantsData,
          featureData,
        ] = await Promise.all(
          responses.map((res) => res.json().catch(() => ({}))),
        );

        if (!rulesRes.ok) {
          throw new Error(
            rulesData?.error || "Failed to load automation rules.",
          );
        }

        if (!runsRes.ok) {
          throw new Error(
            runsData?.error || "Failed to load automation queue.",
          );
        }

        if (!materializedRes.ok) {
          throw new Error(
            materializedData?.error || "Failed to load automation deliveries.",
          );
        }

        if (!assistantsRes.ok) {
          throw new Error(
            assistantsData?.error || "Failed to load assistants.",
          );
        }

        if (!featureRes.ok) {
          throw new Error(
            featureData?.error || "Failed to load messaging feature settings.",
          );
        }

        setRules(Array.isArray(rulesData?.items) ? rulesData.items : []);
        setRuns(Array.isArray(runsData?.items) ? runsData.items : []);
        setMaterialized(
          Array.isArray(materializedData?.items) ? materializedData.items : [],
        );
        setAssistants(Array.isArray(assistantsData) ? assistantsData : []);
        setReadChainsEnabled(Boolean(featureData?.item?.read_chains_enabled));

        if (showSuccessAlert && typeof showAlertRef.current === "function") {
          await showAlertRef.current({
            title: translation("alerts.refreshSuccess.title"),
            message: translation("alerts.refreshSuccess.message"),
            tone: "success",
          });
        }
      } catch (err) {
        console.warn("[Automations] refresh error:", err);

        if (typeof showAlertRef.current === "function") {
          await showAlertRef.current({
            title: translation("alerts.loadFailed.title"),
            message: translation("alerts.loadFailed.message"),
            tone: "danger",
          });
        }
      } finally {
        stopLoading();
      }
    },
    [orgId, startLoading, stopLoading, translation, reloadPlanUsage],
  );

  useEffect(() => {
    if (authLoading || orgLoading || !orgId) return;
    refreshAll();
  }, [authLoading, orgLoading, orgId, refreshAll]);

  useEffect(() => {
    if (!createMenuOpen) return;

    function handleClickOutside(e) {
      if (!createMenuRef.current?.contains(e.target)) {
        setCreateMenuOpen(false);
      }
    }

    function handleEsc(e) {
      if (e.key === "Escape") setCreateMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [createMenuOpen]);

  const queueRuns = useMemo(() => {
    return runs.filter(
      (run) =>
        !run.scheduled_broadcast_id || IN_FLIGHT_QUEUE_STATUSES.has(run.status),
    );
  }, [runs]);

  const filteredRules = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rules;

    return rules.filter((rule) => {
      const payload = safeJsonParse(rule.payload, {});
      const haystack = [
        rule.name,
        rule.channel,
        rule.trigger_type,
        payload.message || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [q, rules]);

  const filteredQueueRuns = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return queueRuns;

    return queueRuns.filter((run) => {
      const relatedRule = ruleMap.get(run.rule_id);
      const haystack = [
        relatedRule?.name || "",
        run.user_row?.name || "",
        run.channel,
        run.trigger_type,
        run.status,
        summarizeQueueDetails(run),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [q, queueRuns, ruleMap]);

  const filteredDeliveries = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return materialized;

    return materialized.filter((item) => {
      const relatedRule = ruleMap.get(item.rule_id);
      const haystack = [
        relatedRule?.name || "",
        item.channel,
        item.trigger_type,
        item.status,
        item.user_row?.name || "",
        item.scheduled_broadcast?.status || "",
        summarizeMaterializedMessage(item),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [q, materialized, ruleMap]);

  function triggerLabel(value) {
    switch (value) {
      case "user.created":
        return translation("userCreated");
      case "user.inactive":
        return translation("userInactive");
      case "message.read":
        return translation("messageRead");
      case "message.unread":
        return translation("messageUnread");
      default:
        return translation("unknown");
    }
  }

  async function handleSaveRule(ruleInput) {
    if (!orgId) {
      await showAlert({
        title: translation("alerts.noOrg.title"),
        message: translation("alerts.noOrg.message"),
        tone: "warning",
      });

      return;
    }

    const isEdit = Boolean(ruleInput.id);

    setSaving(true);

    try {
      const endpoint = isEdit
        ? `/api/automations/rules/${ruleInput.id}`
        : "/api/automations/rules";

      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: orgId,
          ...ruleInput,
        }),
      });

      const data = await res.json().catch(() => ({}));

      /*
       * Limite de automações do plano (#186): aviso simples, só com OK. O
       * formulário fica aberto, com os dados, para apagar outra automação
       * e voltar a tentar.
       */
      if (data?.code === "AUTOMATION_LIMIT_REACHED") {
        await showAlert({
          title: planTranslation("automationsTitle"),
          message: planTranslation("automations", { limit: data.limit }),
          tone: "warning",
        });
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save automation rule");
      }

      setModalOpen(false);
      setEditingRule(null);

      await refreshAll();

      await showAlert({
        title: isEdit
          ? translation("alerts.ruleUpdated.title")
          : translation("alerts.ruleCreated.title"),
        message: isEdit
          ? translation("alerts.ruleUpdated.message")
          : translation("alerts.ruleCreated.message"),
        tone: "success",
      });
    } catch (err) {
      console.warn("[Automations] save rule error:", err);

      await showAlert({
        title: translation("alerts.saveRuleError.title"),
        message: translation("alerts.saveRuleError.message"),
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRule(rule) {
    const ok = await confirm({
      title: translation("confirmDelete.title", { name: rule.name }),
      message: translation("confirmDelete.message"),
      confirmText: translation("confirmDelete.confirm"),
      cancelText: translation("confirmDelete.cancel"),
      tone: "danger",
    });

    if (!ok) return;

    try {
      const res = await fetch(`/api/automations/rules/${rule.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete automation rule");
      }

      await refreshAll();

      await showAlert({
        title: translation("alerts.ruleDeleted.title"),
        message: translation("alerts.ruleDeleted.message"),
        tone: "success",
      });
    } catch (err) {
      console.warn("[Automations] delete rule error:", err);

      await showAlert({
        title: translation("alerts.deleteRuleError.title"),
        message: translation("alerts.deleteRuleError.message"),
        tone: "danger",
      });
    }
  }

  async function toggleRule(rule) {
    const nextActive = !rule.is_active;

    try {
      const res = await fetch(`/api/automations/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update automation rule");
      }

      await refreshAll();
    } catch (err) {
      console.warn("[Automations] toggle rule error:", err);

      await showAlert({
        title: translation("alerts.updateRuleError.title"),
        message: translation("alerts.updateRuleError.message"),
        tone: "danger",
      });
    }
  }

  async function toggleReadChainsFeature() {
    if (!orgId || readChainsSaving) return;

    const nextEnabled = !readChainsEnabled;

    setReadChainsSaving(true);

    try {
      const res = await fetch("/api/organizations/messaging-feature", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          channel: "whatsapp",
          readChainsEnabled: nextEnabled,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update read chain feature.");
      }

      setReadChainsEnabled(Boolean(data?.item?.read_chains_enabled));

      await showAlert({
        title: nextEnabled
          ? translation("readChains.enabledTitle")
          : translation("readChains.disabledTitle"),
        message: nextEnabled
          ? translation("readChains.enabledMessage")
          : translation("readChains.disabledMessage"),
        tone: "success",
      });
    } catch (err) {
      console.warn("[Automations] read chain feature toggle error:", err);

      await showAlert({
        title: translation("readChains.errorTitle"),
        message: err.message || translation("readChains.errorMessage"),
        tone: "danger",
      });
    } finally {
      setReadChainsSaving(false);
    }
  }

  async function runAutomation(path) {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId: orgId, limit: 100 }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Cron failed");
      }

      await refreshAll();
    } catch (err) {
      console.warn("[Automations] cron error:", err);
    }
  }

  return (
    <div className={styles.usersScreen}>
      <div className={styles.toolbarRow}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="11" cy="11" r="7" strokeWidth="2" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" />
            </svg>
          </span>
          <input
            className={styles.searchInputXL}
            placeholder={translation("searchAutomations")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={translation("searchAutomations")}
          />
        </div>

        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            onClick={() => refreshAll(true)}
          >
            <RefreshCw size={16} />
            <span>{translation("refresh")}</span>
          </button>

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            onClick={() => runAutomation("/api/automations/run/inactivity")}
          >
            <Clock3 size={16} />
            <span>{translation("runInactivity")}</span>
          </button>

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            onClick={() => runAutomation("/api/automations/run/materialize")}
          >
            <PlayCircle size={16} />
            <span>{translation("materialize")}</span>
          </button>

          <UsageCounter
            used={planUsage?.automations}
            limit={planLimits?.automations}
            label={usageTranslation("automationsLabel")}
            hint={usageTranslation("automationsHint")}
          />

          <div className={styles.createMenuWrap} ref={createMenuRef}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => setCreateMenuOpen((v) => !v)}
              disabled={automationsFull}
              title={
                automationsFull
                  ? planTranslation("automations", {
                      limit: planLimits.automations,
                    })
                  : undefined
              }
            >
              <Plus size={16} />
              <span>{translation("newAutomation")}</span>
              <ChevronDown size={16} />
            </button>

            {createMenuOpen && (
              <div
                className={`${styles.createMenu} animateDropdownFadeDown`}
                role="menu"
              >
                <button
                  type="button"
                  className={styles.createMenuItem}
                  onClick={() => {
                    setCreateMenuOpen(false);
                    setEditingRule(null);
                    setModalOpen(true);
                  }}
                >
                  <Plus size={16} />
                  <span>{translation("createAutomation")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.activeFilters}>
        <button
          className={`${styles.filterChip} ${
            tab === "rules" ? styles.filterChipActive : ""
          }`}
          onClick={() => setTab("rules")}
        >
          {translation("rules")} ({rules.length})
        </button>

        <button
          className={`${styles.filterChip} ${
            tab === "queue" ? styles.filterChipActive : ""
          }`}
          onClick={() => setTab("queue")}
        >
          {translation("queue")} ({queueRuns.length})
        </button>

        <button
          className={`${styles.filterChip} ${
            tab === "deliveries" ? styles.filterChipActive : ""
          }`}
          onClick={() => setTab("deliveries")}
        >
          {translation("deliveries")} ({materialized.length})
        </button>
      </div>

      {tab === "rules" ? (
        <div className={styles.tableCard}>
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.header}`}>
              <div className={styles.cellHead}>
                {translation("rulesTable.name")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.trigger")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.channel")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.delay")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.assistant")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.message")}
              </div>
              <div className={styles.cellHeadRight} />
            </div>

            {filteredRules.map((rule, i) => {
              const assistant = rule.assistant_id
                ? assistantsById.get(Number(rule.assistant_id))
                : null;
              const payload = safeJsonParse(rule.payload, {});
              const TriggerIcon =
                translatedTriggerOptions.find(
                  (t) => t.value === rule.trigger_type,
                )?.icon || Bot;

              return (
                <div
                  key={rule.id}
                  className={`${styles.row} ${i % 2 ? styles.rowAlt : ""}`}
                >
                  <div className={styles.cellName}>
                    <div className={styles.avatar}>
                      <TriggerIcon size={16} />
                    </div>
                    <div className={styles.nameBlock}>
                      <div className={styles.name}>{rule.name}</div>
                      <div className={styles.subline}>
                        {rule.is_active
                          ? translation("rulesTable.active")
                          : translation("rulesTable.paused")}
                      </div>
                    </div>
                  </div>

                  <div className={styles.cellPhone}>
                    {triggerLabel(rule.trigger_type)}
                  </div>

                  <div className={styles.cellPhone}>{rule.channel}</div>

                  <div className={styles.cellPhone}>
                    {rule.delay_minutes} min
                  </div>

                  <div className={styles.cellPhone}>
                    {assistant?.name || translation("rulesTable.any")}
                  </div>

                  <div className={styles.cellTags}>
                    <div
                      className={styles.messagePreview}
                      title={payload.message || "-"}
                    >
                      {payload.message || "-"}
                    </div>
                  </div>

                  <div className={styles.cellKebab}>
                    <button
                      className={styles.rowActBtn}
                      onClick={() => toggleRule(rule)}
                      title={
                        rule.is_active
                          ? translation("rulesTable.pause")
                          : translation("rulesTable.activate")
                      }
                    >
                      {rule.is_active ? (
                        <ToggleRight size={16} />
                      ) : (
                        <ToggleLeft size={16} />
                      )}
                    </button>

                    <button
                      className={styles.rowActBtn}
                      onClick={() => {
                        setEditingRule(rule);
                        setModalOpen(true);
                      }}
                      title={translation("rulesTable.edit")}
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      className={`${styles.rowActBtn} ${styles.rowActBtnDanger}`}
                      onClick={() => handleDeleteRule(rule)}
                      title={translation("rulesTable.delete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === "queue" ? (
        <div className={styles.tableCard}>
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.header}`}>
              <div className={styles.cellHead}>
                {translation("rulesTable.rule")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.trigger")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.channel")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.dueAt")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.runStatus")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.queueDetails")}
              </div>
            </div>

            {filteredQueueRuns.map((run, i) => {
              const rule = ruleMap.get(run.rule_id);

              return (
                <div
                  key={run.id}
                  className={`${styles.row} ${i % 2 ? styles.rowAlt : ""}`}
                >
                  <div className={styles.cellName}>
                    <div className={styles.avatar}>
                      <CalendarClock size={16} />
                    </div>
                    <div className={styles.nameBlock}>
                      <div className={styles.name}>
                        {rule?.name || "Deleted rule"}
                      </div>
                      <div className={styles.subline}>
                        {run.user_row?.name || `User #${run.user_id}`}
                      </div>
                    </div>
                  </div>

                  <div className={styles.cellPhone}>
                    {triggerLabel(run.trigger_type)}
                  </div>

                  <div className={styles.cellPhone}>{run.channel}</div>

                  <div className={styles.cellPhone}>
                    {formatDateTime(run.scheduled_for)}
                  </div>

                  <div className={styles.cellPhone}>
                    <RunStatusChip status={run.status} />
                  </div>

                  <div className={styles.cellTags}>
                    <div
                      className={styles.messagePreview}
                      title={summarizeQueueDetails(run)}
                    >
                      {summarizeQueueDetails(run)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.header}`}>
              <div className={styles.cellHead}>
                {translation("rulesTable.rule")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.user")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.channel")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.scheduledFor")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.broadcastStatus")}
              </div>
              <div className={styles.cellHead}>
                {translation("rulesTable.message")}
              </div>
            </div>

            {filteredDeliveries.map((item, i) => {
              const rule = ruleMap.get(item.rule_id);
              const broadcastStatus =
                item.scheduled_broadcast?.status || item.status;

              return (
                <div
                  key={item.id}
                  className={`${styles.row} ${i % 2 ? styles.rowAlt : ""}`}
                >
                  <div className={styles.cellName}>
                    <div className={styles.avatar}>
                      <CalendarClock size={16} />
                    </div>
                    <div className={styles.nameBlock}>
                      <div className={styles.name}>
                        {rule?.name || "Deleted rule"}
                      </div>
                      <div className={styles.subline}>
                        {triggerLabel(item.trigger_type)}
                      </div>
                    </div>
                  </div>

                  <div className={styles.cellPhone}>
                    {item.user_row?.name || `User #${item.user_id}`}
                  </div>

                  <div className={styles.cellPhone}>
                    {item.scheduled_broadcast?.channel || item.channel}
                  </div>

                  <div className={styles.cellPhone}>
                    {formatDateTime(
                      item.scheduled_broadcast?.scheduled_for ||
                        item.scheduled_for,
                    )}
                  </div>

                  <div className={styles.cellPhone}>
                    <RunStatusChip status={broadcastStatus} />
                  </div>

                  <div className={styles.cellTags}>
                    <div
                      className={styles.messagePreview}
                      title={summarizeMaterializedMessage(item)}
                    >
                      {summarizeMaterializedMessage(item)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.readChainFloatingCard}>
        <div className={styles.readChainFloatingIcon}>
          <Eye size={18} />
        </div>

        <div className={styles.readChainFloatingMain}>
          <div className={styles.readChainFloatingTitle}>
            {translation("readChains.title")}
          </div>

          <div className={styles.readChainFloatingText}>
            {translation("readChains.text")}
          </div>

          <div className={styles.readChainFloatingMeta}>
            {readChainsEnabled
              ? translation("readChains.active")
              : translation("readChains.inactive")}
          </div>
        </div>

        <button
          type="button"
          className={`${styles.readChainFloatingToggle} ${
            readChainsEnabled ? styles.readChainFloatingToggleOn : ""
          }`}
          onClick={toggleReadChainsFeature}
          disabled={readChainsSaving}
          title={
            readChainsEnabled
              ? translation("readChains.disable")
              : translation("readChains.enable")
          }
        >
          {readChainsEnabled ? (
            <ToggleRight size={20} />
          ) : (
            <ToggleLeft size={20} />
          )}

          <span>
            {readChainsSaving
              ? translation("readChains.saving")
              : readChainsEnabled
                ? translation("readChains.on")
                : translation("readChains.off")}
          </span>
        </button>
      </div>

      <RuleModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRule(null);
        }}
        onSave={handleSaveRule}
        assistants={assistants}
        initialRule={editingRule}
        saving={saving}
        triggerOptions={translatedTriggerOptions}
        safeJsonParse={safeJsonParse}
      />
    </div>
  );
}
