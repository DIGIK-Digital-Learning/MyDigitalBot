"use client";

import { useTranslations } from "next-intl";

import styles from "./assistants.module.css";

/**
 * Escolher ficheiros com o texto na língua da app.
 *
 * O botão nativo do <input type="file"> ("Escolher ficheiros / Nenhum
 * ficheiro selecionado") é desenhado pelo browser, na língua do browser, e
 * não muda com o PT/EN da app. Por isso o input fica escondido dentro de um
 * <label> com o nosso texto: clicar no label abre a mesma janela do sistema.
 */
export default function FilePickerButton({
  id,
  accept,
  files = [],
  onChange,
}) {
  const translation = useTranslations("Assistants.vector");

  let status = translation("noFileChosen");
  if (files.length === 1) status = files[0].name;
  if (files.length > 1) {
    status = translation("filesChosen", { count: files.length });
  }

  return (
    <div className={styles.filePicker}>
      <label className={styles.filePickerButton}>
        <input
          id={id}
          className={styles.filePickerInput}
          type="file"
          accept={accept}
          multiple
          onChange={onChange}
        />
        {translation("pickFiles")}
      </label>
      <span className={styles.filePickerStatus} aria-live="polite">
        {status}
      </span>
    </div>
  );
}
