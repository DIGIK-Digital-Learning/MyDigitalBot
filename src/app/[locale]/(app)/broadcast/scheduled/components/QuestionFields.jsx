"use client";

import { Plus, Trash2 } from "lucide-react";

import styles from "../scheduled.module.css";
import {
  QUESTION_BODY_MAX_LENGTH,
  QUESTION_FEEDBACK_MAX_LENGTH,
  QUIZ_MAX_OPTIONS,
  QUIZ_MIN_OPTIONS,
  QUIZ_OPTION_MAX_LENGTH,
  makeQuizOption,
} from "@/lib/whatsapp/question";

/**
 * Campos de edição de uma pergunta agendada (quiz, sondagem ou aberta).
 * Controlado: recebe a pergunta e devolve a pergunta alterada em `onChange`.
 * A validação final é a de `parseQuestionOptions`, a mesma do envio.
 */
export default function QuestionFields({ question, onChange, translation }) {
  const kind = question.kind;
  const hasOptions = kind === "quiz" || kind === "survey";
  const options = Array.isArray(question.options) ? question.options : [];

  function patch(next) {
    onChange({ ...question, ...next });
  }

  function updateOption(index, next) {
    patch({
      options: options.map((option, i) =>
        i === index ? { ...option, ...next } : option,
      ),
    });
  }

  function setCorrect(index) {
    patch({
      options: options.map((option, i) => ({
        ...option,
        correct: i === index,
      })),
    });
  }

  function removeOption(index) {
    const next = options.filter((_, i) => i !== index);

    /* Se saiu a opção certa, a primeira passa a ser a certa. */
    if (kind === "quiz" && next.length && !next.some((o) => o.correct)) {
      next[0] = { ...next[0], correct: true };
    }

    patch({ options: next });
  }

  function addOption() {
    patch({ options: [...options, makeQuizOption()] });
  }

  return (
    <>
      <label className={styles.field}>
        <span>{translation("EditModal.question.body")}</span>
        <textarea
          value={question.body ?? ""}
          maxLength={QUESTION_BODY_MAX_LENGTH}
          onChange={(event) => patch({ body: event.target.value })}
          className={styles.textarea}
          rows={4}
        />
      </label>

      {hasOptions ? (
        <div className={styles.field}>
          <span>{translation("EditModal.question.options")}</span>

          <div className={styles.fileList}>
            {options.map((option, index) => (
              <div key={index} className={styles.fileRow}>
                {kind === "quiz" ? (
                  <input
                    type="radio"
                    name="quiz-correct-option"
                    checked={option.correct === true}
                    onChange={() => setCorrect(index)}
                    aria-label={translation("EditModal.question.correct")}
                  />
                ) : null}

                <input
                  type="text"
                  value={option.label ?? ""}
                  maxLength={QUIZ_OPTION_MAX_LENGTH}
                  onChange={(event) =>
                    updateOption(index, { label: event.target.value })
                  }
                  className={styles.input}
                />

                {options.length > QUIZ_MIN_OPTIONS ? (
                  <button
                    type="button"
                    className={styles.fileRemoveButton}
                    onClick={() => removeOption(index)}
                    aria-label={translation("EditModal.remove")}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {options.length < QUIZ_MAX_OPTIONS ? (
            <button
              type="button"
              className={styles.secondaryInlineButton}
              onClick={addOption}
            >
              <Plus size={16} aria-hidden />
              <span>{translation("EditModal.question.addOption")}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {kind === "quiz" ? (
        <>
          <label className={styles.field}>
            <span>{translation("EditModal.question.feedbackCorrect")}</span>
            <textarea
              value={question.feedbackCorrect ?? ""}
              maxLength={QUESTION_FEEDBACK_MAX_LENGTH}
              onChange={(event) =>
                patch({ feedbackCorrect: event.target.value })
              }
              className={styles.textarea}
              rows={2}
            />
          </label>

          <label className={styles.field}>
            <span>{translation("EditModal.question.feedbackIncorrect")}</span>
            <textarea
              value={question.feedbackIncorrect ?? ""}
              maxLength={QUESTION_FEEDBACK_MAX_LENGTH}
              onChange={(event) =>
                patch({ feedbackIncorrect: event.target.value })
              }
              className={styles.textarea}
              rows={2}
            />
          </label>
        </>
      ) : null}

      {kind === "survey" ? (
        <label className={styles.field}>
          <span>{translation("EditModal.question.thanksText")}</span>
          <textarea
            value={question.thanksText ?? ""}
            maxLength={QUESTION_FEEDBACK_MAX_LENGTH}
            onChange={(event) => patch({ thanksText: event.target.value })}
            className={styles.textarea}
            rows={2}
          />
        </label>
      ) : null}

      {kind === "open" ? (
        <>
          <label className={styles.field}>
            <span>{translation("EditModal.question.expectedAnswer")}</span>
            <textarea
              value={question.expectedAnswer ?? ""}
              maxLength={QUESTION_FEEDBACK_MAX_LENGTH}
              onChange={(event) =>
                patch({ expectedAnswer: event.target.value })
              }
              className={styles.textarea}
              rows={3}
            />
          </label>

          <label className={styles.field}>
            <span>
              <input
                type="checkbox"
                checked={question.aiEvaluation !== false}
                onChange={(event) =>
                  patch({ aiEvaluation: event.target.checked })
                }
              />{" "}
              {translation("EditModal.question.aiEvaluation")}
            </span>
          </label>
        </>
      ) : null}
    </>
  );
}
