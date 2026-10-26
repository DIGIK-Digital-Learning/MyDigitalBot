"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import NewBadge from "@/app/components/NewBadge/NewBadge";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import useSeenSince from "@/app/hooks/useSeenSince";

import useDeleteTrackedLink from "../../hooks/useDeleteTrackedLink";
import useTrackedLinkLibrary from "../../hooks/useTrackedLinkLibrary";
import styles from "../tracked-links.module.css";

/**
 * Links guardados da organização (#189): os que contam para os 100 do plano,
 * com o ✕ para eliminar (as mesmas regras do composer). Os criados desde a
 * última visita a esta página têm a etiqueta "Novo". As estatísticas dos
 * envios continuam na tabela por baixo.
 */
export default function SavedLinksSection({ orgId }) {
  const translation = useTranslations();
  const library = useTrackedLinkLibrary({ orgId, enabled: Boolean(orgId) });
  const { limits, usage, reload: reloadPlanUsage } = usePlanLimits(orgId);
  const isNew = useSeenSince("seen.trackedLinks", orgId);

  const deleteLink = useDeleteTrackedLink(orgId, {
    onDeleted: () => {
      library.reload();
      reloadPlanUsage();
    },
  });

  return (
    <section className={styles.savedCard}>
      <div className={styles.savedHeader}>
        <div>
          <h2 className={styles.savedTitle}>
            {translation("TrackedLinks.saved.title")}
          </h2>
          <p className={styles.subtitle}>
            {translation("TrackedLinks.saved.description")}
          </p>
        </div>
        <UsageCounter
          used={usage?.trackedLinks}
          limit={limits?.trackedLinks}
          label={translation("Plans.usage.trackedLinksLabel")}
          hint={translation("Plans.usage.trackedLinksHint")}
        />
      </div>

      {library.loading && !library.items.length ? (
        <div className={styles.savedEmpty}>
          {translation("Broadcast.linkLibrary.loading")}
        </div>
      ) : null}

      {library.failed ? (
        <div className={styles.savedEmpty}>
          {translation("Broadcast.linkLibrary.failed")}{" "}
          <button
            type="button"
            className={styles.savedRetry}
            onClick={library.reload}
          >
            {translation("Broadcast.linkLibrary.retry")}
          </button>
        </div>
      ) : null}

      {!library.loading && !library.failed && !library.items.length ? (
        <div className={styles.savedEmpty}>
          {translation("TrackedLinks.saved.empty")}
        </div>
      ) : null}

      {library.items.length ? (
        <ul className={styles.savedList}>
          {library.items.map((item) => (
            <li
              key={item.id || `${item.label}\n${item.destinationUrl}`}
              className={styles.savedItem}
            >
              <div className={styles.savedText}>
                <strong>
                  {item.label}
                  {isNew(item.createdAt) ? <NewBadge /> : null}
                </strong>
                <span className={styles.savedUrl} title={item.destinationUrl}>
                  {item.destinationUrl}
                </span>
              </div>

              {item.id ? (
                <button
                  type="button"
                  className={styles.savedDelete}
                  onClick={() => deleteLink(item)}
                  aria-label={translation("Broadcast.linkLibrary.delete", {
                    label: item.label,
                  })}
                  title={translation("Broadcast.linkLibrary.delete", {
                    label: item.label,
                  })}
                >
                  <X size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
