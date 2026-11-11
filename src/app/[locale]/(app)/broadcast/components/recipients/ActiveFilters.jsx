import { X } from "lucide-react";

import styles from "../../broadcast.module.css";

export default function ActiveFilters({
  allTags,
  assistantsList,
  selectedTagIds,
  setSelectedTagIds,
  selectedAssistantIds,
  setSelectedAssistantIds,
  translation,
}) {
  const activeFilterCount = selectedTagIds.length + selectedAssistantIds.length;

  if (activeFilterCount === 0) return null;

  return (
    <div className={styles.activeFilters}>
      {selectedTagIds.map((id) => {
        const tag = allTags.find((x) => x.id === id);
        if (!tag) return null;

        return (
          <button
            key={`t${id}`}
            className={styles.filterChip}
            onClick={() =>
              setSelectedTagIds((prev) => prev.filter((x) => x !== id))
            }
            title={translation("Users.filters.remove")}
          >
            {tag.name} ×
          </button>
        );
      })}

      {selectedAssistantIds.map((id) => {
        const assistant = assistantsList.find((x) => x.id === id);
        if (!assistant) return null;

        return (
          <button
            key={`a${id}`}
            className={styles.filterChip}
            onClick={() =>
              setSelectedAssistantIds((prev) => prev.filter((x) => x !== id))
            }
            title={translation("Users.filters.remove")}
          >
            {assistant.name} ×
          </button>
        );
      })}

      <button
        type="button"
        className={styles.filterClearAll}
        onClick={() => {
          setSelectedTagIds([]);
          setSelectedAssistantIds([]);
        }}
      >
        <X size={14} aria-hidden />
        {translation("Common.clearAll")}
      </button>
    </div>
  );
}
