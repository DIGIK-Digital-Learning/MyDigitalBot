"use client";

import WhatsAppPhone, {
  WhatsAppBubble,
} from "@/app/components/WhatsAppPhone/WhatsAppPhone";

import styles from "../broadcast.module.css";
import { BubbleImages, FileBubbles } from "./ComposerAttachments";
import { ImageSuggestBubble } from "./ImageSuggestInPhone";
import MessageLimitsRow from "./MessageLimitsRow";
import LinkButtonPreview, {
  LinkBubblesPreview,
  LinksInTextNote,
} from "./LinkButtonPreview";
import { PlusMenuBar } from "./PlusMenu";
import { SuggestBubble } from "./SuggestInPhone";
import TokenTextEditor from "./TokenTextEditor";

/**
 * O telemóvel é o próprio editor: escreve-se dentro do balão, as imagens
 * aparecem no topo do balão e os ficheiros por baixo, como no WhatsApp.
 * O "+" da barra inferior junta imagens, links e variáveis.
 */
export default function PhoneComposer({
  channel,
  contactName,
  message,
  onMessageChange,
  tools,
  previewTime,
  translation,
}) {
  return (
    <div className={styles.phoneWrap}>
      <WhatsAppPhone
        contactName={contactName}
        variant={channel === "teams" ? "teams" : "whatsapp"}
        footer={<PlusMenuBar tools={tools} translation={translation} />}
      >
        <WhatsAppBubble time={previewTime}>
          <BubbleImages
            imageFiles={tools.imageFiles}
            onRemoveFile={tools.onRemoveFile}
            translation={translation}
          />

          {tools.imageSuggest?.showsInBubble && (
            <ImageSuggestBubble
              suggest={tools.imageSuggest}
              translation={translation}
            />
          )}

          {tools.suggest?.showsInBubble && (
            <SuggestBubble suggest={tools.suggest} translation={translation} />
          )}

          {/* O editor fica montado: a proposta aceite entra por ele. */}
          <div hidden={Boolean(tools.suggest?.showsInBubble)}>
            <TokenTextEditor
              ref={tools.editorRef}
              value={message}
              onChange={onMessageChange}
              tokenLabel={tools.tokenLabel}
              placeholder={translation("Broadcast.composer.placeholder")}
              ariaLabel={translation("Broadcast.message")}
            />
          </div>

          {/* Ficheiros e caracteres da mensagem dentro do plano (#187). */}
          <MessageLimitsRow
            limits={tools.messageLimits}
            translation={translation}
          />
        </WhatsAppBubble>

        <LinkButtonPreview
          linkButton={tools.linkPreview?.button}
          onRemove={tools.onRemoveLink}
          translation={translation}
        />

        <LinksInTextNote
          labels={tools.linkPreview?.inTextLabels}
          translation={translation}
        />

        <FileBubbles
          videoFiles={tools.videoFiles}
          otherFiles={tools.otherFiles}
          onRemoveFile={tools.onRemoveFile}
          onPickThumbnail={tools.onPickThumbnail}
          onRemoveThumbnail={tools.onRemoveThumbnail}
          translation={translation}
        />

        <LinkBubblesPreview
          bubbles={tools.linkPreview?.bubbles}
          time={previewTime}
          onRemove={tools.onRemoveLink}
          translation={translation}
        />
      </WhatsAppPhone>
    </div>
  );
}
