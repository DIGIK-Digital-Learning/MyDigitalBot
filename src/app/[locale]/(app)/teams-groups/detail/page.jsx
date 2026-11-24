"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useAuth } from "@/app/AuthContext";
import { SkeletonDetail } from "@/app/components/Skeleton/Skeleton";
import useOrganization from "@/app/hooks/useOrganization";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";

import { formatDateTime, groupTypeKey } from "../groups.helpers";
import styles from "../teams-groups.module.css";
import usePermissions from "@/app/PermissionsContext";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Um grupo do Teams (#165): nome e assistente que responde, membros lidos no
 * Teams e as últimas mensagens trocadas com o bot.
 */
export default function TeamsGroupDetailPage() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId") || "";

  const { user } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const { stopLoading } = useGlobalLoader();
  const translation = useTranslations();
  const { can, lock } = usePermissions();
  const showAlert = useAlert();

  /* Refs para os efeitos de carregamento não dependerem destas funções. */
  const showAlertRef = useRef(showAlert);
  const translationRef = useRef(translation);

  useEffect(() => {
    showAlertRef.current = showAlert;
    translationRef.current = translation;
  }, [showAlert, translation]);

  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [members, setMembers] = useState([]);
  const [membersState, setMembersState] = useState("loading");

  const [nameDraft, setNameDraft] = useState("");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (orgLoading || !org?.id) return;

    if (!groupId) {
      setLoading(false);
      setError(translationRef.current("TeamsGroups.alerts.loadFailed.message"));
      stopLoading();
      return;
    }

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const [groupRes, assistantsRes] = await Promise.all([
          fetch(`/api/teams-groups/${encodeURIComponent(groupId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/assistants?orgId=${org.id}`, { cache: "no-store" }),
        ]);

        const data = await groupRes.json().catch(() => ({}));
        const assistantsData = await assistantsRes.json().catch(() => ({}));

        if (!groupRes.ok) {
          throw new Error(data?.error || "Failed to load Teams group.");
        }

        if (!alive) return;

        setGroup(data.group);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setNameDraft(data.group?.name || "");
        setAssistantDraft(String(data.group?.assistantId ?? ""));
        /* A rota de assistentes devolve a lista diretamente. */
        setAssistants(
          Array.isArray(assistantsData)
            ? assistantsData
            : Array.isArray(assistantsData?.items)
              ? assistantsData.items
              : [],
        );
      } catch {
        if (!alive) return;

        const t = translationRef.current;
        setError(t("TeamsGroups.alerts.loadFailed.message"));
      } finally {
        if (!alive) return;

        setLoading(false);
        stopLoading();
      }
    })();

    return () => {
      alive = false;
    };
  }, [org?.id, orgLoading, groupId, stopLoading]);

  /* Membros só depois de saber se o bot ainda está no grupo. */
  useEffect(() => {
    if (!group) return;

    if (!group.isActive) {
      setMembersState("removed");
      return;
    }

    let alive = true;

    (async () => {
      try {
        setMembersState("loading");

        const res = await fetch(
          `/api/teams-groups/${encodeURIComponent(group.id)}/members`,
          { cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data?.error || "Failed to load members.");
        if (!alive) return;

        setMembers(Array.isArray(data?.items) ? data.items : []);
        setMembersState("ready");
      } catch {
        if (alive) setMembersState("failed");
      }
    })();

    return () => {
      alive = false;
    };
  }, [group]);

  const nameChanged = nameDraft.trim() !== (group?.name || "");
  const assistantChanged = assistantDraft !== String(group?.assistantId ?? "");

  async function handleSave(event) {
    event.preventDefault();
    if (!group || (!nameChanged && !assistantChanged)) return;

    setSaving(true);

    try {
      const res = await fetch(
        `/api/teams-groups/${encodeURIComponent(group.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(nameChanged ? { name: nameDraft.trim() } : {}),
            ...(assistantChanged
              ? { assistantId: Number(assistantDraft) }
              : {}),
          }),
        },
      );

      if (!res.ok) throw new Error("Failed to save Teams group.");

      const assistant = assistants.find((a) => String(a.id) === assistantDraft);

      setGroup((prev) => ({
        ...prev,
        name: nameDraft.trim() || null,
        assistantId: Number(assistantDraft),
        assistantName: assistant?.name ?? prev.assistantName,
      }));

      await showAlert({
        title: translation("TeamsGroups.detail.settings"),
        message: translation("TeamsGroups.detail.saved"),
        tone: "success",
      });
    } catch {
      await showAlert({
        title: translation("TeamsGroups.alerts.saveFailed.title"),
        message: translation("TeamsGroups.alerts.saveFailed.message"),
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  function authorLabel(message) {
    if (message.author?.kind === "platform") {
      return translation("TeamsGroups.detail.platform");
    }

    if (message.author?.kind === "user") {
      return (
        message.author.name || translation("TeamsGroups.detail.unknownUser")
      );
    }

    return message.author?.name || "MyDigitalBot";
  }

  return (
    <div className={styles.screen}>
      <Link href="/teams-groups" className={styles.backLink}>
        <ArrowLeft size={16} aria-hidden />
        {translation("TeamsGroups.detail.back")}
      </Link>

      {loading && (
        <SkeletonDetail stats={0} label={translation("TeamsGroups.loading")} />
      )}

      {!loading && error && <div className={styles.errorBox}>{error}</div>}

      {!loading && !error && group && (
        <>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>
              {group.name || translation("TeamsGroups.unnamed")}
            </h1>
            <p className={styles.subtitle}>
              {translation(
                `TeamsGroups.type.${groupTypeKey(group.conversationType)}`,
              )}
              {" · "}
              {group.isActive
                ? translation("TeamsGroups.status.active")
                : translation("TeamsGroups.status.removed")}
            </p>
          </div>

          {!group.isActive && (
            <div className={styles.noticeBox}>
              {translation("TeamsGroups.detail.removedNotice")}
            </div>
          )}

          <form className={styles.card} onSubmit={handleSave}>
            <h2 className={styles.cardTitle}>
              {translation("TeamsGroups.detail.settings")}
            </h2>

            <div className={styles.settingsGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {translation("TeamsGroups.detail.name")}
                </span>
                <input
                  className={styles.input}
                  value={nameDraft}
                  maxLength={120}
                  placeholder={translation(
                    "TeamsGroups.detail.namePlaceholder",
                  )}
                  onChange={(e) => setNameDraft(e.target.value)}
                  disabled={!can(PERMISSIONS.TEAMS_GROUPS_EDIT)}
                  {...lock(PERMISSIONS.TEAMS_GROUPS_EDIT)}
                />
                <span className={styles.fieldHint}>
                  {translation("TeamsGroups.detail.nameHint")}
                </span>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {translation("TeamsGroups.detail.assistant")}
                </span>
                <select
                  className={styles.input}
                  value={assistantDraft}
                  onChange={(e) => setAssistantDraft(e.target.value)}
                  disabled={!can(PERMISSIONS.TEAMS_GROUPS_EDIT)}
                  {...lock(PERMISSIONS.TEAMS_GROUPS_EDIT)}
                >
                  {assistants.map((assistant) => (
                    <option key={assistant.id} value={String(assistant.id)}>
                      {assistant.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.cardActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={
                  saving ||
                  (!nameChanged && !assistantChanged) ||
                  !can(PERMISSIONS.TEAMS_GROUPS_EDIT)
                }
                {...lock(PERMISSIONS.TEAMS_GROUPS_EDIT)}
              >
                {translation("TeamsGroups.detail.save")}
              </button>
            </div>
          </form>

          <div className={styles.detailGrid}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>
                {translation("TeamsGroups.detail.members")}
                {membersState === "ready" ? (
                  <span className={styles.count}>{members.length}</span>
                ) : null}
              </h2>

              {membersState === "loading" && (
                <p className={styles.muted}>
                  {translation("TeamsGroups.detail.membersLoading")}
                </p>
              )}

              {membersState === "failed" && (
                <p className={styles.muted}>
                  {translation("TeamsGroups.detail.membersFailed")}
                </p>
              )}

              {membersState === "removed" && (
                <p className={styles.muted}>
                  {translation("TeamsGroups.detail.membersRemoved")}
                </p>
              )}

              {membersState === "ready" && members.length === 0 && (
                <p className={styles.muted}>
                  {translation("TeamsGroups.detail.noMembers")}
                </p>
              )}

              {membersState === "ready" && members.length > 0 && (
                <ul className={styles.memberList}>
                  {members.map((member) => (
                    <li key={member.id} className={styles.memberRow}>
                      <div className={styles.memberText}>
                        <span className={styles.memberName}>
                          {member.name || member.email || "-"}
                        </span>
                        {member.email ? (
                          <span className={styles.meta}>{member.email}</span>
                        ) : null}
                      </div>
                      {member.userId ? (
                        <span className={styles.tag}>
                          {translation("TeamsGroups.detail.colleague")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>
                {translation("TeamsGroups.detail.conversation")}
              </h2>
              <p className={styles.cardHint}>
                {translation("TeamsGroups.detail.conversationHint")}
              </p>

              {messages.length === 0 ? (
                <p className={styles.muted}>
                  {translation("TeamsGroups.detail.noMessages")}
                </p>
              ) : (
                <ol className={styles.messageList}>
                  {messages.map((message) => (
                    <li
                      key={message.id}
                      className={`${styles.message} ${
                        message.role === "user" ? "" : styles.messageBot
                      }`}
                    >
                      <div className={styles.messageHead}>
                        <span className={styles.messageAuthor}>
                          {authorLabel(message)}
                        </span>
                        <span className={styles.meta}>
                          {formatDateTime(message.createdAt)}
                        </span>
                      </div>
                      <div className={styles.messageBody}>
                        {message.content}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
