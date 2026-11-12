import { useId } from "react";
import DatePicker from "react-datepicker";

import styles from "../../broadcast.module.css";
import {
  buildInitialScheduledDate,
  scheduleTimeSlots,
  timeSlotOf,
  withTimeSlot,
} from "../../lib/helpers";
import InfoHint from "../InfoHint";

const TIME_SLOTS = scheduleTimeSlots();

export default function SchedulePanel({
  scheduledFor,
  setScheduledFor,
  scheduleInvalid,
  browserTimeZone,
  translation,
  usage = null,
  limitWarning = null,
}) {
  const timeSelectId = useId();

  /*
   * #235: a hora escolhe-se numa lista de 15 em 15 minutos, das 08:00 às
   * 20:00, por isso não há horas inválidas para escrever nem erros a explicar.
   * Hoje, as horas que já passaram ficam desativadas; depois das 19:45 o
   * primeiro dia possível já é amanhã.
   */
  const firstAvailable = buildInitialScheduledDate();
  const now = Date.now();
  const currentSlot = timeSlotOf(scheduledFor);
  const slots = TIME_SLOTS.includes(currentSlot)
    ? TIME_SLOTS
    : [...TIME_SLOTS, currentSlot].sort();

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

      {/*
        #235: só o calendário e, por baixo, a lista das horas. O resumo
        «12/11/2026 · 12:00» saiu: o dia fica marcado no calendário, a hora na
        lista e os dois no botão «Agendar para …».
      */}
      <div className={styles.scheduleLayout}>
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

              /* Hoje com uma hora que já passou: a primeira que ainda dá. */
              setScheduledFor(
                next.getTime() < firstAvailable.getTime()
                  ? firstAvailable
                  : next,
              );
            }}
            inline
            dateFormat="dd/MM/yyyy"
            minDate={firstAvailable}
          />
        </div>

        <div className={styles.timeInputGroup}>
          <div className={styles.timeLabelRow}>
            <label htmlFor={timeSelectId} className={styles.smallLabel}>
              {translation("Broadcast.hour")}
            </label>
            <InfoHint text={translation("Broadcast.chooseTime")} />
          </div>

          <select
            id={timeSelectId}
            className={styles.timeSelect}
            value={currentSlot}
            onChange={(event) =>
              setScheduledFor(withTimeSlot(scheduledFor, event.target.value))
            }
          >
            {slots.map((slot) => (
              <option
                key={slot}
                value={slot}
                disabled={withTimeSlot(scheduledFor, slot).getTime() <= now}
              >
                {slot}
              </option>
            ))}
          </select>
        </div>
      </div>

      {scheduleInvalid && (
        <div className={styles.scheduleError}>
          {translation("Broadcast.scheduleError")}
        </div>
      )}
    </div>
  );
}
