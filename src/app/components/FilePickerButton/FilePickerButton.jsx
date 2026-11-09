"use client";

import { useTranslations } from "next-intl";

import styles from "./FilePickerButton.module.css";

/**
 * Escolher ficheiros com o texto na língua da app.
 *
 * O botão nativo do <input type="file"> ("Escolher ficheiros / Nenhum
 * ficheiro selecionado") é desenhado pelo browser, na língua do browser, e
 * não muda com o PT/EN da app. Por isso o input fica escondido dentro de um
 * <label> com o nosso texto: clicar no label abre a mesma janela do sistema.
 *
 * `showStatus={false}` quando o ecrã já diz noutro sítio o que foi escolhido.
 */
export default function FilePickerButton({
  id,
  accept,
  multiple = false,
  disabled = false,
  files = [],
  showStatus = true,
  onChange,
}) {
  const translation = useTranslations("Common.filePicker");

  let status = translation("noFileChosen");
  if (files.length === 1) status = files[0].name;
  if (files.length > 1) {
    status = translation("filesChosen", { count: files.length });
  }

  return (
    <div className={styles.filePicker}>
      <label
        className={`${styles.button} ${disabled ? styles.disabled : ""}`}
      >
        <input
          id={id}
          className={styles.input}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={onChange}
        />
        {translation(multiple ? "chooseFiles" : "chooseFile")}
      </label>
      {showStatus && (
        <span className={styles.status} aria-live="polite">
          {status}
        </span>
      )}
    </div>
  );
}
