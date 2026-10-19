"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Hash,
  Mail,
  Phone,
  Search,
  Smartphone,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import styles from "../scheduled.module.css";
import {
  getRecipientKey,
  getRecipientKind,
  mapRecipientsToEntries,
} from "../helpers/recipient.helpers";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getEntrySearchText(entry) {
  return [
    entry?.name,
    entry?.email,
    entry?.secondary,
    entry?.key,
    entry?.recipient,
    entry?.payloadRecipient?.phoneNumber,
    entry?.payloadRecipient?.whatsappBsuid,
    entry?.payloadRecipient?.birdContactId,
    entry?.payloadRecipient?.userId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getInitials(value) {
  const text = String(value || "").trim();
  if (!text) return "?";

  const parts = text.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const second = parts.length > 1 ? parts[1]?.[0] : "";

  return `${first}${second}`.toUpperCase();
}

function getEntryKind(entry, channel) {
  return entry?.kind || getRecipientKind(entry?.payloadRecipient, channel);
}

function getKindLabel(kind) {
  if (kind === "phone") return "Phone";
  if (kind === "bsuid") return "BSUID fallback";
  if (kind === "bird") return "Bird fallback";
  if (kind === "teams") return "Teams";

  return "Recipient";
}

function KindIcon({ kind }) {
  if (kind === "phone") return <Phone aria-hidden />;
  if (kind === "bsuid") return <Smartphone aria-hidden />;
  if (kind === "bird") return <Hash aria-hidden />;
  if (kind === "teams") return <Mail aria-hidden />;

  return <Users aria-hidden />;
}

function RecipientCard({
  entry,
  channel,
  selected,
  actionLabel,
  actionIcon,
  onAction,
}) {
  const kind = getEntryKind(entry, channel);
  const name = entry?.name || entry?.key || "Unknown recipient";
  const secondary = entry?.secondary || "-";
  const initials = entry?.initials || getInitials(name);

  return (
    <div
      className={`${styles.pickerRecipientCard} ${
        selected ? styles.pickerRecipientSelected : ""
      } ${entry?.unresolved ? styles.pickerRecipientWarning : ""}`}
    >
      <div className={styles.pickerRecipientAvatar}>{initials}</div>

      <div className={styles.pickerRecipientBody}>
        <div className={styles.pickerRecipientTopLine}>
          <strong>{name}</strong>

          {selected ? (
            <span className={styles.pickerSelectedTick}>
              <Check aria-hidden />
            </span>
          ) : null}
        </div>

        <span className={styles.pickerRecipientSecondary}>{secondary}</span>

        <div className={styles.pickerRecipientBadges}>
          <span
            className={`${styles.pickerKindBadge} ${
              kind === "phone"
                ? styles.pickerKindPhone
                : kind === "bsuid" || kind === "bird"
                  ? styles.pickerKindFallback
                  : ""
            }`}
          >
            <KindIcon kind={kind} />
            {getKindLabel(kind)}
          </span>

          {entry?.unresolved ? (
            <span className={styles.pickerUnresolvedBadge}>
              No app user match
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className={`${styles.pickerRecipientAction} ${
          selected ? styles.pickerRecipientRemove : styles.pickerRecipientAdd
        }`}
        onClick={onAction}
      >
        {actionIcon}
        <span>{actionLabel}</span>
      </button>
    </div>
  );
}

export default function RecipientPicker({
  translation,
  isOpen,
  onClose,
  initialRecipients = [],
  recipientCandidates = [],
  usersLoading,
  channel = "whatsapp",
  onApply,
}) {
  const [query, setQuery] = useState("");
  const [draftKeys, setDraftKeys] = useState([]);

  const safeCandidates = useMemo(
    () => safeArray(recipientCandidates),
    [recipientCandidates],
  );

  const candidateEntries = useMemo(() => {
    return safeCandidates
      .map((candidate) => {
        const key =
          candidate.key ||
          getRecipientKey(candidate.payloadRecipient, channel) ||
          getRecipientKey(candidate.recipient, channel);

        if (!key) return null;

        return {
          ...candidate,
          key,
        };
      })
      .filter(Boolean);
  }, [safeCandidates, channel]);

  const initialEntries = useMemo(() => {
    return mapRecipientsToEntries(
      safeArray(initialRecipients),
      candidateEntries,
      channel,
      { unknownLabel: translation("EditModal.unknownRecipient") },
    );
  }, [initialRecipients, candidateEntries, channel, translation]);

  const entriesByKey = useMemo(() => {
    const map = new Map();

    for (const entry of candidateEntries) {
      if (entry.key) map.set(entry.key, entry);
    }

    for (const entry of initialEntries) {
      if (entry.key && !map.has(entry.key)) {
        map.set(entry.key, entry);
      }
    }

    return map;
  }, [candidateEntries, initialEntries]);

  useEffect(() => {
    if (!isOpen) return;

    setQuery("");
    setDraftKeys([...new Set(initialEntries.map((entry) => entry.key))]);
  }, [isOpen, initialEntries]);

  const selectedEntries = useMemo(() => {
    return draftKeys.map((key) => entriesByKey.get(key)).filter(Boolean);
  }, [draftKeys, entriesByKey]);

  const availableEntries = useMemo(() => {
    const selected = new Set(draftKeys);

    return candidateEntries.filter((entry) => !selected.has(entry.key));
  }, [candidateEntries, draftKeys]);

  const filteredSelectedEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return selectedEntries;

    return selectedEntries.filter((entry) =>
      getEntrySearchText(entry).includes(q),
    );
  }, [selectedEntries, query]);

  const filteredAvailableEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableEntries;

    return availableEntries.filter((entry) =>
      getEntrySearchText(entry).includes(q),
    );
  }, [availableEntries, query]);

  function toggleDraftKey(key) {
    if (!key) return;

    setDraftKeys((prev) =>
      prev.includes(key)
        ? prev.filter((value) => value !== key)
        : [...prev, key],
    );
  }

  function handleApply() {
    const nextRecipients = draftKeys
      .map((key) => entriesByKey.get(key)?.payloadRecipient)
      .filter(Boolean);

    onApply(nextRecipients);
  }

  if (!isOpen) return null;

  return (
    <div className={styles.pickerOverlay} onMouseDown={onClose}>
      <div
        className={styles.pickerModal}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.pickerHeader}>
          <div>
            <h2>{translation("RecipientPicker.title")}</h2>
            <p>
              Phone numbers are preferred for WhatsApp. BSUID/Bird IDs are only
              fallback recipients.
            </p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            <X aria-hidden />
          </button>
        </div>

        <div className={styles.pickerToolbarNice}>
          <div className={styles.pickerSearchBox}>
            <Search aria-hidden />

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translation("RecipientPicker.searchPlaceholder")}
            />
          </div>

          <div className={styles.pickerSelectedSummary}>
            <strong>{draftKeys.length}</strong>
            <span>{translation("RecipientPicker.countSelected")}</span>
          </div>
        </div>

        <div className={styles.pickerColumnsNice}>
          <section className={styles.pickerColumnNice}>
            <div className={styles.pickerColumnHeaderNice}>
              <div>
                <h3>{translation("RecipientPicker.selected")}</h3>
                <span>{filteredSelectedEntries.length} shown</span>
              </div>
            </div>

            <div className={styles.pickerListNice}>
              {filteredSelectedEntries.length ? (
                filteredSelectedEntries.map((entry) => (
                  <RecipientCard
                    key={`selected-${entry.key}`}
                    entry={entry}
                    channel={channel}
                    selected
                    actionLabel={translation("RecipientPicker.remove")}
                    actionIcon={<UserMinus aria-hidden />}
                    onAction={() => toggleDraftKey(entry.key)}
                  />
                ))
              ) : (
                <div className={styles.pickerEmptyState}>
                  <Users aria-hidden />
                  <p>{translation("RecipientPicker.noRecipient")}</p>
                </div>
              )}
            </div>
          </section>

          <section className={styles.pickerColumnNice}>
            <div className={styles.pickerColumnHeaderNice}>
              <div>
                <h3>{translation("RecipientPicker.available")}</h3>
                <span>{filteredAvailableEntries.length} shown</span>
              </div>
            </div>

            <div className={styles.pickerListNice}>
              {usersLoading ? (
                <div className={styles.pickerEmptyState}>
                  <Users aria-hidden />
                  <p>{translation("RecipientPicker.loading")}</p>
                </div>
              ) : filteredAvailableEntries.length ? (
                filteredAvailableEntries.map((entry) => (
                  <RecipientCard
                    key={`available-${entry.key}`}
                    entry={entry}
                    channel={channel}
                    actionLabel={translation("RecipientPicker.add")}
                    actionIcon={<UserPlus aria-hidden />}
                    onAction={() => toggleDraftKey(entry.key)}
                  />
                ))
              ) : (
                <div className={styles.pickerEmptyState}>
                  <Users aria-hidden />
                  <p>{translation("RecipientPicker.emptyRecipient")}</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className={styles.pickerFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            {translation("RecipientPicker.cancel")}
          </button>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleApply}
          >
            {translation("RecipientPicker.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
