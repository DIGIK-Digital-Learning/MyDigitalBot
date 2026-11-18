import {
  Skeleton,
  SkeletonStatus,
  SkeletonText,
} from "@/app/components/Skeleton/Skeleton";
import styles from "./broadcast.module.css";

/**
 * O Enviar mensagem a carregar (loading.jsx): os canais em cima, a mensagem
 * à esquerda e os destinatários à direita.
 */
export default function BroadcastSkeleton() {
  return (
    <SkeletonStatus className={styles.screen}>
      <div className={styles.headerRow}>
        <Skeleton width={120} height={38} radius={999} />
        <Skeleton width={120} height={38} radius={999} />
      </div>

      <div className={styles.columns}>
        <div className={styles.leftCol}>
          <div className={`${styles.panel} ${styles.skeletonPanel}`}>
            <Skeleton width="30%" height={16} />
            <Skeleton height={260} radius={12} />
            <Skeleton width={140} height={38} radius={12} />
          </div>
        </div>

        <div className={styles.rightCol}>
          <div className={`${styles.panel} ${styles.skeletonPanel}`}>
            <Skeleton height={40} radius={12} />
            <div className={styles.listBox}>
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
            </div>
          </div>
        </div>
      </div>
    </SkeletonStatus>
  );
}
