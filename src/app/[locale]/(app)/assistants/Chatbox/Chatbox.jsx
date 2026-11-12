// /app/assistants/Chatbox/Chatbox.jsx
"use client";
import { useState } from "react";
import styles from "./chatbox.module.css";
import ui from "../assistants.module.css";
import { useTranslations } from "next-intl";
import { useAlert } from "@/app/components/Alert/AlertProvider";

export default function ChatSandbox({ assistant }) {
  const translation = useTranslations();
  const showAlert = useAlert();
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const trimmedInput = input.trim();

  /* Mensagens de exemplo do chat vazio: um clique envia logo. */
  const examples = [
    translation("Chatbox.example1"),
    translation("Chatbox.example2"),
    translation("Chatbox.example3"),
  ];

  function handleSend(e) {
    e.preventDefault();
    sendMessage(trimmedInput);
  }

  async function sendMessage(text) {
    if (!text || isSending) return;

    if (!assistant?.id) {
      await showAlert({
        title: translation("Chatbox.alerts.missingAssistant.title"),
        message: translation("Chatbox.alerts.missingAssistant.message"),
        tone: "warning",
      });

      return;
    }

    // if (!assistant?.open_ai_id) {
    //   await showAlert({
    //     title: translation("Chatbox.alerts.missingOpenAiId.title"),
    //     message: translation("Chatbox.alerts.missingOpenAiId.message"),
    //     tone: "warning",
    //   });

    //   return;
    // }

    const newUserMsg = { role: "user", content: text };

    setMessages((prev) => [newUserMsg, ...prev]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch(`/api/assistants/${assistant.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessages((prev) => [
          {
            role: "system",
            content: translation("Chatbox.alerts.apiError.message"),
          },
          ...prev,
        ]);

        return;
      }

      if (!data.reply) {
        setMessages((prev) => [
          {
            role: "system",
            content: translation("Chatbox.errorReply"),
          },
          ...prev,
        ]);

        await showAlert({
          title: translation("Chatbox.alerts.emptyReply.title"),
          message: translation("Chatbox.alerts.emptyReply.message"),
          tone: "warning",
        });

        return;
      }

      setMessages((prev) => [
        { role: "assistant", content: data.reply },
        ...prev,
      ]);

      setConversationId(data.conversationId);
    } catch (err) {
      console.warn("[Chatbox] send message error:", err);

      setMessages((prev) => [
        { role: "system", content: translation("Chatbox.errorApi") },
        ...prev,
      ]);

      await showAlert({
        title: translation("Chatbox.alerts.networkError.title"),
        message: translation("Chatbox.alerts.networkError.message"),
        tone: "danger",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.headline}>{translation("Chatbox.try")}</h2>
      {assistant?.name && (
        <p className={styles.talkingTo}>
          {translation("Chatbox.talkingTo", { name: assistant.name })}
        </p>
      )}

      <div className={styles.viewport}>
        {!messages.length && !isSending && (
          <div className={styles.emptyState}>
            <p>{translation("Chatbox.empty")}</p>
            <p className={styles.examplesLabel}>
              {translation("Chatbox.examplesLabel")}
            </p>
            <div className={styles.examples}>
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  className={styles.example}
                  onClick={() => sendMessage(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {isSending && <div className={styles.assistant}>...</div>}
        {messages.map((m, i) => (
          <div key={i} className={styles[m.role]}>
            {m.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className={styles.form}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={translation("Chatbox.placeholder")}
        />
        {/* 👇 same pill style as "Criar e Associar" */}
        <button
          type="submit"
          className={`${ui.ctaPrimary} ${styles.sendBtn}`}
          disabled={isSending || !input.trim()}
        >
          {translation("Chatbox.send")}
        </button>
      </form>
    </div>
  );
}
