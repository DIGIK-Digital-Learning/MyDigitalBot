"use client";

import { useLocale, useTranslations } from "next-intl";

import WhatsAppPhone, {
  WhatsAppBubble,
  WhatsAppButton,
} from "@/app/components/WhatsAppPhone/WhatsAppPhone";
import {
  openingTemplatePreviewFor,
  renderOpeningTemplatePreview,
} from "@/lib/whatsapp/openingTemplate";

import styles from "../settings.module.css";

/**
 * Pré-visualização fixa do template DigikBot, com valores de exemplo, na
 * língua escolhida no site, que é aquela em que o bot começa a falar (#241).
 */
export default function OpeningMessageSettings({ orgName }) {
  const translation = useTranslations("OpeningMessage");
  const locale = useLocale();
  const sampleName = translation("sampleName");
  const companyName = orgName || translation("sampleCompany");
  const message = renderOpeningTemplatePreview({
    name: sampleName,
    orgName: companyName,
    locale,
  });

  return (
    <div className={styles.opening}>
      <WhatsAppPhone contactName={sampleName}>
        <WhatsAppBubble>{message}</WhatsAppBubble>
        <WhatsAppButton>{openingTemplatePreviewFor(locale).button}</WhatsAppButton>
      </WhatsAppPhone>

      <div className={styles.openingDetails}>
        <h3 className={styles.openingPreviewTitle}>
          {translation("previewTitle")}
        </h3>
        <p className={styles.openingNotice}>{translation("fixedNotice")}</p>
        <dl className={styles.openingVariables}>
          <div>
            <dt>{translation("recipientName")}</dt>
            <dd>{sampleName}</dd>
          </div>
          <div>
            <dt>{translation("organizationName")}</dt>
            <dd>{companyName}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
