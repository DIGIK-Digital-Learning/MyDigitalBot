// app/[locale]/(app)/users/ViewUserModal.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./users.module.css";
import {
  Pencil,
  X,
  RefreshCcw,
  Check,
  CheckCheck,
  CircleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";

function initial(name = "") {
  return (name.trim()[0] || "?").toUpperCase();
}

function formatPhoneDisplay(user) {
  const code = user.phoneCountryCode || user.phone_country_code || "";
  const nat = user.phoneNational || user.phone_national || "";
  if (code || nat) return `${code} ${nat}`.trim();
  return user.phone || user.phone_national || "—";
}

export default function ViewUserModal({
  open,
  onClose,
  user,
  orgId,
  onEdit,
  assistantsById,
}) {
  const translation = useTranslations("ViewUserModal");
  const [render, setRender] = useState(open);

  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState("");

  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");

  const threadsReqId = useRef(0);
  const messagesReqId = useRef(0);

  useEffect(() => {
    if (open) setRender(true);
  }, [open]);

  useEffect(() => {
    if (!render) return;

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [render, onClose]);

  useEffect(() => {
    if (open) return;

    threadsReqId.current++;
    messagesReqId.current++;

    setThreads([]);
    setSelectedThreadId(null);
    setMessages([]);
    setThreadsError("");
    setMessagesError("");
  }, [open]);

  useEffect(() => {
    if (!open || !user?.id) return;

    setThreads([]);
    setSelectedThreadId(null);
    setMessages([]);
    setThreadsError("");
    setMessagesError("");

    loadThreads(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  async function loadThreads(userId) {
    const reqId = ++threadsReqId.current;

    try {
      setThreadsLoading(true);
      setThreadsError("");

      const res = await fetch(`/api/threads?userId=${userId}`);
      if (!res.ok) throw new Error(await safeText(res));

      const data = await res.json();
      const list = Array.isArray(data?.threads) ? data.threads : [];

      const normalized = list.map((t) => ({
        id: t.id,
        conversationId: t.openai_conversation_id || null,
        legacyThreadId: t.ai_thread_id || null,
        assistantId: t.assistant_id ?? null,
        channel: t.channel ?? null,
        createdAt: t.created_at ?? null,
      }));

      if (reqId !== threadsReqId.current) return;

      setThreads(normalized);
      setSelectedThreadId(normalized.length ? normalized[0].id : null);
    } catch (err) {
      if (reqId !== threadsReqId.current) return;
      setThreadsError(err?.message || translation("threadsFailed"));
    } finally {
      if (reqId === threadsReqId.current) setThreadsLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !selectedThreadId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedThreadId]);

  async function loadMessages(threadId) {
    const reqId = ++messagesReqId.current;

    try {
      setMessagesLoading(true);
      setMessagesError("");

      const res = await fetch(`/api/threads/${threadId}/messages`);

      if (!res.ok) {
        throw new Error(await safeText(res));
      }

      const data = await res.json();

      const arr = Array.isArray(data?.messages)
        ? data.messages
        : Array.isArray(data)
          ? data
          : [];

      const normalized = arr.map((m) => ({
        id: m.id,

        role: m.role || "assistant",

        createdAt: m.created_at ?? m.createdAt ?? null,

        text: extractText(m),

        channel: m.channel ?? null,

        messageId: m.message_id ?? m.messageId ?? null,

        deliveryStatus: m.delivery_status ?? m.deliveryStatus ?? null,

        deliveredAt: m.delivered_at ?? m.deliveredAt ?? null,

        readAt: m.read_at ?? m.readAt ?? null,

        failedAt: m.failed_at ?? m.failedAt ?? null,
      }));

      if (reqId !== messagesReqId.current) {
        return;
      }

      setMessages(normalized);
    } catch (err) {
      if (reqId !== messagesReqId.current) {
        return;
      }

      setMessagesError(err?.message || translation("messagesFailed"));

      setMessages([]);
    } finally {
      if (reqId === messagesReqId.current) {
        setMessagesLoading(false);
      }
    }
  }

  const getAssistantName = (id) =>
    (id == null ? null : assistantsById?.get(String(id))?.name) || "_";

  const stateClass = open ? styles.open : styles.closing;

  if (!render || !user) return null;

  return (
    <div
      className={`${styles.modalOverlay} ${stateClass}`}
      role="dialog"
      aria-modal="true"
      onAnimationEnd={(e) => {
        if (!open && e.target === e.currentTarget) setRender(false);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        key={user?.id ?? "none"}
        className={`${styles.modalContent} ${styles.modalContentWide} ${stateClass}`}
      >
        <div className={styles.viewHead}>
          <div className={styles.viewHeadLeft}>
            <div className={styles.avatarLg}>{initial(user.name || "")}</div>

            <div className={styles.viewTitleBlock}>
              <div className={styles.viewTitle}>{user.name || "—"}</div>

              <div className={styles.viewSubtitle}>
                {user.email || "—"} &middot; {formatPhoneDisplay(user)}
              </div>

              {!!(user.tags && user.tags.length) && (
                <div className={styles.viewTagsRow}>
                  {user.tags.map((t) => (
                    <span key={t} className={styles.chip}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.viewHeadRight}>
            {!!onEdit && (
              <button
                className={styles.iconBtn}
                title={translation("edit")}
                onClick={onEdit}
              >
                <Pencil size={18} />
              </button>
            )}

            <button className={styles.iconBtn} title={translation("close")} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles.viewLayout}>
          <section className={styles.panelWide}>
            <div className={styles.threadsLayout}>
              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  Threads
                  <button
                    className={styles.iconBtn}
                    style={{ marginLeft: "auto" }}
                    title={translation("reload")}
                    onClick={() => loadThreads(user.id)}
                    disabled={threadsLoading}
                  >
                    <RefreshCcw size={16} />
                  </button>
                </div>

                <div className={`${styles.panelBody} ${styles.threadList}`}>
                  {threadsLoading && (
                    <div className={styles.emptyNote}>{translation("loading")}</div>
                  )}

                  {!threadsLoading && threadsError && (
                    <div className={styles.errorNote}>{threadsError}</div>
                  )}

                  {!threadsLoading && !threadsError && !threads.length && (
                    <div className={styles.emptyNote}>
                      {translation("noThreads")}
                    </div>
                  )}

                  {!threadsLoading &&
                    !threadsError &&
                    threads.map((t) => {
                      const active = selectedThreadId === t.id;

                      return (
                        <button
                          key={t.id}
                          className={`${styles.threadItem} ${
                            active ? styles.threadItemActive : ""
                          }`}
                          onClick={() => setSelectedThreadId(t.id)}
                          title={
                            t.conversationId ||
                            t.legacyThreadId ||
                            `DB Thread ${t.id}`
                          }
                        >
                          <div className={styles.threadTitleRow}>
                            <span className={styles.threadTitle}>
                              {getAssistantName(t.assistantId)}
                            </span>

                            {/* Canal da conversa (#167). */}
                            {t.channel ? (
                              <span className={styles.threadChannel}>
                                {t.channel === "whatsapp" ? "WhatsApp" : "Teams"}
                              </span>
                            ) : null}
                          </div>

                          <div className={styles.threadMeta}>
                            {formatWhen(t.createdAt)}
                          </div>

                          <div className={styles.threadIdMono}>
                            {shortId(
                              t.conversationId ||
                                t.legacyThreadId ||
                                `#${t.id}`,
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHead}>{translation("messages")}</div>

                <div className={`${styles.panelBody} ${styles.messagesPane}`}>
                  {messagesLoading && (
                    <div className={styles.emptyNote}>{translation("loading")}</div>
                  )}

                  {!messagesLoading && messagesError && (
                    <div className={styles.errorNote}>{messagesError}</div>
                  )}

                  {!messagesLoading && !messagesError && !messages.length && (
                    <div className={styles.emptyNote}>{translation("noMessages")}</div>
                  )}

                  {!messagesLoading && !messagesError && !!messages.length && (
                    <div className={styles.messagesScroll}>
                      {messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          translation={translation}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function extractText(m) {
  if (m?.content) return String(m.content);
  if (typeof m?.text === "string") return m.text;

  if (typeof m?.content === "string") return m.content;

  if (Array.isArray(m?.content)) {
    const firstText =
      m.content.find((c) => typeof c === "string") ||
      m.content.find((c) => c?.type === "text" && (c.text?.value || c.text));

    if (typeof firstText === "string") return firstText;
    if (firstText?.text?.value) return firstText.text.value;
    if (firstText?.text) return firstText.text;
  }

  return "";
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "Erro";
  }
}

function shortId(id) {
  if (!id) return "";

  const s = String(id);

  if (s.length <= 14) return s;

  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function formatWhen(iso) {
  if (!iso) return "—";

  try {
    const d = new Date(iso);

    if (Number.isNaN(d.getTime())) return iso;

    return d.toLocaleString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getDisplayRole(role, translation) {
  if (["assistant", "system", "user"].includes(role)) {
    return translation(`roles.${role}`);
  }
  return role || "";
}

function isOutgoingMessage(message) {
  return message?.role === "assistant" || message?.role === "system";
}

function getReceiptState(message) {
  if (!message) return null;

  if (message.channel !== "whatsapp") {
    return null;
  }

  if (!isOutgoingMessage(message)) {
    return null;
  }

  const status = String(message.deliveryStatus || "").toLowerCase();

  if (
    message.failedAt ||
    status === "failed" ||
    status === "delivery_failed" ||
    status === "sending_failed"
  ) {
    return "failed";
  }

  if (message.readAt || status === "read") {
    return "read";
  }

  if (message.deliveredAt || status === "delivered") {
    return "delivered";
  }

  if (
    status === "accepted" ||
    status === "sent" ||
    status === "processing" ||
    status === "sending" ||
    status === "pending"
  ) {
    return "sent";
  }

  if (message.messageId) {
    return "sent";
  }

  return null;
}

function getReceiptTitle(state, translation) {
  if (state === "read") return translation("read");
  if (state === "delivered") return translation("delivered");
  if (state === "sent") return translation("sent");
  if (state === "failed") return translation("failed");
  return "";
}

function MessageReceipt({ message, translation }) {
  const state = getReceiptState(message);

  if (!state) return null;

  const title = getReceiptTitle(state, translation);

  if (state === "failed") {
    return (
      <span
        className={styles.msgReceiptFailed}
        title={title}
        aria-label={title}
      >
        <CircleAlert size={14} strokeWidth={2.4} />
      </span>
    );
  }

  if (state === "read") {
    return (
      <span className={styles.msgReceiptRead} title={title} aria-label={title}>
        <CheckCheck size={16} strokeWidth={2.4} />
      </span>
    );
  }

  if (state === "delivered") {
    return (
      <span
        className={styles.msgReceiptDelivered}
        title={title}
        aria-label={title}
      >
        <CheckCheck size={16} strokeWidth={2.4} />
      </span>
    );
  }

  if (state === "sent") {
    return (
      <span className={styles.msgReceiptSent} title={title} aria-label={title}>
        <Check size={16} strokeWidth={2.4} />
      </span>
    );
  }

  return null;
}

function MessageBubble({ message, translation }) {
  const outgoing = isOutgoingMessage(message);

  return (
    <div
      className={`${styles.msgRow} ${
        outgoing ? styles.msgMine : styles.msgTheirs
      }`}
    >
      <div className={styles.msgBubble}>
        <div className={styles.msgText}>
          {message?.text || translation("noText")}
        </div>

        <div className={styles.msgMeta}>
          <span className={styles.msgRole}>
            {getDisplayRole(message?.role, translation)}
          </span>
          <span>·</span>
          <span className={styles.msgWhen}>
            {formatWhen(message?.createdAt)}
          </span>
          <MessageReceipt message={message} translation={translation} />
        </div>
      </div>
    </div>
  );
}
