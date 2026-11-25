import { getTranslations, setRequestLocale } from "next-intl/server";
import { Bot, GraduationCap, Megaphone, UserPlus } from "lucide-react";
import SiteShell from "../components/Site/SiteShell";
import PageHero from "../components/Site/PageHero";
import FinalCta from "../components/Site/FinalCta";
import ChatDemo from "../components/HomeV2/ChatDemo";
import site from "../components/Site/site.module.css";
import styles from "./solutionV2.module.css";
import { getPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }) {
  return getPageMetadata({
    params,
    namespace: "SolutionsPage",
    path: "/solution",
  });
}

// Cada área usa os textos de SolutionsPage.cards e a conversa de exemplo
// correspondente da home (HomeV2.cases). Cada conversa aparece num aparelho
// diferente (MacBook, iPhone, Apple Watch, iPad), com uma cena do dia a dia
// atrás (public/images/scenes/, geradas no Claude app a 16-11-2026).
//
// scene: o zoom do fundo e o tamanho do aparelho são independentes.
//   size   = largura x altura da imagem de fundo, em px.
//   crop   = parte da imagem que a caixa mostra [x0, y0, x1, y1] (zoom do
//            fundo).
//   screen + mask = a foto já traz o aparelho, com o ecrã verde (pintado de
//            preto no WebP). screen é o retângulo do ecrã em px e mask a forma
//            exata dele; o ChatDemo vai em modo "bare" (só o ecrã). Gerados com
//            green_screen.py (Desktop/2026-11-16-mockups-fundos-mydigitalbot)
//            a partir de finais/*-verde.png.
//   Sem screen (MacBook, iPad), o aparelho é a moldura da Apple por cima:
//   anchor = centro do aparelho na imagem [x, y] em px, tirado da
//            pré-visualização aprovada.
//   width  = largura do aparelho, em fração da largura da caixa.
//   aspect = proporção largura/altura do aparelho (moldura da Apple).
// mobile: cena alternativa para ecrãs até 640px (o ecrã do MacBook fica
//   pequeno demais para ler). Usa um telemóvel na mão, em modo "bare".
//
// O Apple Watch saiu a 20-11-2026: o bot não usa botões de resposta, e no
// relógio não dá para escrever.
//
// A Comunicação Interna e o Microlearning em mobile usam um Samsung seguro
// com uma mão (gerado no GPT a 23-11-2026, ver PROMPT_4 em
// Desktop/2026-11-16-mockups-...). O furo da câmara fica fora da máscara.
// Teste pedido pelo Fernando a 23-11-2026: sem cenas de fundo, só o aparelho
// com a conversa (moldura do próprio ChatDemo). false = só o aparelho;
// true = volta às cenas (as medidas abaixo ficam guardadas para isso).
const SHOW_SCENES = false;

const SAMSUNG_HAND = {
  src: "/images/scenes/samsung-mao.webp",
  size: [1024, 1536],
  crop: [80, 150, 944, 1536],
  screen: [297, 288, 729, 1174],
  mask: "/images/scenes/samsung-mao-ecra.png",
};

const AREAS = [
  {
    card: "microlearning",
    chat: "microlearning",
    channel: "teams",
    device: "laptop",
    Icon: GraduationCap,
    scene: {
      src: "/images/scenes/secretaria.webp",
      size: [1600, 1200],
      crop: [372, 470, 1227, 1111],
      anchor: [799, 806],
      width: 0.835,
      aspect: 1.5136,
    },
    mobile: { device: "phone", scene: SAMSUNG_HAND, frame: "samsung" },
  },
  {
    card: "onboarding",
    chat: "onboarding",
    channel: "whatsapp",
    device: "phone",
    Icon: UserPlus,
    // iPhone seguro só com a mão direita (gerado no GPT a 23-11-2026).
    scene: {
      src: "/images/scenes/iphone-mao.webp",
      size: [1024, 1536],
      crop: [80, 150, 944, 1536],
      screen: [302, 292, 721, 1180],
      mask: "/images/scenes/iphone-mao-ecra.png",
    },
  },
  {
    card: "internalCommunication",
    chat: "comms",
    channel: "teams",
    device: "phone",
    frame: "samsung",
    Icon: Megaphone,
    scene: SAMSUNG_HAND,
  },
  {
    card: "automatedSupport",
    chat: "assistant",
    channel: "whatsapp",
    device: "tablet",
    Icon: Bot,
    scene: {
      src: "/images/scenes/copa.webp",
      size: [1000, 860],
      crop: [90, 100, 910, 760],
      anchor: [500, 427],
      width: 0.84,
      aspect: 1.3041,
    },
  },
];

const pct = (value, total) => `${(100 * value) / total}%`;

