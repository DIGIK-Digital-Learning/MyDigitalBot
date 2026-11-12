import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScheduledEditModal, {
  editTimeSlots,
  isPastSlot,
} from "@/app/[locale]/(app)/broadcast/scheduled/components/ScheduledEditModal";
import {
  normalizeUser,
} from "@/app/[locale]/(app)/broadcast/scheduled/helpers/recipient.helpers";
import { normalizeBroadcast } from "@/app/[locale]/(app)/broadcast/scheduled/helpers/scheduled.helpers";

const translation = (key) => key;

const orgUsers = [
  { id: 5704, name: "Diogo", phone_number: "+351933000001" },
  { id: 5703, name: "Beatriz", phone_number: "+351938000002" },
  { id: 5702, name: "Alexandre", phone_number: "+351935000003" },
].map(normalizeUser);

function renderModal(
  payload,
  {
    channel = "whatsapp",
    onSave = vi.fn(),
    scheduledFor = "2099-01-01T12:00:00Z",
  } = {},
) {
  const item = normalizeBroadcast({
    id: "b-1",
    channel,
    status: "queued",
    scheduled_for: scheduledFor,
    timezone: "Europe/Lisbon",
    payload,
  });

  render(
    <ScheduledEditModal
      item={item}
      orgUsers={orgUsers}
      usersLoading={false}
      translation={translation}
      isEditModalOpen
      closeEditModal={vi.fn()}
      onSave={onSave}
      saving={false}
    />,
  );

  return { onSave };
}

