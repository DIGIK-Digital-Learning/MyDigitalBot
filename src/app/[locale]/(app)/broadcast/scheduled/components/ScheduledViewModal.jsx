import { useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  Link2,
  Pencil,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";

import styles from "../scheduled.module.css";
import {
  formatDateTime,
  getScheduledGroups,
  getPayloadQuestion,
} from "../helpers/scheduled.helpers";
import {
  cleanText,
  looksLikeWhatsappBsuid,
  phonesMatch,
} from "../helpers/recipient.helpers";

function safeTranslate(translation, key, fallback) {
  try {
    if (typeof translation?.has === "function") {
      return translation.has(key) ? translation(key) : fallback;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function getItemPayload(item) {
  return item?.payload && typeof item.payload === "object" ? item.payload : {};
}

function getItemResult(item) {
  if (item?.result && typeof item.result === "object") return item.result;
  if (item?.raw?.result && typeof item.raw.result === "object") {
    return item.raw.result;
  }

  return {};
}

function getResultRows(item) {
  const result = getItemResult(item);

  if (Array.isArray(result.results)) return result.results;
  if (Array.isArray(result.items)) return result.items;
  if (Array.isArray(result.recipients)) return result.recipients;

  return [];
}

function normalizeUserForLookup(user = {}) {
  return {
    ...user,
    id: cleanText(user.id),
    name: cleanText(user.name),
    email: cleanText(user.email),
    phoneNumber:
      cleanText(user.phone_number) ||
      cleanText(user.phoneNumber) ||
      cleanText(user.phone),
    whatsappBsuid:
      cleanText(user.whatsapp_bsuid) ||
      cleanText(user.whatsappBsuid) ||
      cleanText(user.whatsappPsuid),
    whatsappUsername:
      cleanText(user.whatsapp_username) || cleanText(user.whatsappUsername),
    birdContactId:
      cleanText(user.bird_contact_id) || cleanText(user.birdContactId),
  };
}

function normalizeRecipient(raw, channel) {
  if (raw && typeof raw === "object") {
    const recipientValue = cleanText(raw.recipient);
    const toValue = cleanText(raw.to);

    const phoneNumber =
      cleanText(raw.phoneNumber) ||
      cleanText(raw.phone_number) ||
      cleanText(raw.phone) ||
      (!looksLikeWhatsappBsuid(toValue) ? toValue : "") ||
      (!looksLikeWhatsappBsuid(recipientValue) ? recipientValue : "");

    const whatsappBsuid =
      cleanText(raw.whatsappBsuid) ||
      cleanText(raw.whatsapp_bsuid) ||
      cleanText(raw.whatsappPsuid) ||
      (looksLikeWhatsappBsuid(recipientValue) ? recipientValue : "") ||
      (looksLikeWhatsappBsuid(toValue) ? toValue : "");

    return {
      raw,
      userId:
        cleanText(raw.userId) || cleanText(raw.user_id) || cleanText(raw.id),
      name: cleanText(raw.name),
      email: cleanText(raw.email),
      phoneNumber,
      whatsappBsuid: phoneNumber ? "" : whatsappBsuid,
      whatsappUsername: phoneNumber
        ? ""
        : cleanText(raw.whatsappUsername) || cleanText(raw.whatsapp_username),
      birdContactId:
        phoneNumber || whatsappBsuid
          ? ""
          : cleanText(raw.birdContactId) || cleanText(raw.bird_contact_id),
      value: "",
    };
  }

  const value = cleanText(raw);

  if (channel === "teams") {
    return {
      raw,
      userId: value,
      name: "",
      email: "",
      phoneNumber: "",
      whatsappBsuid: "",
      whatsappUsername: "",
      birdContactId: "",
      value,
    };
  }

  return {
    raw,
    userId: "",
    name: "",
    email: "",
    phoneNumber: looksLikeWhatsappBsuid(value) ? "" : value,
    whatsappBsuid: looksLikeWhatsappBsuid(value) ? value : "",
    whatsappUsername: "",
    birdContactId: "",
    value,
  };
}

function findMatchingUser(recipient, users) {
  return (
    users.find((u) => cleanText(u.id) === cleanText(recipient.userId)) ||
    users.find((u) => phonesMatch(u.phoneNumber, recipient.phoneNumber)) ||
    users.find(
      (u) =>
        recipient.whatsappBsuid &&
        cleanText(u.whatsappBsuid) === cleanText(recipient.whatsappBsuid),
    ) ||
    users.find(
      (u) =>
        recipient.birdContactId &&
        cleanText(u.birdContactId) === cleanText(recipient.birdContactId),
    ) ||
    null
  );
}

function findMatchingResult(recipient, index, resultRows) {
  return (
    resultRows.find(
      (r) => cleanText(r.userId) === cleanText(recipient.userId),
    ) ||
    resultRows.find((r) =>
      phonesMatch(r.to || r.recipient, recipient.phoneNumber),
    ) ||
    resultRows.find(
      (r) =>
        recipient.whatsappBsuid &&
        cleanText(r.whatsappBsuid) === cleanText(recipient.whatsappBsuid),
    ) ||
    resultRows.find(
      (r) =>
        recipient.birdContactId &&
        cleanText(r.birdContactId) === cleanText(recipient.birdContactId),
    ) ||
    resultRows[index] ||
    null
  );
}

function getResultReason(result) {
  if (!result) return "";

  if (result.error) return cleanText(result.error);
  if (result.reason) return cleanText(result.reason);

  if (typeof result.data === "string") return cleanText(result.data);

  return (
    cleanText(result.data?.error) ||
    cleanText(result.data?.message) ||
    cleanText(result.data?.detail) ||
    cleanText(result.message) ||
    cleanText(result.detail) ||
    ""
  );
}

function getRecipientStatus({ itemStatus, result }) {
  if (result) {
    if (result.ok === true) return "sent";
    if (result.ok === false) return "failed";
  }

  if (["queued", "scheduled"].includes(itemStatus)) return "scheduled";
  if (["processing", "sending"].includes(itemStatus)) return "sending";
  if (itemStatus === "sent") return "sent";
  if (itemStatus === "partial") return "partial";
  if (itemStatus === "failed") return "failed";
  if (itemStatus === "cancelled") return "cancelled";

  return itemStatus || "unknown";
}

function getStatusClass(status) {
  if (status === "sent") return styles.recipientStatusSent;
  if (status === "failed") return styles.recipientStatusFailed;
  if (status === "partial") return styles.recipientStatusPartial;
  if (status === "sending" || status === "processing") {
    return styles.recipientStatusSending;
  }
  if (status === "cancelled") return styles.recipientStatusCancelled;

  return styles.recipientStatusScheduled;
}

function getStatusIcon(status) {
  if (status === "sent") return <CheckCircle2 aria-hidden />;
  if (status === "failed") return <AlertCircle aria-hidden />;
  if (status === "sending" || status === "processing") {
    return <Send aria-hidden />;
  }

  return <Clock3 aria-hidden />;
}

function buildRecipientRows(selectedItem, orgUsers, unnamedGroupLabel) {
  /* Mensagem para grupos do Teams (#166): uma linha por grupo. */
  const groups = getScheduledGroups(selectedItem);

  if (groups) {
    return groups.map((group, index) => ({
      id: `group-${group.id}-${index}`,
      label: cleanText(group.name) || unnamedGroupLabel,
      userId: "",
      phoneNumber: "",
      email: "",
      whatsappBsuid: "",
      whatsappUsername: "",
      birdContactId: "",
      status: getRecipientStatus({
        itemStatus: selectedItem?.status,
        result: null,
      }),
      resultStatusCode: null,
      reason: "",
      kind: "",
    }));
  }

  const payload = getItemPayload(selectedItem);
  const resultRows = getResultRows(selectedItem);
  const normalizedUsers = Array.isArray(orgUsers)
    ? orgUsers.map(normalizeUserForLookup)
    : [];

  const rawRecipients = Array.isArray(payload.recipients)
    ? payload.recipients
    : Array.isArray(payload.userIds)
      ? payload.userIds
      : [];

  const sourceRows = rawRecipients.length ? rawRecipients : resultRows;

  return sourceRows.map((raw, index) => {
    const recipient = normalizeRecipient(raw, selectedItem?.channel);
    const matchedUser = findMatchingUser(recipient, normalizedUsers);
    const result = findMatchingResult(recipient, index, resultRows);

    const status = getRecipientStatus({
      itemStatus: selectedItem?.status,
      result,
    });

    const label =
      cleanText(matchedUser?.name) ||
      cleanText(recipient.name) ||
      cleanText(matchedUser?.email) ||
      cleanText(recipient.email) ||
      cleanText(matchedUser?.phoneNumber) ||
      cleanText(recipient.phoneNumber) ||
      cleanText(matchedUser?.whatsappUsername) ||
      cleanText(recipient.whatsappUsername) ||
      cleanText(matchedUser?.whatsappBsuid) ||
      cleanText(recipient.whatsappBsuid) ||
      cleanText(recipient.value) ||
      "Unknown recipient";

    const phoneNumber =
      cleanText(matchedUser?.phoneNumber) || cleanText(recipient.phoneNumber);

    const email = cleanText(matchedUser?.email) || cleanText(recipient.email);

    const whatsappBsuid =
      cleanText(recipient.whatsappBsuid) ||
      cleanText(result?.whatsappBsuid) ||
      (!phoneNumber ? cleanText(matchedUser?.whatsappBsuid) : "");

    const whatsappUsername =
      cleanText(recipient.whatsappUsername) ||
      cleanText(result?.whatsappUsername) ||
      (!phoneNumber ? cleanText(matchedUser?.whatsappUsername) : "");

    const birdContactId =
      cleanText(recipient.birdContactId) ||
      cleanText(result?.birdContactId) ||
      (!phoneNumber && !whatsappBsuid
        ? cleanText(matchedUser?.birdContactId)
        : "");

    return {
      id: `${cleanText(recipient.userId) || label}-${index}`,
      label,
      userId: cleanText(matchedUser?.id) || cleanText(recipient.userId),
      phoneNumber,
      email,
      whatsappBsuid,
      whatsappUsername,
      birdContactId,
      status,
      resultStatusCode: result?.status || null,
      reason: getResultReason(result),
      kind: result?.kind || "",
    };
  });
}

function getFiles(payload) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const imageUrls = Array.isArray(payload.imageUrls) ? payload.imageUrls : [];

  const imageOnlyFiles = imageUrls
    .filter(Boolean)
    .filter((url) => !files.some((file) => file?.url === url))
    .map((url, index) => ({
      url,
      name: `Image ${index + 1}`,
      contentType: "image/*",
    }));

  return [...files, ...imageOnlyFiles];
}

export default function ScheduledViewModal({
  selectedItem,
  orgUsers = [],
  translation,
  isViewModalOpen,
  closeViewModal,
  canEditItem,
  openEditModal,
  canDeleteItem,
  handleDelete,
}) {
  const payload = getItemPayload(selectedItem);
  const result = getItemResult(selectedItem);

  const unnamedGroupLabel = safeTranslate(
    translation,
    "EditModal.unnamedGroup",
    "Unnamed group",
  );

  const recipientRows = useMemo(
    () => buildRecipientRows(selectedItem, orgUsers, unnamedGroupLabel),
    [selectedItem, orgUsers, unnamedGroupLabel],
  );

  const isGroupItem = Boolean(getScheduledGroups(selectedItem));

  const files = useMemo(() => getFiles(payload), [payload]);

  const trackedLinks = Array.isArray(payload.trackedLinks)
    ? payload.trackedLinks
    : [];

  const template = payload.template || null;
  const question = getPayloadQuestion(payload);

  const okCount =
    Number(result.ok) ||
    recipientRows.filter((recipient) => recipient.status === "sent").length;

  const failedCount =
    Number(result.failed) ||
    recipientRows.filter((recipient) => recipient.status === "failed").length;

  const hasDeliverySummary =
    selectedItem?.status === "sent" ||
    selectedItem?.status === "partial" ||
    selectedItem?.status === "failed" ||
    okCount > 0 ||
    failedCount > 0 ||
    selectedItem?.lastError ||
    result.error;

  return (
    <div
      className={`${styles.modalOverlay} ${
        isViewModalOpen ? styles.overlayOpen : styles.overlayClosing
      }`}
      onMouseDown={closeViewModal}
    >
      <div
        className={`${styles.modal} ${styles.viewModal} ${
          isViewModalOpen ? styles.modalOpen : styles.modalClosing
        }`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>{translation("ViewModal.title")}</h2>
            <p className={styles.modalSubtitle}>
              {safeTranslate(
                translation,
                "ViewModal.subtitle",
                "Full scheduled broadcast information",
              )}
            </p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={closeViewModal}
            aria-label="Close"
          >
            <X aria-hidden />
          </button>
        </div>

        <div className={styles.viewSummaryCards}>
          <div className={styles.viewSummaryCard}>
            <span>{translation("Table.channel")}</span>
            <strong>{translation(`Channels.${selectedItem.channel}`)}</strong>
          </div>

          <div className={styles.viewSummaryCard}>
            <span>{translation("Table.status")}</span>
            <strong>{translation(`Statuses.${selectedItem.status}`)}</strong>
          </div>

          <div className={styles.viewSummaryCard}>
            <span>{translation("Table.recipients")}</span>
            <strong>
              {recipientRows.length || selectedItem.recipientsCount}
            </strong>
          </div>
        </div>

        <div className={styles.viewSection}>
          <div className={styles.viewSectionTitle}>
            <Clock3 aria-hidden />
            <span>
              {safeTranslate(translation, "ViewModal.scheduleInfo", "Schedule")}
            </span>
          </div>

          <div className={styles.detailGrid}>
            <div>
              <span className={styles.detailLabel}>
                {translation("Table.scheduledFor")}
              </span>
              <p>
                {formatDateTime(
                  selectedItem.scheduledFor,
                  selectedItem.timezone,
                )}
              </p>
            </div>

            <div>
              <span className={styles.detailLabel}>
                {translation("Timezone")}
              </span>
              <p>{selectedItem.timezone || "Europe/Lisbon"}</p>
            </div>

            <div>
              <span className={styles.detailLabel}>
                {translation("ViewModal.createdAt")}
              </span>
              <p>{formatDateTime(selectedItem.createdAt)}</p>
            </div>

            <div>
              <span className={styles.detailLabel}>
                {translation("Table.createdBy")}
              </span>
              <p>{selectedItem.createdBy || "-"}</p>
            </div>

            <div className={styles.detailGridWide}>
              <span className={styles.detailLabel}>ID</span>
              <p className={styles.monoText}>{selectedItem.id}</p>
            </div>
          </div>
        </div>

        <div className={styles.viewSection}>
          <div className={styles.viewSectionTitle}>
            <FileText aria-hidden />
            <span>{translation("Table.message")}</span>
          </div>

          <div className={styles.messageBox}>
            <p className={styles.fullMessage}>{selectedItem.message || "-"}</p>
          </div>
        </div>

        {question ? (
          <div className={styles.viewSection}>
            <div className={styles.viewSectionTitle}>
              <FileText aria-hidden />
              <span>
                {safeTranslate(
                  translation,
                  `ViewModal.question.${question.kind}`,
                  "Pergunta",
                )}
              </span>
            </div>

            <div className={styles.messageBox}>
              {Array.isArray(question.options)
                ? question.options.map((option, index) => (
                    <p key={`${option.label}-${index}`} className={styles.fullMessage}>
                      {index + 1}. {option.label}
                      {option.correct ? " ✓" : ""}
                    </p>
                  ))
                : null}

              {question.kind === "open" && question.expectedAnswer ? (
                <p className={styles.fullMessage}>
                  {safeTranslate(
                    translation,
                    "ViewModal.question.expectedAnswer",
                    "Resposta esperada",
                  )}
                  : {question.expectedAnswer}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {template ? (
          <div className={styles.viewSection}>
            <div className={styles.viewSectionTitle}>
              <Send aria-hidden />
              <span>
                {safeTranslate(
                  translation,
                  "ViewModal.template",
                  "WhatsApp template",
                )}
              </span>
            </div>

            <div className={styles.templateInfoBox}>
              <div>
                <span className={styles.detailLabel}>Name</span>
                <p>{template.name || "-"}</p>
              </div>

              <div>
                <span className={styles.detailLabel}>Project ID</span>
                <p className={styles.monoText}>{template.projectId || "-"}</p>
              </div>

              <div>
                <span className={styles.detailLabel}>Language</span>
                <p>{template.languageCode || "-"}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.viewSection}>
          <div className={styles.viewSectionHeader}>
            <div className={styles.viewSectionTitle}>
              <Users aria-hidden />
              <span>
                {isGroupItem
                  ? safeTranslate(translation, "ViewModal.groups", "Teams groups")
                  : safeTranslate(
                      translation,
                      "ViewModal.recipients",
                      "Recipients",
                    )}
              </span>
            </div>

            <span className={styles.sectionCount}>
              {recipientRows.length || selectedItem.recipientsCount}
            </span>
          </div>

          {recipientRows.length ? (
            <div className={styles.recipientsList}>
              {recipientRows.map((recipient) => (
                <div key={recipient.id} className={styles.recipientCard}>
                  <div className={styles.recipientMainRow}>
                    <div>
                      <strong>{recipient.label}</strong>

                      <div className={styles.recipientMeta}>
                        {recipient.phoneNumber ? (
                          <span>Phone: {recipient.phoneNumber}</span>
                        ) : null}

                        {recipient.email ? (
                          <span>Email: {recipient.email}</span>
                        ) : null}

                        {recipient.whatsappUsername ? (
                          <span>WhatsApp: {recipient.whatsappUsername}</span>
                        ) : null}

                        {recipient.whatsappBsuid ? (
                          <span>BSUID: {recipient.whatsappBsuid}</span>
                        ) : null}

                        {recipient.birdContactId ? (
                          <span>Bird contact: {recipient.birdContactId}</span>
                        ) : null}

                        {recipient.userId ? (
                          <span>User ID: {recipient.userId}</span>
                        ) : null}
                      </div>
                    </div>

                    <span
                      className={`${styles.recipientStatus} ${getStatusClass(
                        recipient.status,
                      )}`}
                    >
                      {getStatusIcon(recipient.status)}
                      <span>
                        {safeTranslate(
                          translation,
                          `Statuses.${recipient.status}`,
                          recipient.status,
                        )}
                      </span>
                    </span>
                  </div>

                  {recipient.kind || recipient.resultStatusCode ? (
                    <div className={styles.recipientTechnicalRow}>
                      {recipient.kind ? (
                        <span>Type: {recipient.kind}</span>
                      ) : null}

                      {recipient.resultStatusCode ? (
                        <span>
                          Provider status: {recipient.resultStatusCode}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {recipient.reason ? (
                    <div className={styles.recipientReason}>
                      {recipient.reason}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyDetailBox}>
              {safeTranslate(
                translation,
                "ViewModal.noRecipients",
                "No recipient details were saved in this scheduled broadcast.",
              )}
            </div>
          )}
        </div>

        {hasDeliverySummary ? (
          <div className={styles.viewSection}>
            <div className={styles.viewSectionTitle}>
              <CheckCircle2 aria-hidden />
              <span>
                {safeTranslate(
                  translation,
                  "ViewModal.deliverySummary",
                  "Delivery summary",
                )}
              </span>
            </div>

            <div className={styles.deliverySummary}>
              <div>
                <span>
                  {safeTranslate(translation, "Common.success", "Success")}
                </span>
                <strong>{okCount}</strong>
              </div>

              <div>
                <span>
                  {safeTranslate(translation, "Common.failed", "Failed")}
                </span>
                <strong>{failedCount}</strong>
              </div>

              <div>
                <span>
                  {safeTranslate(translation, "Table.status", "Status")}
                </span>
                <strong>
                  {translation(`Statuses.${selectedItem.status}`)}
                </strong>
              </div>
            </div>

            {selectedItem.lastError || result.error ? (
              <div className={styles.deliveryErrorBox}>
                {selectedItem.lastError || result.error}
              </div>
            ) : null}
          </div>
        ) : null}

        {trackedLinks.length ? (
          <div className={styles.viewSection}>
            <div className={styles.viewSectionTitle}>
              <Link2 aria-hidden />
              <span>
                {safeTranslate(
                  translation,
                  "ViewModal.trackedLinks",
                  "Tracked links",
                )}
              </span>
            </div>

            <div className={styles.linkList}>
              {trackedLinks.map((link, index) => (
                <div key={`${link.key || index}`} className={styles.linkCard}>
                  <strong>
                    {link.label || link.key || `Link ${index + 1}`}
                  </strong>
                  <span className={styles.monoText}>
                    {"{{link."}
                    {link.key}
                    {"}}"}
                  </span>
                  <p>{link.destinationUrl || "-"}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {files.length ? (
          <div className={styles.viewSection}>
            <div className={styles.viewSectionTitle}>
              <FileText aria-hidden />
              <span>
                {safeTranslate(translation, "ViewModal.files", "Files")}
              </span>
            </div>

            <div className={styles.fileList}>
              {files.map((file, index) => (
                <a
                  key={`${file.url || file.name || index}`}
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.fileCard}
                >
                  <FileText aria-hidden />
                  <span>{file.name || file.url || `File ${index + 1}`}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.modalFooter}>
          {canEditItem(selectedItem) ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                const item = selectedItem;
                closeViewModal();

                setTimeout(() => {
                  openEditModal(item);
                }, 120);
              }}
            >
              <Pencil aria-hidden className={styles.buttonIcon} />
              <span>{translation("Actions.edit")}</span>
            </button>
          ) : null}

          {canDeleteItem(selectedItem) ? (
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => handleDelete(selectedItem)}
            >
              <Trash2 aria-hidden className={styles.buttonIcon} />
              <span>{translation("Actions.delete")}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
