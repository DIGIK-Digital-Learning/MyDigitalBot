import { Skeleton, SkeletonStatus } from "@/app/components/Skeleton/Skeleton";
import styles from "../dashboard.module.css";

function SectionSkeleton({ children }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <span className={styles.skeletonCopy}>
          <Skeleton width="34%" height={16} />
          <Skeleton width="62%" />
        </span>
      </header>
      {children}
    </section>
  );
}

function StatsSkeleton({ count, className }) {
  return (
    <div className={`${styles.stats} ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.stat}>
          <Skeleton width="62%" />
          <Skeleton width="38%" height={30} radius={8} />
          <Skeleton width="74%" height={10} />
        </div>
      ))}
    </div>
  );
}

/** O Dashboard a carregar, com as mesmas secções e grelhas da página. */
export function DashboardLoadingState() {
  return (
    <SkeletonStatus className={styles.content}>
      <SectionSkeleton>
        <StatsSkeleton count={5} className={styles.statsFive} />
      </SectionSkeleton>

      <div className={styles.columns}>
        <SectionSkeleton>
          <StatsSkeleton count={2} className={styles.statsTwo} />
        </SectionSkeleton>
        <SectionSkeleton>
          <StatsSkeleton count={3} className={styles.statsThree} />
        </SectionSkeleton>
      </div>

      <div className={styles.columnsWide}>
        <SectionSkeleton>
          <div className={styles.chartPanel}>
            <Skeleton width="30%" height={16} />
            <Skeleton height={220} radius={12} />
          </div>
        </SectionSkeleton>
        <SectionSkeleton>
          <ul className={styles.upcomingList}>
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className={styles.upcomingItem}>
                <Skeleton width={96} />
                <span className={styles.skeletonCopy}>
                  <Skeleton width="80%" />
                  <Skeleton width="45%" height={10} />
                </span>
              </li>
            ))}
          </ul>
        </SectionSkeleton>
      </div>
    </SkeletonStatus>
  );
}
