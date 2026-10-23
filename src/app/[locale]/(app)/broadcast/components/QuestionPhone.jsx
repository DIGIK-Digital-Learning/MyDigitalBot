"use client";

import WhatsAppPhone, {
  WhatsAppBubble,
} from "@/app/components/WhatsAppPhone/WhatsAppPhone";

import styles from "../broadcast.module.css";
import { BubbleImages, FileBubbles } from "./ComposerAttachments";
import { ImageSuggestBubble } from "./ImageSuggestInPhone";
import MessageLimitsRow from "./MessageLimitsRow";
import LinkButtonPreview, { LinkBubblesPreview } from "./LinkButtonPreview";
import { PlusMenuBar } from "./PlusMenu";
import { SuggestBubble } from "./SuggestInPhone";
import TokenTextEditor from "./TokenTextEditor";

const NO_TOKENS = () => null;

/**
 * Telemóvel de uma pergunta (quiz, sondagem ou pergunta aberta). O corpo
 * escreve-se no balão com pastilhas para variáveis e links; as imagens
 * ficam no topo do mesmo balão, porque seguem na mesma mensagem que o
 * texto e os botões. Os filhos são as linhas por baixo do balão (as
 * opções). `tools` traz o "+" e os anexos do composer.
 */
export default function QuestionPhone({
  contactName,
  previewTime,
  body,
  onBodyChange,
  bodyLabel,
  bodyPlaceholder,
  tools = null,
  translation,
  variant = "whatsapp",
  children,
}) {
  return (
    <div className={styles.phoneWrap}>
      <WhatsAppPhone
        contactName={contactName}
        variant={variant}
        footer={<PlusMenuBar tools={tools} translation={translation} />}
      >
        {tools && (
          <FileBubbles
            videoFiles={tools.videoFiles}
            otherFiles={tools.otherFiles}
            onRemoveFile={tools.onRemoveFile}
            onPickThumbnail={tools.onPickThumbnail}
            onRemoveThumbnail={tools.onRemoveThumbnail}
            translation={translation}
          />
        )}

        <WhatsAppBubble time={previewTime}>
          {tools && (
            <BubbleImages
              imageFiles={tools.imageFiles}
              onRemoveFile={tools.onRemoveFile}
              translation={translation}
            />
          )}

          {tools?.imageSuggest?.showsInBubble && (
            <ImageSuggestBubble
              suggest={tools.imageSuggest}
              translation={translation}
            />
          )}

          {tools?.suggest?.showsInBubble && (
            <SuggestBubble suggest={tools.suggest} translation={translation} />
          )}

          {/* O editor fica montado: a proposta aceite entra por ele. */}
          <div hidden={Boolean(tools?.suggest?.showsInBubble)}>
            <TokenTextEditor
              ref={tools?.editorRef}
              value={body}
              onChange={onBodyChange}
              tokenLabel={tools?.tokenLabel || NO_TOKENS}
              placeholder={bodyPlaceholder}
              ariaLabel={bodyLabel}
            />
          </div>

          {/*
            Ficheiros da pergunta dentro do plano (#187). Os caracteres não:
            o enunciado tem o seu limite (1.024).
          */}
          {tools?.messageLimits ? (
            <MessageLimitsRow
              limits={{ ...tools.messageLimits, charLimit: null }}
              translation={translation}
            />
          ) : null}
        </WhatsAppBubble>

        {/* Botão só na pergunta aberta: quiz e sondagem têm as opções. */}
        <LinkButtonPreview
          linkButton={tools?.linkPreview?.button}
          onRemove={tools?.onRemoveLink}
          translation={translation}
        />

        {children}

        <LinkBubblesPreview
          bubbles={tools?.linkPreview?.bubbles}
          time={previewTime}
          onRemove={tools?.onRemoveLink}
          translation={translation}
        />
      </WhatsAppPhone>
    </div>
  );
}
