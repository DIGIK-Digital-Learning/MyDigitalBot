import {
  Skeleton,
  SkeletonStatus,
  SkeletonText,
} from "@/app/components/Skeleton/Skeleton";
import styles from "./assistants.module.css";

function ListItems() {
  return ["72%", "56%", "64%", "48%"].map((width) => (
    <div key={width} className={styles.listItem}>
      <Skeleton width={width} />
    </div>
  ));
}

/* O cartão azul do assistente e um cartão escuro por baixo. */
function DetailCards() {
  return (
    <>
      <div
        className={`${styles.card} ${styles.primaryCard} ${styles.skeletonCard}`}
      >
        <Skeleton width="40%" height={24} radius={8} />
        <SkeletonText lines={3} />
      </div>
      <div className={`${styles.card} ${styles.skeletonCard}`}>
        <Skeleton width="30%" height={16} />
        <SkeletonText lines={2} />
      </div>
    </>
  );
}

/** A lista de assistentes a carregar. */
export function ListSkeleton({ label }) {
  return (
    <SkeletonStatus label={label}>
      <ListItems />
    </SkeletonStatus>
  );
}

/** O assistente escolhido a carregar. */
export function DetailSkeleton({ label }) {
  return (
    <SkeletonStatus className={styles.skeletonDetail} label={label}>
      <DetailCards />
    </SkeletonStatus>
  );
}

/** A página inteira a carregar, com as três colunas (loading.jsx). */
export default function AssistantsSkeleton() {
  return (
    <SkeletonStatus className={styles.hub}>
      <aside className={styles.listCol}>
        <div className={styles.listHeader}>
          <Skeleton width="55%" />
        </div>
        <div className={styles.list}>
          <ListItems />
        </div>
      </aside>
      <section className={styles.mainCol}>
        <DetailCards />
      </section>
      <section className={styles.chatCol}>
        <SkeletonText lines={3} />
      </section>
    </SkeletonStatus>
  );
}
