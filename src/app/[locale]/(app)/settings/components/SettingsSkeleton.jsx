import {
  Skeleton,
  SkeletonRows,
  SkeletonStatus,
} from "@/app/components/Skeleton/Skeleton";
import styles from "../settings.module.css";

function SectionHeadingSkeleton() {
  return (
    <div className={`${styles.sectionHeading} ${styles.skeletonStack}`}>
      <Skeleton width="28%" height={18} />
      <Skeleton width="52%" />
    </div>
  );
}

function FormSectionSkeleton({ fields }) {
  return (
    <section className={styles.section}>
      <SectionHeadingSkeleton />
      <div className={styles.formGrid}>
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className={styles.field}>
            <Skeleton width="35%" height={10} />
            <Skeleton height={42} radius={12} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Uma página das Definições a carregar (`section`: organization,
 * integrations ou activity), com o título e as secções da página.
 */
export default function SettingsSkeleton({ section = "organization" }) {
  return (
    <main className={styles.page}>
      <SkeletonStatus className={styles.skeletonStack}>
        <div className={`${styles.header} ${styles.skeletonStack}`}>
          <Skeleton width={220} height={32} radius={8} />
          <Skeleton width={340} />
        </div>

        {section === "activity" ? (
          <section className={styles.section}>
            <SectionHeadingSkeleton />
            <div className={styles.tableCard}>
              <SkeletonRows rows={8} columns={5} />
            </div>
          </section>
        ) : (
          <>
            <FormSectionSkeleton fields={section === "integrations" ? 3 : 2} />
            <FormSectionSkeleton fields={4} />
          </>
        )}
      </SkeletonStatus>
    </main>
  );
}
