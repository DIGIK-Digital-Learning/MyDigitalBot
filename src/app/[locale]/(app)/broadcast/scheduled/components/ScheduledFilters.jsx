import { RefreshCw, Search, X } from "lucide-react";
import PillSelect from "@/app/components/PillSelect/PillSelect";
import styles from "../scheduled.module.css";

export default function ScheduledFilters({
  translation,
  search,
  onSearchChange,
  channelFilter,
  channelOptions,
  onChannelChange,
  statusFilter,
  statusOptions,
  onStatusChange,
  dateFilter,
  onDateChange,
  onClearDate,
  onRefresh,
  usage = null,
}) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">
          <Search size={18} />
        </span>

        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
          placeholder={translation("Filters.searchPlaceholder")}
        />
      </div>

      <div className={styles.dateFilterWrap}>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => onDateChange(e.target.value)}
          className={styles.input}
          aria-label={translation("Filters.datePlaceholder")}
        />

        {dateFilter ? (
          <button
            type="button"
            onClick={onClearDate}
            className={styles.iconButton}
            title={translation("Filters.clearDate")}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <PillSelect
        value={channelFilter}
        options={channelOptions}
        onChange={onChannelChange}
        placeholder={translation("Channels.all")}
        className={styles.pillFilter}
        style={{
          height: "44px",
          padding: "0 16px",
          borderRadius: "9999px",
          boxSizing: "border-box",
        }}
      />

      <PillSelect
        value={statusFilter}
        options={statusOptions}
        onChange={onStatusChange}
        placeholder={translation("Statuses.all")}
        className={styles.pillFilter}
        style={{
          height: "44px",
          padding: "0 16px",
          borderRadius: "9999px",
          boxSizing: "border-box",
        }}
      />

      <button
        type="button"
        onClick={onRefresh}
        className={styles.refreshButton}
      >
        <RefreshCw aria-hidden className={styles.buttonIcon} />
        <span>{translation("Refresh")}</span>
      </button>

      {/* Contador do limite do plano ("2 / 100", #186), sempre à direita. */}
      {usage ? <div className={styles.usageSlot}>{usage}</div> : null}
    </div>
  );
}
