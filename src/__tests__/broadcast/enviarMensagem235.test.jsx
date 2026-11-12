import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WhatsAppPhone, {
  WhatsAppBubble,
} from "@/app/components/WhatsAppPhone/WhatsAppPhone";
import ChainMessagesBar from "@/app/[locale]/(app)/broadcast/components/ChainMessagesBar";
import MessageComposer from "@/app/[locale]/(app)/broadcast/components/MessageComposer";
import { PlusMenuBar } from "@/app/[locale]/(app)/broadcast/components/PlusMenu";
import SchedulePanel from "@/app/[locale]/(app)/broadcast/components/panels/SchedulePanel";
import {
  buildInitialScheduledDate,
  scheduleTimeSlots,
} from "@/app/[locale]/(app)/broadcast/lib/helpers";

const readSource = (path) =>
  readFileSync(
    join(process.cwd(), "src/app/[locale]/(app)/broadcast", path),
    "utf8",
  );

/*
 * #235: Enviar mensagem.
 * - A pré-visualização do Teams parece o Teams, como a outra parece o WhatsApp.
 * - Ao escolher «Agendar», o calendário aparece à direita do telemóvel.
 * - A hora proposta ao agendar é sempre futura e dentro do horário.
 */

describe("pré-visualização do Teams", () => {
  it("tem presença no avatar, separador «Chat» e a hora por cima do balão", () => {
    render(
      <WhatsAppPhone contactName="Ana" variant="teams">
        <WhatsAppBubble time="17:46">Olá</WhatsAppBubble>
      </WhatsAppPhone>,
    );

    expect(screen.getByTestId("teams-presence")).toBeInTheDocument();
    expect(screen.getByText("teamsChat")).toBeInTheDocument();

    const time = screen.getByText("17:46");
    const bubble = screen.getByText("Olá");
    // A hora vem antes do balão (no WhatsApp fica dentro, no canto).
    expect(
      time.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(bubble).not.toContainElement(time);
    expect(time.textContent).not.toContain("✓");
  });

  it("o WhatsApp fica como estava", () => {
    render(
      <WhatsAppPhone contactName="Ana">
        <WhatsAppBubble time="17:46">Olá</WhatsAppBubble>
      </WhatsAppPhone>,
    );

    expect(screen.queryByTestId("teams-presence")).toBeNull();
    expect(screen.queryByText("teamsChat")).toBeNull();
    expect(screen.getByText("Olá")).toHaveTextContent("17:46 ✓✓");
  });

  it("nas miniaturas não mostra o separador nem os ícones", () => {
    render(
      <WhatsAppPhone contactName="Ana" variant="teams" compact>
        <WhatsAppBubble time="17:46">Olá</WhatsAppBubble>
      </WhatsAppPhone>,
    );

    expect(screen.queryByText("teamsChat")).toBeNull();
    expect(screen.getByTestId("teams-presence")).toBeInTheDocument();
  });
});

describe("«Agendar» ao lado do telemóvel", () => {
  function renderComposer(deliveryMode, setDeliveryMode = vi.fn()) {
    return render(
      <MessageComposer
        title="Mensagem"
        deliveryMode={deliveryMode}
        setDeliveryMode={setDeliveryMode}
        activeToolPanel={null}
        toggleToolPanel={vi.fn()}
        schedulePanel={<div>calendário</div>}
        trackedLinksCount={0}
        translation={(key) => key}
        phone={<textarea data-testid="phone" defaultValue="rascunho" />}
      />,
    );
  }

  it("só mostra o calendário ao agendar", () => {
    const { rerender } = renderComposer("now");
    expect(screen.queryByTestId("schedule-side")).toBeNull();

    rerender(
      <MessageComposer
        title="Mensagem"
        deliveryMode="schedule"
        setDeliveryMode={vi.fn()}
        activeToolPanel={null}
        toggleToolPanel={vi.fn()}
        schedulePanel={<div>calendário</div>}
        trackedLinksCount={0}
        translation={(key) => key}
        phone={<textarea data-testid="phone" defaultValue="rascunho" />}
      />,
    );
    expect(screen.getByTestId("schedule-side")).toHaveTextContent("calendário");
  });

  it("mudar de modo não recria o telemóvel (não se perde o que se escreveu)", () => {
    const { rerender } = renderComposer("now");
    const phone = screen.getByTestId("phone");
    fireEvent.change(phone, { target: { value: "texto novo" } });

    rerender(
      <MessageComposer
        title="Mensagem"
        deliveryMode="schedule"
        setDeliveryMode={vi.fn()}
        activeToolPanel={null}
        toggleToolPanel={vi.fn()}
        schedulePanel={<div>calendário</div>}
        trackedLinksCount={0}
        translation={(key) => key}
        phone={<textarea data-testid="phone" defaultValue="rascunho" />}
      />,
    );

    expect(screen.getByTestId("phone")).toBe(phone);
    expect(screen.getByTestId("phone")).toHaveValue("texto novo");
  });

  it("o botão «Agendar» pede o modo de agendar", () => {
    const setDeliveryMode = vi.fn();
    renderComposer("now", setDeliveryMode);

    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.scheduleBtn" }),
    );
    expect(setDeliveryMode).toHaveBeenCalledWith("schedule");
  });

  it("com largura, o calendário sobe para a direita; sem ela, fica por baixo dos botões", () => {
    const css = readSource("broadcast.module.css");
    const wide = css.slice(css.indexOf("@container (min-width: 620px)"));

    // Sem largura: telemóvel → links → aviso → envio → calendário.
    expect(css).toMatch(
      /"phone"\s*"links"\s*"warning"\s*"tools"\s*"schedule"/,
    );
    expect(wide).toMatch(
      /"phone schedule"\s*"links links"\s*"warning warning"\s*"tools tools"/,
    );
    expect(wide).toMatch(/"phone schedule"/);
    // Telemóvel e calendário juntos ao centro e com a mesma altura: o
    // telemóvel fica com o tamanho de sempre e o cartão do calendário estica.
    expect(wide).toMatch(/minmax\(0, 480px\) 290px/);
    expect(wide).not.toMatch(/max-width: 560px/);
    expect(wide).toMatch(
      /\.areaSchedule > \.toolPanelCard\s*\{\s*flex: 1 1 auto;/,
    );
    expect(wide).toMatch(/justify-content: center/);
    expect(wide).toMatch(/align-items: stretch/);
  });
});

describe("hora proposta ao agendar", () => {
  const at = (h, m, day = 11) => new Date(2026, 10, day, h, m, 20);
  const show = (date) =>
    `${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;

  it.each([
    [at(17, 52), "11 18:00"],
    [at(17, 40), "11 17:45"],
    [at(17, 58), "11 18:15"],
    [at(19, 50), "11 20:00"],
    [at(19, 55), "11 20:00"],
    [at(19, 58), "12 08:00"],
    [at(22, 10), "12 08:00"],
    [at(6, 30), "11 08:00"],
  ])("às %s propõe %s (sempre uma opção da lista)", (now, expected) => {
    expect(show(buildInitialScheduledDate(now))).toBe(expected);
  });

  it("é sempre pelo menos 5 minutos no futuro", () => {
    const now = at(17, 45);
    const proposed = buildInitialScheduledDate(now);
    expect(proposed.getTime() - now.getTime()).toBeGreaterThanOrEqual(
      4 * 60 * 1000,
    );
  });

  it("a página usa-a quando a hora já passou ao carregar em «Agendar»", () => {
    const page = readSource("page.jsx");
    expect(page).toMatch(
      /function chooseDeliveryMode[\s\S]*?scheduledFor\.getTime\(\) <= Date\.now\(\)[\s\S]*?buildInitialScheduledDate\(\)/,
    );
    expect(page).not.toContain("setDeliveryMode={setDeliveryMode}");
  });
});

describe("hora numa lista de 15 em 15 minutos", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPanel(scheduledFor, setScheduledFor = vi.fn()) {
    render(
      <SchedulePanel
        scheduledFor={scheduledFor}
        setScheduledFor={setScheduledFor}
        scheduleInvalid={false}
        browserTimeZone="Europe/Lisbon"
        translation={(key) => key}
      />,
    );
    return setScheduledFor;
  }

  it("a lista vai das 08:00 às 20:00, de 15 em 15 minutos", () => {
    const slots = scheduleTimeSlots();
    expect(slots).toHaveLength(49);
    expect(slots[0]).toBe("08:00");
    expect(slots[1]).toBe("08:15");
    expect(slots.at(-1)).toBe("20:00");
  });

  it("escolher uma hora muda só a hora, no mesmo dia", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11, 9, 0));

    const setScheduledFor = renderPanel(new Date(2026, 10, 12, 10, 0));
    const select = screen.getByLabelText("Broadcast.hour");

    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveValue("10:00");
    // Não há campos para escrever a hora.
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.change(select, { target: { value: "14:45" } });

    const chosen = setScheduledFor.mock.calls[0][0];
    expect(chosen.getDate()).toBe(12);
    expect(chosen.getHours()).toBe(14);
    expect(chosen.getMinutes()).toBe(45);
  });

  it("hoje, as horas que já passaram ficam desativadas", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11, 17, 52));

    renderPanel(new Date(2026, 10, 11, 18, 0));

    expect(screen.getByRole("option", { name: "17:45" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "18:00" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "20:00" })).toBeEnabled();
  });

  it("noutro dia, todas as horas estão disponíveis", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11, 17, 52));

    renderPanel(new Date(2026, 10, 12, 9, 0));

    expect(screen.getByRole("option", { name: "08:00" })).toBeEnabled();
  });

  it("só há o calendário e, logo por baixo, a lista das horas", () => {
    const { container } = render(
      <SchedulePanel
        scheduledFor={new Date(2026, 10, 12, 9, 0)}
        setScheduledFor={vi.fn()}
        scheduleInvalid={false}
        browserTimeZone="Europe/Lisbon"
        translation={(key) => key}
      />,
    );

    // Sem o resumo «12/11/2026 · 09:00».
    expect(screen.queryByText("Broadcast.selectSendTime")).toBeNull();
    expect(container.textContent).not.toMatch(/·\s*09:00/);

    const calendar = container.querySelector(".react-datepicker");
    const select = screen.getByLabelText("Broadcast.hour");
    expect(
      calendar.compareDocumentPosition(select) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("o horário explica-se no «i», em vez do texto cinzento", () => {
    renderPanel(new Date(2026, 10, 12, 9, 0));

    const info = screen.getByRole("button", { name: "Broadcast.chooseTime" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(info);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Broadcast.chooseTime",
    );

    fireEvent.mouseLeave(info);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("links rastreados na barra da mensagem", () => {
  const baseTools = { editorRef: { current: null } };

  it("o 🔗 está ao lado do + e dos emojis, com o número de links", () => {
    const onToggle = vi.fn();
    render(
      <PlusMenuBar
        tools={{
          ...baseTools,
          linksToggle: { active: false, count: 2, onToggle },
        }}
        translation={(key) => key}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Broadcast.trackedLinks",
    });
    expect(within(button).getByTestId("links-count")).toHaveTextContent("2");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("sem links rastreados (grupos), não aparece", () => {
    render(<PlusMenuBar tools={baseTools} translation={(key) => key} />);
    expect(
      screen.queryByRole("button", { name: "Broadcast.trackedLinks" }),
    ).toBeNull();
  });

  it("o painel abre logo a seguir ao telemóvel e já não há botão em baixo", () => {
    render(
      <MessageComposer
        title="Mensagem"
        deliveryMode="now"
        setDeliveryMode={vi.fn()}
        activeToolPanel="links"
        schedulePanel={<div>calendário</div>}
        translation={(key) => key}
        phone={<div data-testid="phone" />}
      >
        <div>painel dos links</div>
      </MessageComposer>,
    );

    const phoneArea = screen.getByTestId("phone").parentElement;
    expect(phoneArea.nextElementSibling).toBe(
      screen.getByTestId("links-panel"),
    );
    expect(
      screen.queryByRole("button", { name: "Broadcast.trackedLinks" }),
    ).toBeNull();
  });
});

describe("opções da sequência juntas, por cima do telemóvel", () => {
  function renderBar(props = {}) {
    return render(
      <ChainMessagesBar
        enabled
        chainMode
        setChainMode={vi.fn()}
        chainSteps={[{ id: "a" }, { id: "b" }]}
        activeChainStepIndex={1}
        setActiveChainStepIndex={vi.fn()}
        addChainStep={vi.fn()}
        duplicateChainStep={vi.fn()}
        removeChainStep={vi.fn()}
        onChangeStepKind={vi.fn()}
        maxSteps={10}
        translation={(key) => key}
        {...props}
      />,
    );
  }

  it("o contador fica na mesma linha dos passos", () => {
    renderBar();

    const counter = screen.getByTestId("chain-counter");
    expect(counter).toHaveTextContent("2/10");
    const firstStep = screen.getAllByText(
      /Broadcast\.broadcastChain\.chainMessage\b/,
    )[0];
    expect(counter.parentElement).toBe(firstStep.parentElement);
  });

  it("o tempo de espera do passo aparece na caixa da sequência", () => {
    renderBar({ delayContent: <div>esperar 1 h</div> });
    expect(screen.getByTestId("chain-delay")).toHaveTextContent("esperar 1 h");
  });

  it("duplicar e eliminar são ícones com nome", () => {
    renderBar();
    expect(
      screen.getByRole("button", {
        name: "Broadcast.broadcastChain.chainDuplicate",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Broadcast.broadcastChain.chainRemove",
      }),
    ).toBeInTheDocument();
  });

  it("os textos são «Criar sequência» e «Sair da sequência»", () => {
    const pt = JSON.parse(
      readFileSync(join(process.cwd(), "src/messages/pt.json"), "utf8"),
    );
    expect(pt.Broadcast.broadcastChain.createChain).toBe("Criar sequência");
    expect(pt.Broadcast.broadcastChain.exitChain).toBe("Sair da sequência");
  });

  it("a página passa o tempo de espera à sequência", () => {
    const page = readSource("page.jsx");
    expect(page).toContain("delayContent={chainDelayTools}");
    expect(page).not.toContain("leftToolsContent");
  });
});
