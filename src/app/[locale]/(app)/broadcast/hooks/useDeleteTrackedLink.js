"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";

import { deleteTrackedLinkFromLibrary } from "../lib/broadcast.api";

/**
 * Eliminar um link guardado (#189), igual no composer e na página dos links:
 * pede confirmação, avisa quando o link ainda está numa agendada ou numa
 * corrente, e chama `onDeleted` quando sai da lista.
 */
export default function useDeleteTrackedLink(orgId, { onDeleted } = {}) {
  const translation = useTranslations();
  const showAlert = useAlert();
  const confirm = useConfirm();

  return useCallback(
    async (item) => {
      const confirmed = await confirm({
        title: translation("Broadcast.linkLibrary.deleteConfirm.title"),
        message: translation("Broadcast.linkLibrary.deleteConfirm.message", {
          label: item.label,
        }),
        confirmText: translation("Broadcast.linkLibrary.deleteConfirm.confirm"),
        cancelText: translation("Broadcast.confirmSend.cancel"),
      });
      if (!confirmed) return false;

      try {
        const data = await deleteTrackedLinkFromLibrary(orgId, item.id);

        if (data?.code === "TRACKED_LINK_IN_USE") {
          await showAlert({
            title: translation("Broadcast.linkLibrary.inUseTitle"),
            message: translation(
              data.reason === "chain"
                ? "Broadcast.linkLibrary.inUseChain"
                : "Broadcast.linkLibrary.inUseScheduled",
            ),
            tone: "warning",
          });
          return false;
        }

        onDeleted?.(item);
        return true;
      } catch (err) {
        await showAlert({
          title: translation("Common.error"),
          message: err.message,
          tone: "danger",
        });
        return false;
      }
    },
    [confirm, onDeleted, orgId, showAlert, translation],
  );
}
