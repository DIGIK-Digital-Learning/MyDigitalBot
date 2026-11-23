"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BatteryFull,
  Check,
  CheckCheck,
  FileText,
  Mic,
  Paperclip,
  Phone,
  SendHorizontal,
  Signal,
  Smile,
  Video,
  Wifi,
} from "lucide-react";
import BrandSymbol from "./BrandSymbol";
import { TeamsRail, TeamsTitleBar } from "./TeamsChrome";
import styles from "./chatDemo.module.css";

const CHANNELS = ["whatsapp", "teams"];

// Aparelhos com ecrã desenhado em px "reais" (width) e reduzido à escala da
// moldura. As molduras são as Product Bezels da Apple
// (public/images/devices/) e as posições dos ecrãs estão no CSS.
// narrowWidth: em ecrãs estreitos (telemóvel) a interface desenha-se mais
// estreita, para ficar a uma escala maior e a letra continuar legível.
const DEVICES = {
  laptop: { width: 520, narrowWidth: 400 },
  tablet: { width: 480, narrowWidth: 380 },
  desktop: { width: 660, narrowWidth: 440 },
  watch: { width: 211 },
};

// Modo "bare": só o ecrã, sem moldura, para pôr por cima do ecrã verde de
// uma foto que já traz o aparelho. Também o telemóvel passa a ser desenhado
// em tamanho real e reduzido à escala do ecrã da foto.
const BARE_DEVICES = { phone: { width: 300 } };

// Tempo de leitura de cada mensagem antes de aparecer a seguinte.
function readingTime(text = "") {
  return Math.min(2900, Math.max(1300, text.length * 30));
}

/**
 * Conversa de exemplo animada, mensagem a mensagem, com o aspeto do WhatsApp
 * ou do Teams. Só anima quando está visível no ecrã e o separador está ativo;
 * com "reduzir movimento" mostra a conversa toda, parada.
 *
 * chat: { contact, messages: [{ from: "bot" | "user" | "system", text,
 *   time?, options?: string[], source?: string }] }
 */
