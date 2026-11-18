import { Skeleton, SkeletonStatus } from "@/app/components/Skeleton/Skeleton";
import styles from "./analytics.module.css";

function SectionSkeleton({ children }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <span className={styles.skeletonCopy}>
          <Skeleton width="30%" height={16} />
          <Skeleton width="55%" />
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

/** As métricas a carregar, com as mesmas secções e grelhas da página. */
export default function AnalyticsSkeleton() {
  return (
    <SkeletonStatus className={styles.content}>
      <SectionSkeleton>
        <StatsSkeleton count={4} className={styles.statsFour} />
      </SectionSkeleton>
      <SectionSkeleton>
        <StatsSkeleton count={5} className={styles.statsFive} />
      </SectionSkeleton>
      <div className={styles.columns}>
        <SectionSkeleton>
          <StatsSkeleton count={3} className={styles.statsThree} />
        </SectionSkeleton>
        <SectionSkeleton>
          <StatsSkeleton count={2} className={styles.statsTwo} />
        </SectionSkeleton>
      </div>
    </SkeletonStatus>
  );
}
