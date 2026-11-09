"use client";

import CharCounter from "@/app/components/CharCounter/CharCounter";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";

import styles from "../broadcast.module.css";

/**
 * Por baixo do texto, dentro do balão (#187): os ficheiros da mensagem
 * ("2 / 5") e os caracteres como a pessoa os vê ("1.234 / 1.500").
 *
 * Os ficheiros só aparecem quando há pelo menos um (um "0 / 5" permanente
 * seria ruído; o "+" já avisa no limite). Sem `charLimit` (perguntas, que têm
 * o seu limite de 1.024, ou plano sem limite) não mostra os caracteres.
 */
export default function MessageLimitsRow({ limits, translation }) {
  if (!limits) return null;

  const { length, charLimit, files, filesLimit } = limits;

  return (
    <div className={styles.messageLimitsRow}>
      {files > 0 ? (
        <UsageCounter
          used={files}
          limit={filesLimit}
          label={translation("Plans.usage.messageFilesLabel")}
          hint={translation("Plans.usage.messageFilesHint")}
        />
      ) : null}
      <CharCounter length={length} limit={charLimit} />
    </div>
  );
}
