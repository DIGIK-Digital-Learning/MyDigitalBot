"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  FileText,
  FileVideo,
  Image as ImageIcon,
  ImagePlus,
  Link2,
  Plus,
  Sparkles,
  User,
} from "lucide-react";

import { BROADCAST_MEDIA_ACCEPT } from "@/lib/uploads/broadcastMedia";

import styles from "../broadcast.module.css";
import EmojiButton from "./EmojiButton";
import FormatToolbar from "./FormatToolbar";
import { ImageSuggestBar } from "./ImageSuggestInPhone";
import { SuggestBar } from "./SuggestInPhone";

/* Cada tipo abre a escolha entre o computador e a multimédia. */
const FILE_KINDS = [
  { kind: "image", Icon: ImageIcon, labelKey: "Broadcast.composer.addImage" },
  { kind: "video", Icon: FileVideo, labelKey: "Broadcast.composer.addVideo" },
  {
    kind: "document",
    Icon: FileText,
    labelKey: "Broadcast.composer.addDocument",
  },
];

const VARIABLE_ICONS = {
  name: User,
  company: Building2,
  link: Link2,
};

/**
 * O "+" da barra inferior do telemóvel: junta imagens, vídeos, documentos,
 * links rastreados, sugestão de texto e imagem com IA, e variáveis. É o
 * mesmo em todos os tipos de mensagem.
 */
export default function PlusMenu({
  onAddFile,
  onPickFromMedia,
  onAddLink,
  onSuggestText,
  onCreateImage,
  variables = [],
  onInsertToken,
  translation,
  /*
   * Ficheiros por mensagem no limite (#187): os tipos de ficheiro e o
   * "Criar imagem" ficam desativados, com a explicação ao passar o rato.
   */
  filesFull = false,
  filesFullHint = undefined,
}) {
  const [open, setOpen] = useState(false);
  const [expandedKind, setExpandedKind] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setExpandedKind(null);
      return;
    }

    function onDoc(e) {
      if (wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    }

    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(action) {
    setOpen(false);
    action();
  }

  return (
    <div className={styles.plusWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.plusBtn}
        aria-label={translation("Broadcast.composer.add")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={18} />
      </button>

      {open && (
        <div className={styles.plusMenu} role="menu">
          {FILE_KINDS.map(({ kind, Icon, labelKey }) => {
            const isExpanded = expandedKind === kind;

            /* Sem galeria disponível, vai direto ao computador. */
            if (!onPickFromMedia) {
              return (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  className={styles.plusItem}
                  disabled={filesFull}
                  title={filesFull ? filesFullHint : undefined}
                  onClick={() =>
                    pick(() => onAddFile(BROADCAST_MEDIA_ACCEPT[kind]))
                  }
                >
                  <Icon size={16} />
                  <span>{translation(labelKey)}</span>
                </button>
              );
            }

            return (
              <div key={kind} className={styles.plusGroup}>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.plusItem}
                  aria-expanded={isExpanded}
                  disabled={filesFull}
                  title={filesFull ? filesFullHint : undefined}
                  onClick={() =>
                    setExpandedKind((prev) => (prev === kind ? null : kind))
                  }
                >
                  <Icon size={16} />
                  <span>{translation(labelKey)}</span>
                  <ChevronDown
                    size={14}
                    className={`${styles.plusChevron} ${
                      isExpanded ? styles.plusChevronOpen : ""
                    }`}
                    aria-hidden
                  />
                </button>

                {isExpanded && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.plusItem} ${styles.plusSubItem}`}
                      onClick={() =>
                        pick(() => onAddFile(BROADCAST_MEDIA_ACCEPT[kind]))
                      }
                    >
                      {translation("Broadcast.mediaPicker.fromComputer")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.plusItem} ${styles.plusSubItem}`}
                      onClick={() => pick(() => onPickFromMedia(kind))}
                    >
                      {translation("Broadcast.mediaPicker.fromMedia")}
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {onAddLink && (
            <button
              type="button"
              role="menuitem"
              className={styles.plusItem}
              onClick={() => pick(onAddLink)}
            >
              <Link2 size={16} />
              <span>{translation("Broadcast.composer.addLink")}</span>
            </button>
          )}

          {onSuggestText && (
            <button
              type="button"
              role="menuitem"
              className={styles.plusItem}
              onClick={() => pick(onSuggestText)}
            >
              <Sparkles size={16} />
              <span>{translation("Broadcast.suggest.title")}</span>
            </button>
          )}

          {onCreateImage && (
            <button
              type="button"
              role="menuitem"
              className={styles.plusItem}
              disabled={filesFull}
              title={filesFull ? filesFullHint : undefined}
              onClick={() => pick(onCreateImage)}
            >
              <ImagePlus size={16} />
              <span>{translation("Broadcast.image.title")}</span>
            </button>
          )}

          {variables.length > 0 && (
            <div className={styles.plusLabel}>
              {translation("Broadcast.composer.variables")}
            </div>
          )}

          {variables.map((v) => {
            const Icon = VARIABLE_ICONS[v.kind] || User;

            return (
              <button
                key={v.key}
                type="button"
                role="menuitem"
                className={styles.plusItem}
                onClick={() => pick(() => onInsertToken(v.key))}
              >
                <Icon size={16} />
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Barra inferior do telemóvel com o "+", os emojis e os botões de
 * formatação.
 */
export function PlusMenuBar({ tools, translation }) {
  if (!tools) return null;

  if (tools.suggest?.active) {
    return <SuggestBar suggest={tools.suggest} translation={translation} />;
  }

  if (tools.imageSuggest?.active) {
    return (
      <ImageSuggestBar suggest={tools.imageSuggest} translation={translation} />
    );
  }

  return (
    <>
      <PlusMenu
        onAddFile={tools.onAddFile}
        onPickFromMedia={tools.onPickFromMedia}
        onAddLink={tools.onAddLink}
        onSuggestText={tools.suggest?.open}
        onCreateImage={tools.imageSuggest?.open}
        variables={tools.variables}
        onInsertToken={tools.onInsertToken}
        translation={translation}
        filesFull={Boolean(tools.messageLimits?.filesFull)}
        filesFullHint={tools.messageLimits?.filesFullHint}
      />
      <EmojiButton editorRef={tools.editorRef} translation={translation} />
      <FormatToolbar editorRef={tools.editorRef} translation={translation} />
    </>
  );
}
