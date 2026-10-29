import styles from "../dashboard.module.css";

export function ActivityChart({ series, t, locale }) {
  const max = Math.max(1, ...series.map((day) => day.teams + day.whatsapp));
  const dayFormatter = new Intl.DateTimeFormat(locale, { day: "numeric" });
  const fullFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className={styles.chart} role="img" aria-label={t("activity.title")}>
      <div className={styles.chartBars}>
        {series.map((day) => {
          const date = new Date(`${day.date}T00:00:00Z`);
          const total = day.teams + day.whatsapp;
          return (
            <div
              key={day.date}
              className={styles.chartColumn}
              title={t("activity.dayTooltip", {
                date: fullFormatter.format(date),
                teams: day.teams,
                whatsapp: day.whatsapp,
              })}
            >
              <div className={styles.chartStack}>
                {total ? (
                  <>
                    <span
                      className={styles.chartTeams}
                      style={{ height: `${(day.teams / max) * 100}%` }}
                    />
                    <span
                      className={styles.chartWhatsapp}
                      style={{ height: `${(day.whatsapp / max) * 100}%` }}
                    />
                  </>
                ) : (
                  <span className={styles.chartEmptyTick} />
                )}
              </div>
              <span className={styles.chartLabel}>
                {dayFormatter.format(date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
