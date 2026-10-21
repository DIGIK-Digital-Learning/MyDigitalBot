"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import styles from "./scheduled.module.css";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import { parseQuestionOptions } from "@/lib/services/broadcast/questionOptions";

import { normalizeUser, uniqueRecipients } from "./helpers/recipient.helpers";
import {
  STATUS_OPTIONS,
  CHANNEL_OPTIONS,
  buildScheduledIso,
  normalizeBroadcast,
  canEditItem,
  canDeleteItem,
  getScheduledGroups,
  toDateInputValue,
} from "./helpers/scheduled.helpers";

import ScheduledHeader from "./components/ScheduledHeader";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import ScheduledStats from "./components/ScheduledStats";
import ScheduledFilters from "./components/ScheduledFilters";
import ScheduledTable from "./components/ScheduledTable";
import ScheduledViewModal from "./components/ScheduledViewModal";
import ScheduledEditModal from "./components/ScheduledEditModal";

import { useAlert } from "@/app/components/Alert/AlertProvider";

const MODAL_CLOSE_MS = 280;

/* O servidor limita cada página de utilizadores a este número. */
const USERS_PAGE_SIZE = 200;

export default function ScheduledPage() {
  const t = useTranslations("BroadcastScheduled");
  const usageTranslation = useTranslations("Plans.usage");
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);

  /* Limite de agendadas do plano (#186): contador "2 / 100" no cabeçalho. */
  const {
    limits: planLimits,
    usage: planUsage,
    reload: reloadPlanUsage,
  } = usePlanLimits(org?.id);
  const confirm = useConfirm();
  const showAlert = useAlert();

  const showAlertRef = useRef(showAlert);

  useEffect(() => {
    showAlertRef.current = showAlert;
  }, [showAlert]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [orgUsers, setOrgUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("scheduled");
  const [channelFilter, setChannelFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const closeTimersRef = useRef({ view: null, edit: null });

  const loadItems = useCallback(
    async (showSuccessAlert = false) => {
      /* O contador do limite acompanha a lista (cancelar, apagar, editar). */
      reloadPlanUsage();

      if (!org?.id) {
        if (showSuccessAlert) {
          await showAlertRef.current({
            title: t("Alerts.noOrg.title"),
            message: t("Alerts.noOrg.message"),
            tone: "warning",
          });
        }

        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/scheduled-broadcasts?orgId=${org.id}&source=manual`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error || "Failed to load scheduled broadcasts.",
          );
        }

        const normalizedItems = (result.items ?? []).map(normalizeBroadcast);
        setItems(normalizedItems);
      } catch (err) {
        console.warn("[Scheduled] load items error:", err);

        setError(t("Errors.load"));

        await showAlertRef.current({
          title: t("Alerts.loadError.title"),
          message: t("Alerts.loadError.message"),
          tone: "danger",
        });
      } finally {
        setLoading(false);
      }
    },
    [org?.id, t, reloadPlanUsage],
  );

  useEffect(() => {
    if (orgLoading) return;
    if (!org?.id) {
      setLoading(false);
      return;
    }

    loadItems();
  }, [org?.id, orgLoading, loadItems]);

  useEffect(() => {
    if (!org?.id) return;

    let cancelled = false;

    async function loadUsers() {
      setUsersLoading(true);

      try {
        /* A API devolve no máximo 200 por página: lê-se até ao fim. */
        const all = [];
        let page = 1;
        let total = Infinity;

        while (all.length < total) {
          const response = await fetch(
            `/api/users?orgId=${org.id}&page=${page}&pageSize=${USERS_PAGE_SIZE}`,
            { cache: "no-store" },
          );

          if (!response.ok) throw new Error("Failed to load users");

          const result = await response.json();

          if (cancelled) return;

          const list = Array.isArray(result?.items)
            ? result.items
            : Array.isArray(result)
              ? result
              : [];

          all.push(...list);

          total = Number.isFinite(Number(result?.total))
            ? Number(result.total)
            : all.length;

          if (list.length < USERS_PAGE_SIZE) break;

          page += 1;
        }

        setOrgUsers(all.map(normalizeUser));
      } catch (err) {
        console.warn("[Scheduled] load users error:", err);

        if (!cancelled) {
          setOrgUsers([]);

          await showAlertRef.current({
            title: t("Alerts.usersLoadError.title"),
            message: t("Alerts.usersLoadError.message"),
            tone: "danger",
          });
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [org?.id, t]);

  useEffect(() => {
    const timers = closeTimersRef.current;
    return () => {
      if (timers.view) clearTimeout(timers.view);
      if (timers.edit) clearTimeout(timers.edit);
    };
  }, []);

  /*
   * ?view=<id> abre logo essa mensagem (vem da página de multimédia). Espera
   * que ela apareça na lista, porque a organização e a lista chegam depois do
   * primeiro render. O parâmetro sai do URL para não reabrir ao atualizar.
   */
  const viewParam = searchParams.get("view");
  const viewHandledRef = useRef(false);

  useEffect(() => {
    if (!viewParam || viewHandledRef.current) return;

    const item = items.find((x) => String(x.id) === viewParam);
    if (!item) return;

    viewHandledRef.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    openViewModal(item);
  }, [viewParam, items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !query ||
        item.message.toLowerCase().includes(query) ||
        item.channel.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query) ||
        String(item.createdBy ?? "")
          .toLowerCase()
          .includes(query);

      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;
      const matchesChannel =
        channelFilter === "all" || item.channel === channelFilter;
      const matchesDate =
        !dateFilter || toDateInputValue(item.scheduledFor) === dateFilter;

      return matchesSearch && matchesStatus && matchesChannel && matchesDate;
    });
  }, [items, search, statusFilter, channelFilter, dateFilter]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      scheduled: items.filter((item) => item.status === "scheduled").length,
      sending: items.filter((item) => item.status === "sending").length,
      failed: items.filter((item) => item.status === "failed").length,
    };
  }, [items]);

  const channelOptions = useMemo(
    () =>
      CHANNEL_OPTIONS.map((option) => ({
        value: option,
        label: t(`Channels.${option}`),
      })),
    [t],
  );

  const statusOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((option) => ({
        value: option,
        label: t(`Statuses.${option}`),
      })),
    [t],
  );

  function openViewModal(item) {
    if (closeTimersRef.current.view) {
      clearTimeout(closeTimersRef.current.view);
    }

    setSelectedItem(item);
    setIsViewModalOpen(true);
  }

  function closeViewModal() {
    setIsViewModalOpen(false);

    if (closeTimersRef.current.view) {
      clearTimeout(closeTimersRef.current.view);
    }

    closeTimersRef.current.view = setTimeout(() => {
      setSelectedItem(null);
    }, MODAL_CLOSE_MS);
  }

  function openEditModal(item) {
    if (closeTimersRef.current.edit) {
      clearTimeout(closeTimersRef.current.edit);
    }

    setEditingItem(item);
    setIsEditModalOpen(true);
  }

  function closeEditModal() {
    setIsEditModalOpen(false);

    if (closeTimersRef.current.edit) {
      clearTimeout(closeTimersRef.current.edit);
    }

    closeTimersRef.current.edit = setTimeout(() => {
      setEditingItem(null);
    }, MODAL_CLOSE_MS);
  }

  async function handleSaveEdit(formData) {
    if (!editingItem) return;

    const scheduledIso = buildScheduledIso(
      formData.date,
      formData.hour,
      formData.minute,
    );

    const recipients = uniqueRecipients(formData.recipients, formData.channel);

    /*
     * Nas perguntas valida-se a pergunta (as mesmas regras do envio) e a
     * mensagem fica vazia; nas outras mensagens, o texto é obrigatório.
     */
    const questionResult = formData.question
      ? parseQuestionOptions({ question: formData.question })
      : null;

    if (questionResult?.error) {
      setError(t("Errors.invalidForm"));

      await showAlert({
        title: t("Alerts.invalidForm.title"),
        message: questionResult.error,
        tone: "warning",
      });

      return;
    }

    if (
      (!questionResult && !formData.message.trim()) ||
      !scheduledIso
    ) {
      setError(t("Errors.invalidForm"));

      await showAlert({
        title: t("Alerts.invalidForm.title"),
        message: t("Alerts.invalidForm.message"),
        tone: "warning",
      });

      return;
    }

    /* Nas mensagens para grupos do Teams (#166) não há colaboradores. */
    const groupItems = getScheduledGroups(editingItem);

    if (!groupItems && !recipients.length) {
      setError(t("Errors.invalidForm"));

      await showAlert({
        title: t("Alerts.invalidForm.title"),
        message: "Choose at least one recipient.",
        tone: "warning",
      });

      return;
    }

    setSaving(true);
    setError("");

    try {
      const previousPayload = editingItem.payload || {};
      const nextFiles = Array.isArray(formData.files) ? formData.files : [];

      const nextPayload = {
        ...previousPayload,
        message: questionResult ? "" : formData.message.trim(),
        ...(questionResult ? { question: questionResult.question } : {}),
        files: nextFiles,
        imageUrls: nextFiles
          .filter((file) => file?.contentType?.startsWith("image/"))
          .map((file) => file.url),
      };

      if (formData.channel === "whatsapp") {
        nextPayload.recipients = recipients;
        delete nextPayload.userIds;
      } else if (!groupItems) {
        const userIds = recipients
          .map((recipient) => recipient.userId)
          .filter(Boolean);

        nextPayload.userIds = userIds;

        // Keeping this is useful for the view modal, but the Teams sender should
        // still use userIds.
        nextPayload.recipients = recipients;
      }

      const response = await fetch(
        `/api/scheduled-broadcasts/${editingItem.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          /* O servidor valida o payload e recalcula o número de destinatários. */
          body: JSON.stringify({
            scheduled_for: scheduledIso,
            timezone: formData.timezone.trim() || "Europe/Lisbon",
            status:
              formData.status === "scheduled" ? "queued" : formData.status,
            payload: nextPayload,
          }),
        },
      );

      const result = await response.json();

      /* Entretanto a mensagem foi enviada (ou está a ser): já não se edita. */
      if (response.status === 409) {
        closeEditModal();
        loadItems();

        await showAlert({
          title: t("Alerts.saveConflict.title"),
          message: t("Alerts.saveConflict.message"),
          tone: "warning",
        });

        return;
      }

      if (!response.ok) {
        throw new Error(
          result?.error || "Failed to update scheduled broadcast.",
        );
      }

      const normalized = normalizeBroadcast(result.item);

      setItems((prev) =>
        prev.map((item) => (item.id === normalized.id ? normalized : item)),
      );

      closeEditModal();

      await showAlert({
        title: t("Alerts.saveSuccess.title"),
        message: t("Alerts.saveSuccess.message"),
        tone: "success",
      });
    } catch (err) {
      console.warn("[Scheduled] save edit error:", err);

      setError(t("Errors.save"));

      await showAlert({
        title: t("Alerts.saveError.title"),
        message: t("Alerts.saveError.message"),
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!canDeleteItem(item)) return;

    const confirmed = await confirm({
      title: t("Delete.title"),
      message: t("Delete.deleteMessage"),
      confirmText: t("Delete.delete"),
      cancelText: t("Delete.cancel"),
      tone: "danger",
    });

    if (!confirmed) return;

    setDeletingId(item.id);
    setError("");

    try {
      const response = await fetch(`/api/scheduled-broadcasts/${item.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error || "Failed to delete scheduled broadcast",
        );
      }

      setItems((prev) => prev.filter((row) => row.id !== item.id));

      if (selectedItem?.id === item.id) {
        setIsViewModalOpen(false);
        setSelectedItem(null);
      }

      if (editingItem?.id === item.id) {
        setIsEditModalOpen(false);
        setEditingItem(null);
      }

      await showAlert({
        title: t("Alerts.deleteSuccess.title"),
        message: t("Alerts.deleteSuccess.message"),
        tone: "success",
      });
    } catch (err) {
      console.warn("[Scheduled] delete error:", err);

      setError(t("Errors.delete"));

      await showAlert({
        title: t("Alerts.deleteError.title"),
        message: t("Alerts.deleteError.message"),
        tone: "danger",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={styles.scheduledScreen}>
      <ScheduledHeader translation={t} organizationName={org?.name} />

      <ScheduledStats translation={t} stats={stats} />

      <ScheduledFilters
        translation={t}
        search={search}
        onSearchChange={setSearch}
        channelFilter={channelFilter}
        channelOptions={channelOptions}
        onChannelChange={setChannelFilter}
        statusFilter={statusFilter}
        statusOptions={statusOptions}
        onStatusChange={setStatusFilter}
        dateFilter={dateFilter}
        onDateChange={setDateFilter}
        onClearDate={() => setDateFilter("")}
        onRefresh={() => loadItems(true)}
        usage={
          <UsageCounter
            used={planUsage?.scheduledMessages}
            limit={planLimits?.scheduledMessages}
            label={usageTranslation("scheduledLabel")}
            hint={usageTranslation("scheduledHint")}
          />
        }
      />

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <ScheduledTable
        loading={loading}
        translation={t}
        filteredItems={filteredItems}
        openViewModal={openViewModal}
        openEditModal={openEditModal}
        canEditItem={canEditItem}
        handleDelete={handleDelete}
        canDeleteItem={canDeleteItem}
        deletingId={deletingId}
      />

      {selectedItem ? (
        <ScheduledViewModal
          selectedItem={selectedItem}
          orgUsers={orgUsers}
          translation={t}
          isViewModalOpen={isViewModalOpen}
          closeViewModal={closeViewModal}
          canEditItem={canEditItem}
          openEditModal={openEditModal}
          canDeleteItem={canDeleteItem}
          handleDelete={handleDelete}
        />
      ) : null}

      {editingItem ? (
        <ScheduledEditModal
          item={editingItem}
          orgUsers={orgUsers}
          usersLoading={usersLoading}
          translation={t}
          isEditModalOpen={isEditModalOpen}
          closeEditModal={closeEditModal}
          onSave={handleSaveEdit}
          saving={saving}
        />
      ) : null}
    </div>
  );
}
