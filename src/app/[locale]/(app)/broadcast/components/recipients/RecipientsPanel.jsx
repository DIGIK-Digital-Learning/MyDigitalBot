import { Filter } from "lucide-react";

import FilterMenu from "@/app/[locale]/(app)/users/FilterMenu";
import {
  Skeleton,
  SkeletonStatus,
  SkeletonText,
} from "@/app/components/Skeleton/Skeleton";

import styles from "../../broadcast.module.css";
import ActiveFilters from "./ActiveFilters";
import RecipientRow from "./RecipientRow";

export default function RecipientsPanel({
  filterBtnRef,
  filterOpen,
  setFilterOpen,
  activeFilterCount,
  allTags,
  assistantsList,
  selectedTagIds,
  setSelectedTagIds,
  selectedAssistantIds,
  setSelectedAssistantIds,
  q,
  setQ,
  filtered,
  selected,
  toggleOne,
  toggleAllCurrent,
  allOnPageSelected,
  channel,
  translation,
  loading = false,
}) {
  return (
    <>
      <div className={styles.panel}>
        <div className={styles.recipientsHeader}>
          <div className={styles.recipientsActionsRow}>
            <button
              type="button"
              ref={filterBtnRef}
              className={`${styles.kbdBtn} ${styles.filterBtn}`}
              onClick={() => setFilterOpen((v) => !v)}
              title={translation("Common.filter")}
            >
              <Filter size={16} />
              <span>{translation("Common.filter")}</span>

              {activeFilterCount > 0 && (
                <span className={styles.filterBadge}>{activeFilterCount}</span>
              )}
            </button>

            <button onClick={toggleAllCurrent} className={styles.kbdBtn}>
              {allOnPageSelected
                ? translation("Broadcast.deselectAll")
                : translation("Broadcast.selectAll")}
            </button>
          </div>
        </div>

        <div className={styles.searchWrap}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={translation("Broadcast.searchPeople")}
            className={styles.searchInput}
          />
        </div>

        <ActiveFilters
          allTags={allTags}
          assistantsList={assistantsList}
          selectedTagIds={selectedTagIds}
          setSelectedTagIds={setSelectedTagIds}
          selectedAssistantIds={selectedAssistantIds}
          setSelectedAssistantIds={setSelectedAssistantIds}
          translation={translation}
        />

        <div className={styles.listBox}>
          {loading ? (
            <SkeletonStatus>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <div
                  key={index}
                  className={`${styles.row} ${index % 2 ? styles.rowAlt : ""}`}
                >
                  <Skeleton width={16} height={16} radius={4} />
                  <Skeleton width={28} height={28} radius="50%" />
                  <SkeletonText />
                </div>
              ))}
            </SkeletonStatus>
          ) : null}

          {!loading &&
            filtered.map((user, index) => (
              <RecipientRow
                key={user.id}
                user={user}
                index={index}
                selected={selected.has(user.id)}
                onToggle={() => toggleOne(user.id)}
                channel={channel}
                translation={translation}
              />
            ))}

          {!loading && filtered.length === 0 && (
            <div className={styles.empty}>
              {translation("Broadcast.emptyUsers")}
            </div>
          )}
        </div>
      </div>

      <FilterMenu
        side="left"
        open={filterOpen}
        anchorEl={filterBtnRef.current}
        tags={allTags}
        assistants={assistantsList}
        selectedTagIds={selectedTagIds}
        setSelectedTagIds={setSelectedTagIds}
        selectedAssistantIds={selectedAssistantIds}
        setSelectedAssistantIds={setSelectedAssistantIds}
        onClose={() => setFilterOpen(false)}
        onClear={() => {
          setSelectedTagIds([]);
          setSelectedAssistantIds([]);
          setFilterOpen(false);
        }}
      />
    </>
  );
}