export default function ChatDemo({
  chat,
  labels,
  variant = "phone",
  channelSwitch = false,
  initialChannel = "whatsapp",
  initialCount = 0,
  bare = false,
  screenMask,
}) {
  const messages = chat.messages;
  const total = messages.length;
  const startCount = Math.min(initialCount, total);

  const [channel, setChannel] = useState(initialChannel);
  const [count, setCount] = useState(startCount);
  const [typing, setTyping] = useState(false);

  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const visibleRef = useRef(false);
  const pickedRef = useRef(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      visibleRef.current = true;
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyping(false);
      setCount(total);
      return undefined;
    }

    let cancelled = false;
    let timer;
    const wait = (ms) =>
      new Promise((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });
    const whenOnScreen = async () => {
      while (!cancelled && (!visibleRef.current || document.hidden)) {
        await wait(350);
      }
    };

    (async () => {
      let shown = startCount;
      await wait(shown > 0 ? 900 : 400);

      while (!cancelled) {
        while (!cancelled && shown < total) {
          await whenOnScreen();
          const next = messages[shown];
          if (next.from === "bot") {
            setTyping(true);
            await wait(900);
            if (cancelled) return;
            setTyping(false);
          } else {
            await wait(700);
            if (cancelled) return;
          }
          shown += 1;
          setCount(shown);
          await wait(readingTime(next.text));
        }

        await wait(2400);
        await whenOnScreen();
        if (cancelled) return;
        if (channelSwitch && !pickedRef.current) {
          setChannel((current) =>
            current === "whatsapp" ? "teams" : "whatsapp",
          );
        }
        shown = 0;
        setCount(0);
        await wait(450);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [messages, total, startCount, channelSwitch]);

  // Mantém a última mensagem à vista dentro do ecrã do telemóvel (só faz
  // scroll dentro da conversa, nunca à página).
  // Se a última mensagem não couber, pára no início dela (não no fundo),
  // para se ler a mensagem desde a primeira linha.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const last = body.lastElementChild;
    const bottom = body.scrollHeight - body.clientHeight;
    const lastTop = last
      ? last.offsetTop - parseFloat(getComputedStyle(body).paddingTop)
      : bottom;
    body.scrollTo({ top: Math.min(bottom, lastTop), behavior: "smooth" });
  }, [count, typing, channel]);

  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!DEVICES[variant]?.narrowWidth) return undefined;
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [variant]);

  const shown = variant;
  const device = DEVICES[shown] || (bare ? BARE_DEVICES[shown] : undefined);
  const uiWidth = device ? (narrow && device.narrowWidth) || device.width : 0;

  // O ecrã destes aparelhos desenha-se no tamanho "real" (device.width) e
  // reduz-se à escala da moldura, como num screenshot.
  const screenRef = useRef(null);
  const [fit, setFit] = useState(null);
  useEffect(() => {
    const node = screenRef.current;
    if (!node || !device) {
      setFit(null);
      return undefined;
    }
    const measure = () => {
      const scale = node.clientWidth / uiWidth;
      if (scale > 0) setFit({ scale, height: node.clientHeight / scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [device, uiWidth]);

  const isTeams = channel === "teams";
  // Teams em ecrã grande: janela com barra de topo e barra lateral. No
  // telemóvel (mesmo em modo "bare") é a app móvel, sem barra lateral.
  const teamsDesk =
    isTeams && ["laptop", "tablet", "desktop"].includes(shown);
  const visible = messages.slice(0, count);
  const lastBotIndex = visible.findLastIndex((m) => m.from === "bot");
  const happy =
    visible.length > 0 && visible[visible.length - 1].from === "system";

  return (
    <figure
      ref={rootRef}
      className={`${styles.root} ${styles[shown]} ${styles[channel]} ${
        bare ? styles.bare : ""
      }`}
      style={
        bare && screenMask ? { "--bare-mask": `url(${screenMask})` } : undefined
      }
    >
      {channelSwitch ? (
        <div className={styles.switch} role="group" aria-label={labels.switch}>
          {CHANNELS.map((id) => (
            <button
              type="button"
              key={id}
              className={styles.switchButton}
              aria-pressed={channel === id}
              onClick={() => {
                pickedRef.current = true;
                setChannel(id);
              }}
            >
              {labels.channels[id]}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.device}>
        <div className={styles.screen} ref={screenRef}>
          <div
            className={styles.ui}
            style={
              device
                ? fit
                  ? {
                      width: uiWidth,
                      height: fit.height,
                      transform: `scale(${fit.scale})`,
                    }
                  : { visibility: "hidden" }
                : undefined
            }
          >
            {shown === "phone" || shown === "tablet" ? (
              <div className={styles.statusBar} aria-hidden="true">
                <span>9:41</span>
                <span className={styles.statusIcons}>
                  <Signal size={15} strokeWidth={2.4} />
                  <Wifi size={15} strokeWidth={2.4} />
                  <BatteryFull size={20} strokeWidth={1.8} />
                </span>
              </div>
            ) : null}
            {shown === "watch" ? (
              <div className={styles.watchBar} aria-hidden="true">
                <strong>{chat.contact}</strong>
                <span>9:41</span>
              </div>
            ) : null}
            {shown === "laptop" || shown === "desktop" ? (
              <div className={styles.menuBar} aria-hidden="true">
                <strong>{labels.channels[channel]}</strong>
                <span className={styles.statusIcons}>
                  <Wifi size={12} strokeWidth={2.4} />
                  <BatteryFull size={16} strokeWidth={1.8} />
                  <span>9:41</span>
                </span>
              </div>
            ) : null}
            {teamsDesk ? (
              <TeamsTitleBar
                styles={styles}
                labels={labels.teamsRail}
                trafficLights={shown !== "tablet"}
              />
            ) : null}
            <div className={styles.app}>
              {teamsDesk ? <TeamsRail styles={styles} /> : null}
              <div className={styles.pane}>
                <header className={styles.bar} aria-hidden="true">
                  {shown === "phone" ? (
                    <ArrowLeft size={18} strokeWidth={2} />
                  ) : null}
                  <span
                    className={`${styles.avatar} ${typing ? styles.avatarTyping : ""} ${
                      happy ? styles.avatarHappy : ""
                    }`}
                  >
                    <BrandSymbol
                      className={styles.avatarSymbol}
                      eyeClassName={styles.avatarEyes}
                    />
                  </span>
                  <span className={styles.who}>
                    <strong>{chat.contact}</strong>
                    <small>
                      {typing
                        ? labels.typing
                        : isTeams
                          ? labels.teamsStatus
                          : labels.whatsappStatus}
                    </small>
                  </span>
                  <span className={styles.barIcons}>
                    <Video size={18} strokeWidth={1.9} />
                    <Phone size={16} strokeWidth={1.9} />
                  </span>
                </header>

                <div className={styles.body} ref={bodyRef} aria-hidden="true">
                  <p className={styles.day}>{labels.today}</p>

                  {visible.map((message, index) => {
                    if (message.from === "system") {
                      return (
                        <p className={styles.system} key={index}>
                          <Check size={13} strokeWidth={2.8} />
                          {message.text}
                        </p>
                      );
                    }

                    const next = messages[index + 1];
                    const chosen =
                      index + 1 < count && next?.from === "user"
                        ? next.text
                        : null;
                    const isBot = message.from === "bot";
                    const showSender =
                      isTeams &&
                      isBot &&
                      (index === 0 || messages[index - 1].from !== "bot");

                    return (
                      <div
                        key={index}
                        className={`${styles.msg} ${isBot ? styles.bot : styles.user}`}
                      >
                        <div className={styles.bubble}>
                          {showSender ? (
                            <span className={styles.sender}>
                              {chat.contact}
                              <time>{message.time}</time>
                            </span>
                          ) : null}
                          <p>{message.text}</p>
                          {message.source ? (
                            <span className={styles.source}>
                              <FileText size={13} strokeWidth={2} />
                              {message.source}
                            </span>
                          ) : null}
                          {!isTeams ? (
                            <span className={styles.meta}>
                              {message.time}
                              {!isBot ? (
                                <CheckCheck size={14} strokeWidth={2} />
                              ) : null}
                            </span>
                          ) : null}
                        </div>

                        {/* Depois de escolher, os botões saem: a escolha
                            fica só como mensagem enviada (sem repetir). */}
                        {message.options && !chosen ? (
                          <div
                            className={`${styles.options} ${
                              index === lastBotIndex ? styles.optionsLive : ""
                            }`}
                          >
                            {message.options.map((option) => (
                              <span key={option} className={styles.option}>
                                {option}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {typing ? (
                    <div className={`${styles.msg} ${styles.bot}`}>
                      <span className={styles.typingBubble}>
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  ) : null}
                </div>

                <footer className={styles.composer} aria-hidden="true">
                  {isTeams ? null : <Smile size={19} strokeWidth={1.8} />}
                  <span className={styles.input}>
                    {isTeams ? labels.teamsInput : labels.whatsappInput}
                  </span>
                  {isTeams ? (
                    <>
                      <Paperclip size={17} strokeWidth={1.8} />
                      <SendHorizontal size={18} strokeWidth={1.8} />
                    </>
                  ) : (
                    <span className={styles.mic}>
                      <Mic size={17} strokeWidth={2} />
                    </span>
                  )}
                </footer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <figcaption className={styles.srOnly}>
        {labels.caption} {messages.map((message) => message.text).join(" ")}
      </figcaption>
    </figure>
  );
}
