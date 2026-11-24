import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import { LINK_BUTTON_BODY_MAX_LENGTH } from "@/lib/whatsapp/linkButton";

import styles from "../../broadcast.module.css";
import { MAX_TRACKED_LINKS } from "../../lib/constants";
import {
  filterTrackedLinkLibrary,
  isSameTrackedLink,
} from "../../lib/helpers";
import usePermissions from "@/app/PermissionsContext";
import { PERMISSIONS } from "@/lib/auth/permissions";

/*
 * Links já usados noutros envios, para escolher em vez de escrever outra
 * vez. Sem nenhum link usado, a secção não aparece.
 */
function LinkLibrary({
  library,
  trackedLinks,
  full,
  onUse,
  onDelete,
  translation,
}) {
  const [query, setQuery] = useState("");
  const { can, lock } = usePermissions();
  const items = library?.items || [];

  if (!library || (!library.loading && !library.failed && !items.length)) {
    return null;
  }

  const visible = filterTrackedLinkLibrary(items, query);

  return (
    <div className={styles.linkLibrary}>
      <div className={styles.smallLabel}>
        {translation("Broadcast.linkLibrary.title")}
      </div>

      {library.loading && !items.length && (
        <div className={styles.emptyMini}>
          {translation("Broadcast.linkLibrary.loading")}
        </div>
      )}

      {library.failed && (
        <div className={styles.linkLibraryFailed}>
          <span className={styles.helpDanger}>
            {translation("Broadcast.linkLibrary.failed")}
          </span>
          <button
            type="button"
            onClick={library.reload}
            className={styles.kbdBtn}
          >
            {translation("Broadcast.linkLibrary.retry")}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={translation("Broadcast.linkLibrary.search")}
            className={styles.input}
          />

          <ul className={styles.linkLibraryList}>
            {visible.map((item) => {
              const added = trackedLinks.some((link) =>
                isSameTrackedLink(link, item),
              );

              return (
                <li
                  key={`${item.label}\n${item.destinationUrl}`}
                  className={styles.linkLibraryItem}
                >
                  <div className={styles.linkLibraryText}>
                    <strong>{item.label}</strong>
                    <span
                      className={styles.linkLibraryUrl}
                      title={item.destinationUrl}
                    >
                      {item.destinationUrl}
                    </span>
                    {item.lastUsedAt && (
                      <span className={styles.trackedPlaceholder}>
                        {translation("Broadcast.linkLibrary.lastUsed", {
                          date: new Date(item.lastUsedAt),
                        })}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={added || full}
                    onClick={() => onUse(item)}
                    className={styles.kbdBtn}
                  >
                    {translation(
                      added
                        ? "Broadcast.linkLibrary.added"
                        : "Broadcast.linkLibrary.use",
                    )}
                  </button>

                  {/* Eliminar liberta espaço nos links do plano (#189). */}
                  {onDelete && item.id ? (
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      className={styles.kbdBtn}
                      aria-label={translation("Broadcast.linkLibrary.delete", {
                        label: item.label,
                      })}
                      title={translation("Broadcast.linkLibrary.delete", {
                        label: item.label,
                      })}
                      disabled={!can(PERMISSIONS.LINKS_CREATE)}
                      {...lock(PERMISSIONS.LINKS_CREATE)}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {!visible.length && (
            <div className={styles.emptyMini}>
              {translation("Broadcast.linkLibrary.noMatches")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TrackedLinksPanel({
  trackedLinks,
  trackedLinksValid,
  addTrackedLink,
  updateTrackedLink,
  removeTrackedLink,
  library = null,
  onUseLibraryLink,
  onDeleteLibraryLink = null,
  savedLinks = null,
  bubbleLinkIds = [],
  onDraftChange = null,
  translation,
}) {
  /* Um só link por mensagem: para trocar, tira-se o atual. */
  const full = trackedLinks.length >= MAX_TRACKED_LINKS;

  /*
   * Links guardados da organização (#189): no limite, não se cria nenhum
   * novo; reutilizar um da lista continua a poder.
   */
  const savedFull =
    savedLinks?.limit != null &&
    savedLinks?.used != null &&
    savedLinks.used >= savedLinks.limit;

  /*
   * #286: o link novo escreve-se num formulário de 2 campos, como o «Criar
   * link» da página Links rastreados. O nome curto e a marca no texto são
   * criados ao carregar em «Adicionar».
   */
  const [draft, setDraft] = useState(null);
  const draftLabel = draft?.label.trim() || "";
  const draftUrl = draft?.destinationUrl.trim() || "";
  const draftUrlInvalid = Boolean(draftUrl) && !/^https?:\/\//i.test(draftUrl);
  const canAddDraft = Boolean(draftLabel && draftUrl) && !draftUrlInvalid;

  /*
   * O nome que se está a escrever aparece logo no telemóvel (botão no
   * WhatsApp, fim do texto no Teams). Ao fechar o painel, o rascunho sai.
   */
  useEffect(() => {
    onDraftChange?.(draftLabel || null);
  }, [draftLabel, onDraftChange]);

  useEffect(() => () => onDraftChange?.(null), [onDraftChange]);

  function submitDraft(event) {
    event.preventDefault();
    if (!canAddDraft) return;
    addTrackedLink({ label: draftLabel, destinationUrl: draftUrl });
    setDraft(null);
  }

  return (
    <div className={styles.toolPanelCard}>
      <div className={styles.modalSectionHeader}>
        <div className={styles.panelTitle}>
          {translation("Broadcast.trackedLinks")}
        </div>

        <div className={styles.trackedLinksHeadActions}>
          {savedLinks ? (
            <UsageCounter
              used={savedLinks.used}
              limit={savedLinks.limit}
              label={translation("Plans.usage.trackedLinksLabel")}
              hint={translation("Plans.usage.trackedLinksHint")}
            />
          ) : null}

          <button
            type="button"
            onClick={() => setDraft({ label: "", destinationUrl: "" })}
            disabled={full || savedFull || Boolean(draft)}
            className={styles.kbdBtn}
          >
            <Plus size={14} />
            <span>{translation("Broadcast.addLink")}</span>
          </button>
        </div>
      </div>

      {savedFull && (
        <div className={styles.helpDanger}>
          {translation("Plans.limits.trackedLinksFull", {
            limit: savedLinks.limit,
          })}
        </div>
      )}

      {/*
        #286: a frase «Escreve {{link.…}} na mensagem» saiu: a marca entra
        sozinha no texto ao adicionar o link.
      */}
      {draft && (
        <form
          className={styles.trackedLinkCard}
          onSubmit={submitDraft}
          data-testid="new-link-form"
          aria-labelledby="new-link-title"
        >
          {/* O mesmo título da janela «Criar link» da página Links. */}
          <strong id="new-link-title">
            {translation("TrackedLinks.create.title")}
          </strong>

          <div className={styles.fieldWide}>
            <label className={styles.smallLabel} htmlFor="new-link-label">
              {translation("Broadcast.label")}
            </label>
            <input
              id="new-link-label"
              autoFocus
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder={translation(
                "Broadcast.trackedLinkForm.labelPlaceholder",
              )}
              className={styles.input}
            />
          </div>

          <div className={styles.fieldWide}>
            <label className={styles.smallLabel} htmlFor="new-link-url">
              {translation("Broadcast.destinationUrl")}
            </label>
            <input
              id="new-link-url"
              type="url"
              value={draft.destinationUrl}
              onChange={(e) =>
                setDraft({ ...draft, destinationUrl: e.target.value })
              }
              placeholder={translation(
                "Broadcast.trackedLinkForm.urlPlaceholder",
              )}
              className={styles.input}
            />
            {draftUrlInvalid ? (
              <p className={styles.helpDanger}>
                {translation("Broadcast.destinationUrlInvalid")}
              </p>
            ) : (
              <p className={styles.modalHelpText}>
                {translation("TrackedLinks.create.urlHelp")}
              </p>
            )}
          </div>

          <div className={styles.newLinkActions}>
            <button
              type="button"
              className={styles.kbdBtn}
              onClick={() => setDraft(null)}
            >
              {translation("Common.cancel")}
            </button>
            <button
              type="submit"
              className={styles.kbdBtn}
              disabled={!canAddDraft}
            >
              {translation("Common.add")}
            </button>
          </div>
        </form>
      )}

      {full && (
        <div className={styles.modalHelpText}>
          {translation("Broadcast.linkLimitHint")}
        </div>
      )}

      <LinkLibrary
        library={library}
        trackedLinks={trackedLinks}
        full={full}
        onUse={onUseLibraryLink}
        onDelete={onDeleteLibraryLink}
        translation={translation}
      />

      <div className={styles.trackedLinksGrid}>
        {trackedLinks.map((link, index) => (
          <div key={link.id} className={styles.trackedLinkCard}>
            <div className={styles.trackedLinkCardHeader}>
              <strong>
                Link {index + 1}
                {link.button && (
                  <span className={styles.linkButtonTag}>
                    {translation(
                      bubbleLinkIds.includes(link.id)
                        ? "Broadcast.linkBubbleTag"
                        : "Broadcast.linkButtonTag",
                    )}
                  </span>
                )}
              </strong>

              <button
                type="button"
                onClick={() => removeTrackedLink(link.id)}
                className={styles.kbdBtn}
              >
                <Trash2 size={14} />
                <span>{translation("Broadcast.remove")}</span>
              </button>
            </div>

            <div className={styles.fieldWide}>
              <label className={styles.smallLabel}>
                {translation("Broadcast.label")}
              </label>
              <input
                value={link.label}
                onChange={(e) =>
                  updateTrackedLink(link.id, "label", e.target.value)
                }
                placeholder={translation("Broadcast.trackedLinkForm.labelPlaceholder")}
                className={styles.input}
              />
            </div>

            {/* Um link além do primeiro segue num balão à parte, com texto. */}
            {bubbleLinkIds.includes(link.id) && (
              <div className={styles.fieldWide}>
                <label className={styles.smallLabel}>
                  {translation("Broadcast.linkBubbleText")}
                </label>
                <input
                  value={link.buttonMessage || ""}
                  onChange={(e) =>
                    updateTrackedLink(link.id, "buttonMessage", e.target.value)
                  }
                  aria-label={translation("Broadcast.linkBubbleText")}
                  placeholder={link.label || ""}
                  maxLength={LINK_BUTTON_BODY_MAX_LENGTH}
                  className={styles.input}
                />
              </div>
            )}

            <div className={styles.fieldWide}>
              <label className={styles.smallLabel}>
                {translation("Broadcast.destinationUrl")}
              </label>
              <input
                value={link.destinationUrl}
                type="url"
                onChange={(e) =>
                  updateTrackedLink(link.id, "destinationUrl", e.target.value)
                }
                placeholder={translation("Broadcast.trackedLinkForm.urlPlaceholder")}
                className={styles.input}
              />
              {link.destinationUrl.trim() && !/^https?:\/\//i.test(link.destinationUrl.trim()) && (
                <p className={styles.helpDanger}>
                  {translation("Broadcast.destinationUrlInvalid")}
                </p>
              )}
            </div>
          </div>
        ))}

        {trackedLinks.length === 0 && !draft && (
          <div className={styles.emptyMini}>
            {translation("Broadcast.trackedLinkForm.empty")}
          </div>
        )}

        {!trackedLinksValid && trackedLinks.length > 0 && (
          <div className={styles.helpDanger}>
            {translation("Broadcast.trackedLinkForm.invalid")}
          </div>
        )}
      </div>

    </div>
  );
}
