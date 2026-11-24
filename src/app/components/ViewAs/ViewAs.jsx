"use client";

import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import usePermissions from "@/app/PermissionsContext";

import bannerStyles from "../AdminPlanBanner/AdminPlanBanner.module.css";
import styles from "./ViewAs.module.css";

/* Erros da troca: o mesmo aviso do resto da app. */
function useChoose() {
  const translation = useTranslations();
  const showAlert = useAlert();
  const { chooseViewAs } = usePermissions();

  return async (typeKey) => {
    try {
      await chooseViewAs(typeKey);
    } catch (error) {
      await showAlert({
        title: translation("Common.error"),
        message: error.message,
        tone: "danger",
      });
    }
  };
}

/*
 * Seletor «Ver como» na barra de topo (#247), só para Administradores, como
 * o «Experimentar como» dos planos. Mostra a app com as permissões do Editor
 * ou do Leitor; não muda nada na base de dados.
 */
export function ViewAsSwitch() {
  const translation = useTranslations("ViewAs");
  const { canSwitch, viewAs, viewAsTypes, busy } = usePermissions();
  const onChoose = useChoose();

  if (!canSwitch) return null;

  return (
    <label className={styles.switch}>
      <span>{translation("label")}</span>
      <select
        className={styles.select}
        value={viewAs ?? ""}
        disabled={busy}
        onChange={(event) => onChoose(event.target.value)}
        data-testid="view-as-select"
      >
        <option value="">{translation("types.admin")}</option>
        {viewAsTypes.map((key) => (
          <option key={key} value={key}>
            {translation(`types.${key}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/* Faixa «Estás a ver a app como Leitor» com «Voltar a Administrador». */
export function ViewAsBanner() {
  const translation = useTranslations("ViewAs");
  const { canSwitch, viewAs, busy } = usePermissions();
  const onChoose = useChoose();

  if (!canSwitch || !viewAs) return null;

  return (
    <div className={bannerStyles.banner} role="status" data-testid="view-as-banner">
      <span>
        {translation("banner", { type: translation(`types.${viewAs}`) })}
      </span>
      <button
        type="button"
        className={bannerStyles.button}
        onClick={() => onChoose(null)}
        disabled={busy}
      >
        {translation("back")}
      </button>
    </div>
  );
}
