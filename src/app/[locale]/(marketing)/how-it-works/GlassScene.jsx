import {
  BarChart3,
  Bot,
  CalendarClock,
  Check,
  MessageCircle,
  Rocket,
  Settings2,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import styles from "./glassScene.module.css";

// Glassmorphism scenes for the five phases on the "How it works" page.
// Decorative only (the step title and text carry the meaning), so the whole
// scene is aria-hidden. Copy lives here, per locale, because it is UI mock
// content, not page copy.
const COPY = {
  pt: {
    initialSetup: {
      center: "Organização",
      channels: ["Teams", "WhatsApp"],
      users: "25 utilizadores",
      goal: "Objetivo: onboarding",
    },
    communicationStructure: {
      title: "Plano da semana",
      rows: [
        { time: "Seg 09:00", label: "Boas-vindas", tag: "Novos" },
        { time: "Qua 14:00", label: "Dica de segurança", tag: "Todos" },
        { time: "Sex 11:00", label: "Quiz rápido", tag: "Vendas" },
      ],
    },
    aiAssistants: {
      name: "Assistente RH",
      question: "Quantos dias de férias tenho?",
      answer: "Tens 22 dias úteis. Já gozaste 8, faltam 14.",
      chips: ["RH", "Formação", "Suporte"],
    },
    testingLaunch: {
      title: "Lançamento",
      items: ["Grupo piloto", "Ajustes feitos", "Todos ligados"],
      status: "Pronto",
    },
    optimization: {
      title: "Taxa de leitura",
      value: "92%",
      trend: "+18% este mês",
    },
  },
  en: {
    initialSetup: {
      center: "Organisation",
      channels: ["Teams", "WhatsApp"],
      users: "25 users",
      goal: "Goal: onboarding",
    },
    communicationStructure: {
      title: "This week",
      rows: [
        { time: "Mon 09:00", label: "Welcome", tag: "New hires" },
        { time: "Wed 14:00", label: "Security tip", tag: "Everyone" },
        { time: "Fri 11:00", label: "Quick quiz", tag: "Sales" },
      ],
    },
    aiAssistants: {
      name: "HR assistant",
      question: "How many days off do I have?",
      answer: "You have 22 working days. 8 used, 14 left.",
      chips: ["HR", "Training", "Support"],
    },
    testingLaunch: {
      title: "Launch",
      items: ["Pilot group", "Tweaks done", "Everyone live"],
      status: "Ready",
    },
    optimization: {
      title: "Read rate",
      value: "92%",
      trend: "+18% this month",
    },
  },
};

const BARS = [38, 52, 47, 64, 72, 81, 92];

function Glass({ className = "", children }) {
  return <div className={`${styles.glass} ${className}`}>{children}</div>;
}

function InitialSetup({ c }) {
  return (
    <>
      <Glass className={styles.hub}>
        <span className={styles.hubIcon}>
          <Settings2 size={30} strokeWidth={1.8} />
        </span>
        <strong>{c.center}</strong>
      </Glass>
      <Glass className={`${styles.pill} ${styles.pos1} ${styles.float1}`}>
        <MessageCircle size={16} /> {c.channels[0]}
      </Glass>
      <Glass className={`${styles.pill} ${styles.pos2} ${styles.float2}`}>
        <MessageCircle size={16} /> {c.channels[1]}
      </Glass>
      <Glass className={`${styles.pill} ${styles.pos3} ${styles.float3}`}>
        <Users size={16} /> {c.users}
      </Glass>
      <Glass className={`${styles.pill} ${styles.pos4} ${styles.float2}`}>
        <Sparkles size={16} /> {c.goal}
      </Glass>
    </>
  );
}

function CommunicationStructure({ c }) {
  return (
    <Glass className={styles.panel}>
      <div className={styles.panelHead}>
        <CalendarClock size={18} />
        <strong>{c.title}</strong>
      </div>
      <ul className={styles.rows}>
        {c.rows.map((row) => (
          <li key={row.time}>
            <span className={styles.rowTime}>{row.time}</span>
            <span className={styles.rowLabel}>{row.label}</span>
            <span className={styles.tag}>{row.tag}</span>
          </li>
        ))}
      </ul>
    </Glass>
  );
}

function AiAssistants({ c }) {
  return (
    <>
      <Glass className={styles.panel}>
        <div className={styles.panelHead}>
          <span className={styles.botBadge}>
            <Bot size={18} />
          </span>
          <strong>{c.name}</strong>
          <span className={styles.online} />
        </div>
        <div className={styles.chat}>
          <p className={styles.bubbleUser}>{c.question}</p>
          <p className={styles.bubbleBot}>{c.answer}</p>
        </div>
      </Glass>
      <div className={`${styles.chipRow} ${styles.float1}`}>
        {c.chips.map((chip) => (
          <Glass className={styles.chip} key={chip}>
            {chip}
          </Glass>
        ))}
      </div>
    </>
  );
}

function TestingLaunch({ c }) {
  return (
    <>
      <Glass className={styles.panel}>
        <div className={styles.panelHead}>
          <Rocket size={18} />
          <strong>{c.title}</strong>
        </div>
        <ul className={styles.checklist}>
          {c.items.map((item) => (
            <li key={item}>
              <span className={styles.checkDot}>
                <Check size={13} strokeWidth={3} />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <div className={styles.progress}>
          <span />
        </div>
      </Glass>
      <Glass className={`${styles.pill} ${styles.status} ${styles.float2}`}>
        <Check size={16} strokeWidth={2.6} /> {c.status}
      </Glass>
    </>
  );
}

function Optimization({ c }) {
  return (
    <Glass className={styles.panel}>
      <div className={styles.panelHead}>
        <BarChart3 size={18} />
        <strong>{c.title}</strong>
      </div>
      <div className={styles.kpi}>
        <span className={styles.kpiValue}>{c.value}</span>
        <span className={styles.trend}>
          <TrendingUp size={14} /> {c.trend}
        </span>
      </div>
      <div className={styles.bars}>
        {BARS.map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
    </Glass>
  );
}

const SCENES = {
  initialSetup: InitialSetup,
  communicationStructure: CommunicationStructure,
  aiAssistants: AiAssistants,
  testingLaunch: TestingLaunch,
  optimization: Optimization,
};

export default function GlassScene({ step, locale }) {
  const Scene = SCENES[step];
  const c = (COPY[locale] ?? COPY.pt)[step];
  if (!Scene || !c) return null;

  return (
    <div className={styles.stage} data-step={step} aria-hidden="true">
      <span className={`${styles.orb} ${styles.orbA}`} />
      <span className={`${styles.orb} ${styles.orbB}`} />
      <div className={styles.scene}>
        <Scene c={c} />
      </div>
    </div>
  );
}
