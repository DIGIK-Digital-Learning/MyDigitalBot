// Barra de topo e barra lateral do Microsoft Teams (versão nova, tema claro),
// para as conversas de exemplo em portátil/tablet/iMac.
// Ícones: Fluent UI System Icons da Microsoft (licença MIT,
// @fluentui/svg-icons 1.1.346), os mesmos que o Teams usa.

const ICONS = {
  activity: [
    "0 0 24 24",
    "M12 2a7.5 7.5 0 0 1 7.5 7.25v4.35l1.38 3.15a1.25 1.25 0 0 1-1.15 1.75H15a3 3 0 0 1-6 .18v-.18H4.27a1.25 1.25 0 0 1-1.14-1.75L4.5 13.6V9.5C4.5 5.35 7.85 2 12 2m1.5 16.5h-3a1.5 1.5 0 0 0 3 .15zM12 3.5c-3.32 0-6 2.67-6 6v4.4L4.66 17h14.7L18 13.9V9.29a6 6 0 0 0-6-5.78",
  ],
  chat: [
    "0 0 24 24",
    "M12 2a10 10 0 1 1-4.59 18.89L3.6 21.96a1.25 1.25 0 0 1-1.54-1.54l1.06-3.83A10 10 0 0 1 12 2m0 1.5a8.5 8.5 0 0 0-7.43 12.64l.15.27-1.1 3.98 3.98-1.11.27.15A8.5 8.5 0 1 0 12 3.5M8.75 13h4.5a.75.75 0 0 1 .1 1.5h-4.6a.75.75 0 0 1-.1-1.5zh4.5zm0-3.5h6.5a.75.75 0 0 1 .1 1.5h-6.6a.75.75 0 0 1-.1-1.5zh6.5z",
  ],
  chatActive: [
    "0 0 24 24",
    "M12 2a10 10 0 1 1-4.64 18.86l-4.3 1.12a.85.85 0 0 1-1.03-1.04l1.11-4.29A10 10 0 0 1 12 2m1.25 11h-4.6a.75.75 0 0 0 0 1.5h4.7a.75.75 0 0 0 0-1.5zm2-3.5h-6.6a.75.75 0 0 0 0 1.5h6.7a.75.75 0 0 0 0-1.5z",
  ],
  teams: [
    "0 0 24 24",
    "M14.75 10c.97 0 1.75.78 1.75 1.75v4.75a4.5 4.5 0 0 1-9 0v-4.75c0-.97.79-1.75 1.75-1.75zm0 1.5h-5.5a.25.25 0 0 0-.25.25v4.75a3 3 0 0 0 6 0v-4.75a.25.25 0 0 0-.25-.25m-11-1.5h3.38q-.53.63-.62 1.5H3.75a.25.25 0 0 0-.25.25V15a2.5 2.5 0 0 0 3.08 2.43q.13.76.45 1.43Q6.55 19 6 19a4 4 0 0 1-4-4v-3.25c0-.97.78-1.75 1.75-1.75m13.12 0h3.38c.97 0 1.75.78 1.75 1.75V15a4 4 0 0 1-5.03 3.87q.32-.68.46-1.44.27.07.57.07a2.5 2.5 0 0 0 2.5-2.5v-3.25a.25.25 0 0 0-.25-.25h-2.76a2.7 2.7 0 0 0-.62-1.5M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6m6.5 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5m-13 0a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5m6.5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m6.5 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2m-13 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2",
  ],
  calendar: [
    "0 0 24 24",
    "M17.75 3C19.55 3 21 4.46 21 6.25v11.5c0 1.8-1.46 3.25-3.25 3.25H6.25A3.25 3.25 0 0 1 3 17.75V6.25C3 4.45 4.46 3 6.25 3zm1.75 5.5h-15v9.25c0 .97.78 1.75 1.75 1.75h11.5c.97 0 1.75-.78 1.75-1.75zm-11.75 6a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m4.25 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m-4.25-4a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m4.25 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m4.25 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m1.5-6H6.25c-.97 0-1.75.78-1.75 1.75V7h15v-.75c0-.97-.78-1.75-1.75-1.75",
  ],
  calls: [
    "0 0 24 24",
    "m7.06 2.42 1.16-.35c1.33-.4 2.74.24 3.3 1.5l.9 2a2.75 2.75 0 0 1-.63 3.15L10.3 10.1a.3.3 0 0 0-.08.16q-.07.62.85 2.24.68 1.17 1.2 1.64c.25.21.38.26.44.24l2-.61a2.75 2.75 0 0 1 3.04 1.02l1.28 1.77c.8 1.12.66 2.66-.34 3.6l-.88.85a3.8 3.8 0 0 1-3.59.89q-4.12-1.17-7.44-6.93T4.51 5.07a3.8 3.8 0 0 1 2.55-2.65m.43 1.43c-.75.23-1.33.83-1.53 1.6q-.91 3.5 2.12 8.78 3.07 5.28 6.54 6.23c.76.21 1.58.01 2.15-.53l.9-.84c.45-.43.51-1.13.15-1.64l-1.29-1.77a1.25 1.25 0 0 0-1.37-.47l-2.02.62c-1.17.35-2.23-.6-3.37-2.57Q8.6 11.28 8.73 10.1q.08-.64.55-1.09l1.5-1.39c.38-.37.5-.94.28-1.43l-.9-2c-.26-.58-.9-.87-1.5-.69z",
  ],
  more: [
    "0 0 24 24",
    "M7.75 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0m6 0a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0M18 13.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5",
  ],
  apps: [
    "0 0 24 24",
    "M10.5 3c1.24 0 2.25 1 2.25 2.25v6h6c1.24 0 2.25 1 2.25 2.25v5.25c0 1.24-1 2.25-2.25 2.25H5.25C4.01 21 3 20 3 18.75V5.25C3 4.01 4 3 5.25 3zm.75 9.75H4.5v6c0 .41.34.75.75.75h6zm7.5 0h-6v6.75h6c.41 0 .75-.34.75-.75V13.5a.75.75 0 0 0-.75-.75M10.5 4.5H5.25a.75.75 0 0 0-.75.75v6h6.75v-6a.75.75 0 0 0-.75-.75M17.9 2h.1c.38 0 .7.28.74.65l.01.1v2.5h2.5c.38 0 .7.28.74.65L22 6c0 .38-.28.7-.65.74l-.1.01h-2.5v2.5c0 .38-.28.7-.65.74L18 10a.75.75 0 0 1-.74-.65l-.01-.1v-2.5h-2.5a.75.75 0 0 1-.74-.65L14 6c0-.38.28-.7.65-.74l.1-.01h2.5v-2.5c0-.38.28-.7.65-.74",
  ],
  search: [
    "0 0 20 20",
    "M13.73 14.44a6.5 6.5 0 1 1 .7-.7l3.42 3.4a.5.5 0 0 1-.63.77l-.07-.06zm-.71-.71A5.5 5.5 0 0 0 15 9.5a5.5 5.5 0 1 0-1.98 4.23",
  ],
  back: [
    "0 0 20 20",
    "M12.35 15.85a.5.5 0 0 1-.7 0L6.16 10.4a.55.55 0 0 1 0-.78l5.49-5.46a.5.5 0 1 1 .7.7L7.2 10l5.16 5.15c.2.2.2.5 0 .7",
  ],
  forward: [
    "0 0 20 20",
    "M7.65 4.15c.2-.2.5-.2.7 0l5.49 5.46c.21.22.21.57 0 .78l-5.49 5.47a.5.5 0 0 1-.7-.71L12.8 10 7.65 4.85a.5.5 0 0 1 0-.7",
  ],
};

