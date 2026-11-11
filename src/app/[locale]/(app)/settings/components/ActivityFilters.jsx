import { X } from "lucide-react";
import PillSelect from "@/app/components/PillSelect/PillSelect";
import styles from "../settings.module.css";

export default function ActivityFilters({
  translation,
  area,
  areaOptions,
  onAreaChange,
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
}) {
  const hasFilters = (area && area !== "all") || from || to;

  return (
    <div className={styles.toolbar}>
      <PillSelect
        value={area}
        options={areaOptions}
        onChange={onAreaChange}
        placeholder={translation("Areas.all")}
        className={styles.pillFilter}
        style={{
          height: "44px",
          padding: "0 16px",
          borderRadius: "9999px",
          boxSizing: "border-box",
        }}
      />

      <label className={styles.dateField}>
        <span className={styles.dateLabel}>{translation("Filters.from")}</span>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
          className={styles.dateInput}
          aria-label={translation("Filters.from")}
        />
      </label>

      <label className={styles.dateField}>
        <span className={styles.dateLabel}>{translation("Filters.to")}</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
          className={styles.dateInput}
          aria-label={translation("Filters.to")}
        />
      </label>

      {hasFilters ? (
        <button type="button" onClick={onClear} className={styles.ghostButton}>
          <X aria-hidden className={styles.buttonIcon} />
          <span>{translation("Filters.clear")}</span>
        </button>
      ) : null}
    </div>
  );
}
