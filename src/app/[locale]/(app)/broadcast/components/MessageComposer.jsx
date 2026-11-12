import styles from "../broadcast.module.css";

/**
 * Painel de composição. Recebe o telemóvel (ou a mensagem de abertura) já
 * montado e junta-lhe a sequência, os links rastreados e a escolha entre
 * enviar agora ou agendar.
 */
export default function MessageComposer({
  title,
  onBack,
  hint,
  warning = null,
  chainControls = null,
  activeToolPanel,
  deliveryMode,
  setDeliveryMode,
  sending,
  schedulePanel,
  translation,
  phone,
  children,
}) {
  const scheduling = deliveryMode === "schedule" && Boolean(schedulePanel);

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

      {/*
        #235, a ordem do painel: sequência → telemóvel → links rastreados →
        envio.
        - Os links fazem parte da mensagem: o botão 🔗 está na barra do
          telemóvel e o painel abre logo por baixo dele.
        - Ao escolher «Agendar», o calendário e a hora aparecem à direita do
          telemóvel. Se o painel não tiver largura para os dois (portáteis
          estreitos, telemóvel), o calendário abre por baixo dos botões
          «Enviar agora | Agendar».
        A posição muda só no CSS (grid-template-areas): o telemóvel fica sempre
        no mesmo sítio da árvore, para o editor não ser recriado (nem perder o
        que se escreveu) ao mudar de modo.
      */}
      <div className={styles.composerBody}>
        <div
          className={`${styles.composerGrid} ${
            scheduling ? styles.composerGridScheduling : ""
          }`}
        >
          <div className={styles.areaPhone}>{phone}</div>

          {activeToolPanel === "links" && children ? (
            <div
              className={`${styles.inlineToolPanel} ${styles.areaLinks}`}
              data-testid="links-panel"
            >
              {children}
            </div>
          ) : null}

          {/* Porque o envio está bloqueado, quando não é óbvio. */}
          {warning ? (
            <div
              className={`${styles.composerWarning} ${styles.areaWarning}`}
              role="status"
            >
              {warning}
            </div>
          ) : null}

          <div className={`${styles.messageToolsRow} ${styles.areaTools}`}>
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

          {scheduling ? (
            <section
              className={styles.areaSchedule}
              aria-label={translation("Broadcast.scheduleBtn")}
              data-testid="schedule-side"
            >
              {schedulePanel}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
