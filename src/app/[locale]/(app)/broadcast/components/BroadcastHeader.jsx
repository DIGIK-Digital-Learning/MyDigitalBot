import { Loader2 } from "lucide-react";

import styles from "../broadcast.module.css";

export default function BroadcastHeader({
  channel,
  setChannel,
  selectedCount,
  sending,
  canSend,
  deliveryMode,
  scheduleActionLabel,
  onPrimaryClick,
  translation,
}) {
  return (
    <div className={styles.headerRow}>
      <div className={styles.channelSwitch}>
        <button
          type="button"
          className={`${styles.channelBtn} ${
            channel === "teams" ? styles.channelBtnActive : ""
          }`}
          onClick={() => setChannel("teams")}
        >
          Teams
        </button>

        <button
          type="button"
          className={`${styles.channelBtn} ${
            channel === "whatsapp" ? styles.channelBtnActive : ""
          }`}
          onClick={() => setChannel("whatsapp")}
        >
          WhatsApp
        </button>
      </div>

      <div className={styles.actionsRight}>
        <div className={styles.selectedLabel}>
          {translation("Broadcast.selected")} <strong>{selectedCount}</strong>
        </div>

        {/* A enviar: rodinha no botão até se fechar o resultado. */}
        <button
          onClick={onPrimaryClick}
          disabled={sending || !canSend}
          aria-busy={sending}
          className={`${styles.primaryBtn} ${styles.primaryBtnWithIcon}`}
        >
          {sending ? (
            <>
              <Loader2
                size={16}
                className={styles.sendingSpinner}
                aria-hidden="true"
                data-testid="sending-spinner"
              />
              {translation("Broadcast.sending")}
            </>
          ) : deliveryMode === "schedule" ? (
            scheduleActionLabel || translation("Broadcast.schedule")
          ) : (
            translation("Broadcast.send")
          )}
        </button>
      </div>
    </div>
  );
}