// width/height fixos no próprio SVG: sem eles, se o CSS ainda não carregou
// (ex.: hot reload), o ícone ocupa o ecrã todo. O CSS pode depois ajustar.
function FluentIcon({ name, className, size = 20 }) {
  const [viewBox, d] = ICONS[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

const RAIL = ["activity", "chat", "teams", "calendar", "calls"];

/** Barra de topo da janela: semáforos do macOS, setas, pesquisa e avatar. */
export function TeamsTitleBar({ styles, labels, trafficLights }) {
  return (
    <div className={styles.teamsTop} aria-hidden="true">
      <span className={styles.teamsTopLeft}>
        {trafficLights ? (
          <span className={styles.trafficLights}>
            <i />
            <i />
            <i />
          </span>
        ) : null}
        <FluentIcon name="back" className={styles.teamsTopIcon} size={15} />
        <FluentIcon name="forward" className={styles.teamsTopIcon} size={15} />
      </span>
      <span className={styles.teamsSearch}>
        <FluentIcon name="search" className={styles.teamsTopIcon} size={15} />
        {labels.search}
      </span>
      <span className={styles.teamsTopRight}>
        <FluentIcon name="more" className={styles.teamsTopIcon} size={15} />
        <span className={styles.teamsMe} />
      </span>
    </div>
  );
}

/** Barra lateral, só ícones: Atividade, Chat (ativo), Equipas, Calendário,
 *  Chamadas, mais e Aplicações. */
export function TeamsRail({ styles }) {
  return (
    <nav className={styles.rail} aria-hidden="true">
      {RAIL.map((id) => {
        const active = id === "chat";
        return (
          <span
            key={id}
            className={`${styles.railItem} ${active ? styles.railActive : ""}`}
          >
            <FluentIcon
              name={active ? "chatActive" : id}
              className={styles.railIcon}
            />
          </span>
        );
      })}
      <span className={styles.railItem}>
        <FluentIcon name="more" className={styles.railIcon} />
      </span>
      <span className={`${styles.railItem} ${styles.railApps}`}>
        <FluentIcon name="apps" className={styles.railIcon} />
      </span>
    </nav>
  );
}
