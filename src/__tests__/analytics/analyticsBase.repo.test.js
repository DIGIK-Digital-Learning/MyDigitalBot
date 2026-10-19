import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Estado partilhado com o cliente Supabase falso.
 *
 * Usamos vi.hoisted porque o vi.mock abaixo é içado para o topo do ficheiro
 * e precisa deste objeto já inicializado quando a fábrica corre.
 */
const state = vi.hoisted(() => ({
  rows: [],
  maxRows: 1000,
  requests: [],
  error: null,
  // Simula o caso em que o PostgREST não devolve a contagem.
  countIsNull: false,
}));

/**
 * Cliente Supabase falso.
 *
 * O ponto importante é imitar o comportamento real do PostgREST:
 * quando pedimos mais linhas do que o "Max rows" do projeto,
 * ele devolve menos SEM dar erro. É esse silêncio que o fetchRows
 * paginado tem de aguentar.
 */
vi.mock("@/lib/db/readAccess", () => ({
  getScopedReadClient: () => ({
    from(table) {
      const q = { table, filters: [], order: null, range: null, head: false };

      const builder = {
        select(columns, options = {}) {
          q.columns = columns;
          q.head = Boolean(options.head);
          q.count = options.count ?? null;
          return builder;
        },
        eq(column, value) {
          q.filters.push(["eq", column, value]);
          return builder;
        },
        not(column, operator, value) {
          q.filters.push(["not", column, operator, value]);
          return builder;
        },
        order(column, options = {}) {
          q.order = { column, ...options };
          return builder;
        },
        range(from, to) {
          q.range = { from, to };
          return builder;
        },
        then(resolve, reject) {
          state.requests.push({ ...q });

          if (state.error) {
            return Promise.resolve({
              data: null,
              count: null,
              error: state.error,
            }).then(resolve, reject);
          }

          // head: true devolve só a contagem, sem linhas.
          // O Max rows não afeta contagens.
          if (q.head) {
            return Promise.resolve({
              data: null,
              count: state.rows.length,
              error: null,
            }).then(resolve, reject);
          }

          const { from, to } = q.range ?? { from: 0, to: state.rows.length - 1 };

          // Aqui está o comportamento que interessa: pedimos `requested`
          // linhas, mas o servidor nunca serve mais do que maxRows.
          const requested = to - from + 1;
          const served = Math.min(requested, state.maxRows);

          return Promise.resolve({
            data: state.rows.slice(from, from + served),
            count: state.countIsNull ? null : state.rows.length,
            error: null,
          }).then(resolve, reject);
        },
      };

      return builder;
    },
  }),
}));

import {
  fetchExportRows as fetchRows,
  countRows,
} from "@/lib/repos/analytics/analyticsBase.repo";

function makeRows(total) {
  return Array.from({ length: total }, (_, index) => ({
    id: index + 1,
    name: `linha ${index + 1}`,
  }));
}

beforeEach(() => {
  state.rows = [];
  state.maxRows = 1000;
  state.requests = [];
  state.error = null;
  state.countIsNull = false;
});

describe("fetchRows", () => {
  it("devolve todas as linhas quando cabem numa página", async () => {
    state.rows = makeRows(10);

    const result = await fetchRows("user", "id, name");

    expect(result).toHaveLength(10);
    expect(result[0].id).toBe(1);
    expect(result[9].id).toBe(10);
  });

  it("devolve tudo acima do Max rows — o bug que motivou a correção", async () => {
    state.rows = makeRows(2500);
    state.maxRows = 1000;

    const result = await fetchRows("message", "id");

    // Sem paginação isto devolvia 1000 em silêncio.
    expect(result).toHaveLength(2500);
    expect(result.at(-1).id).toBe(2500);
  });

  it("não perde linhas quando o Max rows é menor que o PAGE_SIZE", async () => {
    state.rows = makeRows(1200);
    state.maxRows = 500;

    const result = await fetchRows("message", "id");

    // Avançar por PAGE_SIZE em vez de pelo recebido saltaria 500 linhas.
    expect(result).toHaveLength(1200);
    expect(result.map((row) => row.id)).toEqual(
      Array.from({ length: 1200 }, (_, i) => i + 1),
    );
  });

  it("não devolve duplicados nem falhas na sequência", async () => {
    state.rows = makeRows(3300);

    const result = await fetchRows("tracked_link_event", "id");
    const ids = result.map((row) => row.id);

    expect(new Set(ids).size).toBe(3300);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("pede sempre uma ordem estável", async () => {
    state.rows = makeRows(1500);

    await fetchRows("user", "id");

    expect(state.requests.length).toBeGreaterThan(1);
    state.requests.forEach((request) => {
      expect(request.order).toEqual({ column: "id", ascending: true });
    });
  });

  it("aceita outra coluna de ordenação", async () => {
    state.rows = makeRows(5);

    await fetchRows("message", "created_at", undefined, {
      orderColumn: "created_at",
    });

    expect(state.requests[0].order.column).toBe("created_at");
  });

  it("avança o intervalo página a página", async () => {
    state.rows = makeRows(2500);

    await fetchRows("message", "id");

    const ranges = state.requests.map((request) => request.range);

    expect(ranges[0]).toEqual({ from: 0, to: 999 });
    expect(ranges[1]).toEqual({ from: 1000, to: 1999 });
    expect(ranges[2]).toEqual({ from: 2000, to: 2999 });
  });

  it("continua a aplicar os filtros de quem chama", async () => {
    state.rows = makeRows(5);

    await fetchRows("message", "id", (q) => q.eq("organization_id", 7));

    expect(state.requests[0].filters).toContainEqual([
      "eq",
      "organization_id",
      7,
    ]);
  });

  it("rebenta em vez de truncar em silêncio quando passa a trava", async () => {
    // 1 linha por página obriga a mais páginas do que o MAX_PAGES permite.
    state.rows = makeRows(250);
    state.maxRows = 1;

    await expect(fetchRows("message", "id")).rejects.toThrow(/mais de/);
  });

  it("propaga o erro do Supabase com o nome da tabela", async () => {
    state.error = { message: "permission denied" };

    await expect(fetchRows("automation_run", "id")).rejects.toThrow(
      "automation_run: permission denied",
    );
  });

  it("faz um só pedido quando tudo cabe na primeira página", async () => {
    state.rows = makeRows(6);

    await fetchRows("automation_rule", "id");

    // Sem a contagem seriam dois: um com as linhas e outro vazio só
    // para confirmar que não havia mais.
    expect(state.requests).toHaveLength(1);
  });

  it("pede a contagem só na primeira página", async () => {
    state.rows = makeRows(2500);

    await fetchRows("message", "id");

    expect(state.requests[0].count).toBe("exact");
    state.requests.slice(1).forEach((request) => {
      expect(request.count).toBeNull();
    });
  });

  it("para pela página vazia se a contagem não vier", async () => {
    state.rows = makeRows(10);
    state.countIsNull = true;

    const result = await fetchRows("user", "id");

    // A rede de segurança tem de continuar a funcionar: sem count,
    // voltamos a depender da página vazia para saber que acabámos.
    expect(result).toHaveLength(10);
    expect(state.requests).toHaveLength(2);
  });
});

describe("countRows", () => {
  it("continua a fazer um único pedido, sem paginar", async () => {
    state.rows = makeRows(5000);

    const total = await countRows("message", (q) =>
      q.eq("organization_id", 7),
    );

    expect(total).toBe(5000);
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0].head).toBe(true);
  });
});