// Converte as medidas de uma cena nas posições em % da caixa: a caixa tem a
// proporção do recorte, a imagem inteira ("palco") é maior e fica deslocada,
// e o aparelho fica centrado no ponto de ancoragem, com a largura pedida.
function sceneStyles({
  src,
  size,
  crop,
  anchor,
  width: share,
  aspect,
  screen,
}) {
  const [width, height] = size;
  const [x0, y0, x1, y1] = crop;
  const cropWidth = x1 - x0;
  const cropHeight = y1 - y0;
  return {
    box: { aspectRatio: `${cropWidth} / ${cropHeight}` },
    stage: {
      left: pct(-x0, cropWidth),
      top: pct(-y0, cropHeight),
      width: pct(width, cropWidth),
      height: pct(height, cropHeight),
      backgroundImage: `url(${src})`,
    },
    device: screen
      ? {
          // a foto já tem o aparelho: só o ecrã, no retângulo do verde
          left: pct(screen[0] - x0, cropWidth),
          top: pct(screen[1] - y0, cropHeight),
          width: pct(screen[2] - screen[0], cropWidth),
          height: pct(screen[3] - screen[1], cropHeight),
        }
      : {
          left: `${(100 * (anchor[0] - x0)) / cropWidth - 50 * share}%`,
          top: `${(100 * (anchor[1] - y0)) / cropHeight - (50 * share * cropWidth) / cropHeight / aspect}%`,
          width: `${100 * share}%`,
        },
  };
}

export default async function SolutionPage({ params }) {
  // Língua pelo URL: deixa a página ser gerada no build (estática).
  setRequestLocale((await params).locale);
  const t = await getTranslations("SolutionsPage");
  const tp = await getTranslations("Pages.solution");
  const tHome = await getTranslations("HomeV2");
  const chatLabels = tHome.raw("chatLabels");

  return (
    <SiteShell>
      <PageHero
        title={tp("title")}
        lead={tp("lead")}
        actions={[
          { href: "/contact", label: tp("primary") },
          { href: "/pricing", label: tp("secondary") },
        ]}
      />

      <section className={site.section} aria-labelledby="solution-areas">
        <div className={site.wrap}>
          <header className={`${site.sectionHead} ${site.reveal}`}>
            <h2 className={site.sectionTitle} id="solution-areas">
              {t("overview.title")}
            </h2>
            <p className={site.sectionText}>{t("overview.subtitle")}</p>
          </header>

          <div className={styles.areas}>
            {AREAS.map(({ card, chat, channel, device, frame, Icon, scene, mobile }) => {
              const views = [
                { device, frame, scene, only: mobile ? "wide" : null },
              ];
              if (mobile) views.push({ ...mobile, only: "narrow" });
              return (
                <article
                  className={styles.area}
                  key={card}
                  aria-labelledby={`area-${card}`}
                >
                  <div className={`${styles.areaCopy} ${site.reveal}`}>
                    <span className={styles.areaIcon} aria-hidden="true">
                      <Icon size={22} strokeWidth={1.9} />
                    </span>
                    <h3 className={styles.areaTitle} id={`area-${card}`}>
                      {t(`cards.${card}.title`)}
                    </h3>
                    <p className={styles.areaText}>
                      {t(`cards.${card}.description`)}
                    </p>
                    {/* Em vez de uma lista de checks (repetia a frase acima e o
                      exemplo ao lado), uma só linha com o resultado. */}
                    <p className={styles.areaOutcome}>
                      <span className={styles.areaOutcomeLabel}>
                        {tp("outcomeLabel")}
                      </span>
                      {t(`cards.${card}.outcome`)}
                    </p>
                  </div>

                  {views.map((view) => {
                    const only = view.only ? styles[`only-${view.only}`] : "";
                    if (!SHOW_SCENES) {
                      const demo = (
                        <ChatDemo
                          chat={tHome.raw(`cases.items.${chat}.chat`)}
                          labels={chatLabels}
                          variant={view.device}
                          initialChannel={channel}
                          initialCount={1}
                          bare={view.frame === "samsung"}
                        />
                      );
                      return (
                        <div
                          key={view.only || "all"}
                          className={`${styles.areaDevice} ${site.reveal} ${only}`}
                        >
                          {view.frame === "samsung" ? (
                            // Não há moldura do Samsung sem mão: corpo em CSS
                            // (cantos retos, bordas finas, furo da câmara) e
                            // o ChatDemo em modo "bare" lá dentro.
                            <div className={styles.samsung}>
                              <div className={styles.samsungScreen}>
                                {demo}
                                <span
                                  className={styles.samsungCamera}
                                  aria-hidden="true"
                                />
                              </div>
                            </div>
                          ) : (
                            demo
                          )}
                          <p className={styles.areaDeviceLabel}>{tp("example")}</p>
                        </div>
                      );
                    }
                    const look = sceneStyles(view.scene);
                    return (
                      <div
                        key={view.only || "all"}
                        className={`${styles.areaChat} ${site.reveal} ${only}`}
                        style={look.box}
                      >
                        <div className={styles.sceneStage} style={look.stage} />
                        <div className={styles.sceneDevice} style={look.device}>
                          <ChatDemo
                            chat={tHome.raw(`cases.items.${chat}.chat`)}
                            labels={chatLabels}
                            variant={view.device}
                            initialChannel={channel}
                            initialCount={1}
                            bare={Boolean(view.scene.screen)}
                            screenMask={view.scene.mask}
                          />
                        </div>
                        <p className={styles.areaChatLabel}>{tp("example")}</p>
                      </div>
                    );
                  })}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <FinalCta secondaryHref="/pricing" secondaryLabelKey="pricing" />
    </SiteShell>
  );
}
