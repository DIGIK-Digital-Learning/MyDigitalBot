"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import usePlatformAdmin from "@/app/hooks/usePlatformAdmin";
import {
  announceAdminPlanChanged,
  changeOrganizationPlan,
  fetchAdminOverview,
} from "@/lib/admin/admin.api";

import styles from "./AdminPlanBanner.module.css";

/*
 * Para a equipa DIGIK (#208): enquanto a organização está a "experimentar
 * como" outro plano, uma faixa lembra-o e deixa voltar ao Interno.
 */
export default function AdminPlanBanner() {
  const translation = useTranslations();
  const { isAdmin, trying, plan, orgId } = usePlatformAdmin();
  const [busy, setBusy] = useState(false);

  if (!isAdmin || !trying) return null;

  async function backToInternal() {
    setBusy(true);
    try {
      const { internalPlanId } = await fetchAdminOverview();
      if (internalPlanId) {
        await changeOrganizationPlan(orgId, internalPlanId);
        announceAdminPlanChanged();
        window.location.reload();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.banner} role="status">
      <span>
        {translation("Admin.banner.trying", { plan: plan?.name ?? "" })}
      </span>
      <button
        type="button"
        className={styles.button}
        onClick={backToInternal}
        disabled={busy}
      >
        {translation("Admin.banner.back")}
      </button>
    </div>
  );
}
