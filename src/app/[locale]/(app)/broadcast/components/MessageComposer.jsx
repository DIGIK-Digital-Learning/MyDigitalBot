import { Link2 } from "lucide-react";

import styles from "../broadcast.module.css";
import ToolToggleButton from "./ToolToggleButton";

/**
 * Painel de composição. Recebe o telemóvel (ou a mensagem de abertura) já
 * montado e junta-lhe ferramentas como correntes e links rastreados.
 */
export default function MessageComposer({
  title,
  onBack,
  hint,
  warning = null,
  chainControls = null,
  leftToolsContent = null,
  showLinks = true,
  activeToolPanel,
  toggleToolPanel,
  deliveryMode,
  setDeliveryMode,
  sending,
  schedulePanel,
  trackedLinksCount,
  translation,
  phone,
  children,
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.composerHead}>
        <div className={styles.panelTitle} style={{ marginBottom: 0 }}>
          {title}
        </div>

        {onBack && (
          <button type="button" className={styles.backBtn} onClick={onBack}>
            {translation("Broadcast.composer.back")}
          </button>
        )}
      </div>

      {chainControls}

      {hint ? <div className={styles.composerHint}>{hint}</div> : null}

      {phone}

      {/* Porque o envio está bloqueado, quando não é óbvio. */}
      {warning ? (
        <div className={styles.composerWarning} role="status">
          {warning}
        </div>
      ) : null}

      <div className={styles.messageToolsRow}>
        <div className={styles.messageToolsLeft}>{leftToolsContent}</div>

        <div className={styles.messageToolsActions}>
          {showLinks && (
            <ToolToggleButton
              active={activeToolPanel === "links"}
              icon={<Link2 size={16} />}
              label={translation("Broadcast.trackedLinks")}
              badge={trackedLinksCount > 0 ? trackedLinksCount : null}
              onClick={() => toggleToolPanel("links")}
            />
          )}

          <div
            className={styles.deliveryModeSwitch}
            role="group"
            aria-label={translation("Broadcast.deliveryMode")}
          >
            <button
              type="button"
              className={`${styles.deliveryModeBtn} ${
                deliveryMode === "now" ? styles.deliveryModeBtnActive : ""
              }`}
              aria-pressed={deliveryMode === "now"}
              disabled={sending}
              onClick={() => setDeliveryMode("now")}
            >
              {translation("Broadcast.sendnow")}
            </button>

            <button
              type="button"
              className={`${styles.deliveryModeBtn} ${
                deliveryMode === "schedule" ? styles.deliveryModeBtnActive : ""
              }`}
              aria-pressed={deliveryMode === "schedule"}
              disabled={sending}
              onClick={() => setDeliveryMode("schedule")}
            >
              {translation("Broadcast.scheduleBtn")}
            </button>
          </div>
        </div>
      </div>

      {deliveryMode === "schedule" && schedulePanel ? (
        <div className={styles.inlineToolPanel}>{schedulePanel}</div>
      ) : null}

      {activeToolPanel === "links" && (
        <div className={styles.inlineToolPanel}>{children}</div>
      )}
    </div>
  );
}
