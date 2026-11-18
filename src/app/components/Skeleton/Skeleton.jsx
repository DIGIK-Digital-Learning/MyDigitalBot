"use client";

import { useTranslations } from "next-intl";

import styles from "./Skeleton.module.css";

/*
 * Skeletons de carregamento, iguais em toda a app (#272).
 *
 * As páginas montam o skeleton com as suas próprias classes de layout
 * (secções, grelhas, cartões) e põem barras `Skeleton` no lugar dos textos
 * e números, para o carregamento ter a forma do conteúdo que vai aparecer.
 * Para tabelas e páginas de lista há peças prontas (`SkeletonTable`,
 * `SkeletonPage`).
 */

// Larguras das barras das tabelas, para as linhas não ficarem todas iguais.
const WIDTHS = ["72%", "56%", "64%", "48%", "60%", "52%", "68%"];

function widthFor(row, column) {
  return WIDTHS[(row * 3 + column) % WIDTHS.length];
}

function range(count) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => index);
}

/**
 * Barra animada no lugar de um texto, número ou imagem. Por omissão tem a
 * altura de uma linha de texto e a largura toda.
 */
export function Skeleton({ width, height, radius, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.block} ${className}`.trim()}
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/**
 * Zona a carregar: diz aos leitores de ecrã que está a carregar e esconde as
 * barras. Um por zona; `className` é o layout da página (grelha, cartão…).
 */
export function SkeletonStatus({ className, label, children }) {
  const translation = useTranslations("Common");
  const text = label ?? translation("loading");

  return (
    <div
      className={className}
      role="status"
      aria-busy="true"
      aria-label={text}
    >
      <span className={styles.srOnly}>{text}</span>
      {children}
    </div>
  );
}

/** Parágrafo a carregar: `lines` linhas, a última mais curta. */
export function SkeletonText({ lines = 2, className = "" }) {
  return (
    <span className={`${styles.text} ${className}`.trim()} aria-hidden="true">
      {range(lines).map((line) => (
        <Skeleton
          key={line}
          width={line === lines - 1 && lines > 1 ? "60%" : undefined}
        />
      ))}
    </span>
  );
}

/**
 * Só as linhas de uma tabela a carregar, sem cartão nem `SkeletonStatus`,
 * para montar dentro de um skeleton maior.
 */
export function SkeletonRows({ rows = 6, columns = 4, header = true }) {
  const template =
    columns > 1
      ? `minmax(0, 2fr) repeat(${columns - 1}, minmax(0, 1fr))`
      : "minmax(0, 1fr)";

  return (
    <div style={{ "--skeleton-columns": template }}>
      {header ? (
        <div className={`${styles.row} ${styles.headRow}`}>
          {range(columns).map((column) => (
            <Skeleton key={column} width={column ? "45%" : "30%"} height={10} />
          ))}
        </div>
      ) : null}

      {range(rows).map((row) => (
        <div key={row} className={styles.row}>
          {range(columns).map((column) =>
            column === 0 ? (
              <span key={column} className={styles.text}>
                <Skeleton width={widthFor(row, column)} />
                <Skeleton width="38%" height={10} />
              </span>
            ) : (
              <Skeleton key={column} width={widthFor(row, column)} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Tabela a carregar, num cartão como as tabelas da app: o cabeçalho e
 * `rows` linhas de `columns` colunas. A primeira coluna é a mais larga e tem
 * duas linhas (nome e detalhe). Com `card={false}` fica sem o cartão, para
 * quando a página já tem o seu à volta da tabela.
 */
export function SkeletonTable({
  rows = 6,
  columns = 4,
  header = true,
  card = true,
  className = "",
  label,
}) {
  return (
    <SkeletonStatus
      className={`${card ? styles.card : ""} ${className}`.trim() || undefined}
      label={label}
    >
      <SkeletonRows rows={rows} columns={columns} header={header} />
    </SkeletonStatus>
  );
}

/** Título e descrição de uma página; com `action`, o botão à direita. */
export function SkeletonHeader({ action = false }) {
  return (
    <div className={styles.header}>
      <span className={styles.headerCopy}>
        <Skeleton width={240} height={30} radius={8} />
        <Skeleton width={360} />
      </span>
      {action ? <Skeleton width={150} height={42} radius={12} /> : null}
    </div>
  );
}

/** Cartões de números (ex.: "Total de grupos"). */
export function SkeletonStats({ count = 3, className = "" }) {
  return (
    <div className={`${styles.stats} ${className}`.trim()}>
      {range(count).map((index) => (
        <div key={index} className={`${styles.card} ${styles.statCard}`}>
          <Skeleton width="55%" height={10} />
          <Skeleton width="35%" height={26} radius={8} />
        </div>
      ))}
    </div>
  );
}

/**
 * Página de detalhe a carregar (pergunta, link, grupo): o cartão do topo com
 * o título, o detalhe e `stats` números, e por baixo a tabela. Com `page`,
 * tem as margens de uma página inteira (para os loading.jsx).
 */
export function SkeletonDetail({
  stats = 3,
  columns = 4,
  rows = 5,
  page = false,
  label,
}) {
  return (
    <SkeletonStatus
      className={`${styles.stack} ${page ? styles.page : ""}`.trim()}
      label={label}
    >
      <div className={`${styles.card} ${styles.detailCard}`}>
        <Skeleton width="50%" height={26} radius={8} />
        <Skeleton width="30%" />
        {stats ? (
          <div className={styles.detailStats}>
            {range(stats).map((index) => (
              <span key={index} className={styles.detailStat}>
                <Skeleton width="70%" height={10} />
                <Skeleton width="50%" height={24} radius={8} />
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.card}>
        <SkeletonRows rows={rows} columns={columns} />
      </div>
    </SkeletonStatus>
  );
}

/**
 * Página de lista inteira a carregar: cabeçalho, cartões de números
 * (`stats`), pesquisa e tabela. É o que as rotas mostram enquanto a página
 * abre (`loading.jsx`).
 */
export function SkeletonPage({
  stats = 0,
  toolbar = true,
  action = false,
  columns = 4,
  rows = 6,
}) {
  return (
    <SkeletonStatus className={styles.page}>
      <SkeletonHeader action={action} />
      {stats ? <SkeletonStats count={stats} /> : null}
      {toolbar ? (
        <div className={styles.toolbar}>
          <Skeleton width={360} height={42} radius={12} />
        </div>
      ) : null}
      <div className={styles.card}>
        <SkeletonRows rows={rows} columns={columns} />
      </div>
    </SkeletonStatus>
  );
}