describe("ScheduledEditModal: perguntas", () => {
  it("quiz: mostra a pergunta, as opções e o feedback preenchidos", () => {
    renderModal({
      message: "",
      recipients: [{ userId: 5704 }],
      question: {
        kind: "quiz",
        body: "Qual é a capital?",
        options: [
          { label: "Lisboa", correct: true },
          { label: "Porto", correct: false },
        ],
        feedbackCorrect: "Certo!",
        feedbackIncorrect: "Errado",
      },
    });

    expect(screen.getByDisplayValue("Qual é a capital?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lisboa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Porto")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Certo!")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Errado")).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });

  it("sondagem: mostra a pergunta, as opções e o agradecimento", () => {
    renderModal({
      message: "",
      recipients: [{ userId: 5704 }],
      question: {
        kind: "survey",
        body: "Gostaste?",
        options: [{ label: "Sim" }, { label: "Não" }],
        thanksText: "Obrigado!",
      },
    });

    expect(screen.getByDisplayValue("Gostaste?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sim")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Obrigado!")).toBeInTheDocument();
  });

  it("pergunta aberta: mostra a pergunta e a resposta esperada", () => {
    renderModal({
      message: "",
      recipients: [{ userId: 5704 }],
      question: {
        kind: "open",
        body: "Explica o processo",
        expectedAnswer: "Três passos",
        aiEvaluation: true,
      },
    });

    expect(screen.getByDisplayValue("Explica o processo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Três passos")).toBeInTheDocument();
  });

  it("guardar devolve a pergunta editada", () => {
    const { onSave } = renderModal({
      message: "",
      recipients: [{ userId: 5704 }],
      question: {
        kind: "open",
        body: "Explica o processo",
        expectedAnswer: "Três passos",
        aiEvaluation: true,
      },
    });

    fireEvent.change(screen.getByDisplayValue("Três passos"), {
      target: { value: "Quatro passos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "EditModal.save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].question).toMatchObject({
      kind: "open",
      expectedAnswer: "Quatro passos",
    });
  });

  it("mensagem em branco continua com o campo de mensagem", () => {
    renderModal({ message: "Olá equipa", recipients: [{ userId: 5704 }] });

    expect(screen.getByDisplayValue("Olá equipa")).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("ScheduledEditModal: destinatários", () => {
  it("mostra o nome e o telefone em vez do id", () => {
    renderModal({
      message: "Olá",
      recipients: [{ userId: 5704 }, { userId: 5703 }],
    });

    expect(screen.getByText("Diogo")).toBeInTheDocument();
    expect(screen.getByText("+351933000001")).toBeInTheDocument();
    expect(screen.getByText("Beatriz")).toBeInTheDocument();
    expect(screen.queryByText("5704")).toBeNull();
  });

  it("utilizador que já não existe aparece como removido, não com o id", () => {
    renderModal({ message: "Olá", recipients: [{ userId: 999 }] });

    expect(
      screen.getByText("EditModal.unknownRecipient"),
    ).toBeInTheDocument();
    expect(screen.queryByText("999")).toBeNull();
  });

  it("no seletor, quem está selecionado não aparece como disponível", () => {
    renderModal({
      message: "Olá",
      recipients: [{ userId: 5704 }, { userId: 5703 }],
    });

    fireEvent.click(
      screen.getByRole("button", { name: /EditModal.manageRecipients/ }),
    );

    const dialog = screen.getAllByRole("dialog").at(-1);

    /* Diogo e Beatriz só uma vez cada (selecionados); Alexandre disponível. */
    expect(within(dialog).getAllByText("Diogo")).toHaveLength(1);
    expect(within(dialog).getAllByText("Beatriz")).toHaveLength(1);
    expect(within(dialog).getAllByText("Alexandre")).toHaveLength(1);
    expect(
      within(dialog).getAllByRole("button", { name: /RecipientPicker.add/ }),
    ).toHaveLength(1);
  });

  it("agenda antiga só com telefone resolve o nome e grava com userId", () => {
    const { onSave } = renderModal({
      message: "Olá",
      recipients: [{ phoneNumber: "+351933000001" }],
    });

    expect(screen.getByText("Diogo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "EditModal.save" }));

    expect(onSave.mock.calls[0][0].recipients).toEqual([
      expect.objectContaining({ userId: "5704" }),
    ]);
  });
});

describe("ScheduledEditModal: hora", () => {
  const message = { message: "Olá", recipients: [{ userId: 5704 }] };
  const at = (h, m) => new Date(2099, 0, 1, h, m).toISOString();

  it("escolhe-se numa lista das 08:00 às 20:00, de 15 em 15, com o «i»", () => {
    renderModal(message, { scheduledFor: at(12, 0) });

    const select = screen.getByLabelText("EditModal.hour");
    const options = within(select).getAllByRole("option");

    expect(select).toHaveValue("12:00");
    expect(options).toHaveLength(49);
    expect(options[0]).toHaveValue("08:00");
    expect(options.at(-1)).toHaveValue("20:00");
    expect(screen.queryByText("EditModal.minute")).toBeNull();
    expect(screen.getByLabelText("EditModal.chooseTime")).toBeInTheDocument();
  });

  it("uma agendada antiga fora da lista mantém a hora que tinha", () => {
    renderModal(message, { scheduledFor: at(21, 30) });

    expect(screen.getByLabelText("EditModal.hour")).toHaveValue("21:30");
    expect(editTimeSlots("21:30")).toContain("21:30");
    expect(editTimeSlots("12:00")).toHaveLength(49);
  });

  it("guardar envia a hora escolhida na lista", () => {
    const { onSave } = renderModal(message, { scheduledFor: at(12, 0) });

    fireEvent.change(screen.getByLabelText("EditModal.hour"), {
      target: { value: "09:45" },
    });
    fireEvent.submit(screen.getByLabelText("EditModal.hour").closest("form"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2099-01-01", hour: "09", minute: "45" }),
    );
  });

  it("hoje, as horas que já passaram ficam desativadas", () => {
    const now = new Date(2026, 10, 12, 14, 10);

    expect(isPastSlot("2026-11-12", "14:00", now)).toBe(true);
    expect(isPastSlot("2026-11-12", "14:15", now)).toBe(false);
    expect(isPastSlot("2026-11-13", "08:00", now)).toBe(false);
  });

  it("não deixa escolher um dia que já passou", () => {
    renderModal(message, { scheduledFor: at(12, 0) });

    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    expect(screen.getByLabelText("EditModal.date")).toHaveAttribute(
      "min",
      `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    );
  });
});
