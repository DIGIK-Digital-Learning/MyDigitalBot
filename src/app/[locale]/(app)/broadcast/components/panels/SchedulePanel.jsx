import DatePicker from "react-datepicker";

import styles from "../../broadcast.module.css";
import { formatHour, formatMinute } from "../../lib/helpers";

export default function SchedulePanel({
  scheduledFor,
  setScheduledFor,
  hourDraft,
  minuteDraft,
  handleHourChange,
  handleMinuteChange,
  commitTimeParts,
  timeError,
  scheduleInvalid,
  browserTimeZone,
  translation,
  usage = null,
  limitWarning = null,
}) {
  return (
    <div className={styles.toolPanelCard}>
      {/*
        Limite de agendadas do plano (#186): o contador ("2 / 100") e, quando
        está cheio, a explicação de porque o botão Agendar está desativado.
      */}
      <div className={styles.scheduleHint}>
        <span>
          {translation("Broadcast.timezone")}: {browserTimeZone}
        </span>
        {usage}
      </div>

      {limitWarning ? (
        <div className={styles.composerWarning} role="status">
          {limitWarning}
        </div>
      ) : null}

      <div className={styles.scheduleLayout}>
        <div className={styles.scheduleCalendarCol}>
          <div className={styles.calendarWrap}>
            <DatePicker
              selected={scheduledFor}
              onChange={(date) => {
                if (!date) return;

                const next = new Date(date);
                next.setHours(
                  scheduledFor.getHours(),
                  scheduledFor.getMinutes(),
                  0,
                  0,
                );

                setScheduledFor(next);
              }}
              inline
              dateFormat="dd/MM/yyyy"
              minDate={new Date()}
            />
          </div>
        </div>

        <div className={styles.scheduleTimeCol}>
          <div className={styles.scheduleTimeCard}>
            <div className={styles.scheduleSummaryLabel}>
              {translation("Broadcast.selectSendTime")}
            </div>

            <div className={styles.scheduleSummaryValue}>
              {scheduledFor.toLocaleDateString()} · {formatHour(scheduledFor)}:
              {formatMinute(scheduledFor)}
            </div>

            <div className={styles.scheduleMiniHint}>
              {translation("Broadcast.chooseTime")}
            </div>

            <div className={styles.timeInputGroup}>
              <label className={styles.smallLabel}>
                {translation("Broadcast.hour")}
              </label>

              <div
                className={styles.timeInputsCompact}
                onBlur={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget)) return;

                  const ok = commitTimeParts(hourDraft, minuteDraft);
                  if (!ok) {
                    handleHourChange(formatHour(scheduledFor));
                    handleMinuteChange(formatMinute(scheduledFor));
                  }
                }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="08"
                  value={hourDraft}
                  onChange={(e) => handleHourChange(e.target.value)}
                  className={styles.timeInputSmall}
                />

                <span className={styles.timeSeparator}>:</span>

                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00"
                  value={minuteDraft}
                  onChange={(e) => handleMinuteChange(e.target.value)}
                  className={styles.timeInputSmall}
                />
              </div>

              {timeError && (
                <div className={styles.scheduleError}>{timeError}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {scheduleInvalid && !timeError && (
        <div className={styles.scheduleError}>
          {translation("Broadcast.scheduleError")}
        </div>
      )}
    </div>
  );
}
