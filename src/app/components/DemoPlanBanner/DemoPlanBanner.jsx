"use client";

import { useTranslations } from "next-intl";

import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import { Link } from "@/i18n/navigation";
import { demoStatus } from "@/lib/plans/demoStatus";

import styles from "./DemoPlanBanner.module.css";

/*
 * A Demo de 7 dias (#209): uma faixa diz sempre quantos dias faltam; fica
 * laranja quando faltam 2 dias ou menos e vermelha quando a Demo terminou.
 * Nos planos sem prazo não aparece nada.
 */
export default function DemoPlanBanner() {
  const translation = useTranslations("Plans.demo");
  const { user } = useAuth();
  const { org } = useOrganization(user);
  const { plan, expiresAt, expired } = usePlanLimits(org?.id);

  const status = demoStatus({ expiresAt, expired });
  if (!status) return null;

  const planName = plan?.name ?? "Demo";

  const text =
    status.stage === "ended"
      ? translation("ended")
      : status.stage === "warning"
        ? translation("endingSoon", { plan: planName, days: status.daysLeft })
        : translation("daysLeft", { plan: planName, days: status.daysLeft });

  return (
    <div
      className={`${styles.banner} ${styles[status.stage]}`}
      role={status.stage === "active" ? "status" : "alert"}
    >
      <span>{text}</span>
      <Link href="/pricing" className={styles.button}>
        {translation("activate")}
      </Link>
    </div>
  );
}
