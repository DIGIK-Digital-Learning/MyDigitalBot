import { getScopedReadClient } from "@/lib/db/readAccess";

/**
 * Conta linhas de uma tabela da Supabase.
 *
 * Esta função é usada quando só queremos saber "quantos registos existem",
 * sem precisar de ir buscar os dados completos.
 *
 * Exemplo:
 * contar quantas mensagens existem numa organização.
 */
export async function countRows(table, applyFilters) {
  /**
   * Vai buscar o cliente da sessão da Supabase.
   *
   * Este cliente usa a sessão autenticada e respeita o RLS.
   */
  const supabaseAdmin = getScopedReadClient();

  /**
   * Cria a query base para contar linhas.
   *
   * select("*", { count: "exact", head: true })
   *
   * count: "exact"
   * pede à Supabase a contagem exata.
   *
   * head: true
   * significa que não queremos receber os dados,
   * só queremos a contagem.
   */
  let query = supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true });

  /**
   * Se for passada uma função de filtros,
   * aplicamos essa função à query.
   *
   * Exemplo:
   * (q) => q.eq("organization_id", orgId)
   */
  if (typeof applyFilters === "function") {
    query = applyFilters(query);
  }

  /**
   * Executa a query.
   *
   * count recebe o número de linhas encontradas.
   * error recebe algum erro, se a query falhar.
   */
  const { count, error } = await query;

  /**
   * Se houver erro na query,
   * lançamos uma mensagem com o nome da tabela.
   *
   * Isto ajuda a perceber rapidamente que tabela falhou.
   */
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  /**
   * Se count vier null ou undefined,
   * devolvemos 0 por segurança.
   */
  return count ?? 0;
}

/**
 * Vai buscar linhas de uma tabela da Supabase.
 *
 * Esta função é usada quando precisamos dos dados completos
 * e não apenas de uma contagem.
 *
 * Exemplo:
 * buscar links rastreados, utilizadores ou execuções de automação.
 */
export async function fetchRows(table, columns, applyFilters) {
  /**
   * Vai buscar o cliente da sessão da Supabase.
   */
  const supabaseAdmin = getScopedReadClient();

  /**
   * Cria a query base.
   *
   * table:
   * nome da tabela.
   *
   * columns:
   * colunas que queremos buscar.
   *
   * Exemplo:
   * "id, name, created_at"
   */
  let query = supabaseAdmin.from(table).select(columns);

  /**
   * Aplica filtros opcionais à query.
   *
   * Exemplo:
   * (q) => q.eq("organization_id", orgId)
   */
  if (typeof applyFilters === "function") {
    query = applyFilters(query);
  }

  /**
   * Executa a query.
   *
   * data recebe as linhas encontradas.
   * error recebe algum erro, se a query falhar.
   */
  const { data, error } = await query;

  /**
   * Se houver erro, lançamos uma mensagem
   * indicando a tabela onde aconteceu o problema.
   */
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  /**
   * Se data vier null ou undefined,
   * devolvemos array vazio para evitar erros no resto do código.
   */
  return data ?? [];
}

/**
 * Fetches every matching row in server-sized pages. Use this for metrics that
 * must remain exact beyond PostgREST's configured max_rows limit.
 */
export async function fetchAllRows(
  table,
  columns,
  applyFilters,
  pageSize = 1000,
) {
  const supabaseAdmin = getScopedReadClient();
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabaseAdmin.from(table).select(columns);

    if (typeof applyFilters === "function") {
      query = applyFilters(query);
    }

    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}


/** Paginated reads for export; existing dashboard readers remain unchanged. */
const PAGE_SIZE = 1000;
const MAX_PAGES = 200;

export async function fetchExportRows(table, columns, applyFilters, options = {}, client = getScopedReadClient()) {
  const supabaseAdmin = client;

  // Sem ORDER BY, o Postgres não garante a mesma ordem entre queries.
  // A paginar sem ordem estável, receberíamos linhas repetidas numas
  // páginas e nunca receberíamos outras.
  const orderColumn = options.orderColumn ?? "id";

  const rows = [];
  let from = 0;
  let total = null;
  let countRequested = false;
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Só pedimos a contagem na primeira página: é ela que nos diz quando
    // parar. Repeti-la em cada página seria obrigar o Postgres a contar
    // a tabela toda de cada vez.
    const selectOptions = countRequested ? {} : { count: "exact" };

    let query = supabaseAdmin.from(table).select(columns, selectOptions);

    // Os filtros de quem chamou entram primeiro, para que a ordem
    // e o intervalo que aplicamos a seguir não sejam substituídos.
    if (typeof applyFilters === "function") {
      query = applyFilters(query);
    }

    query = query
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    const received = data ?? [];

    rows.push(...received);

    countRequested = true;

    // Guardamos a contagem só se ela vier mesmo. Cair para
    // received.length seria dizer "o total é o tamanho da primeira
    // página", que é exatamente o truncamento que viemos corrigir.
    if (total === null && typeof count === "number") {
      total = count;
    }

    // Chegámos ao fim quando já temos tudo o que a contagem anunciou.
    // Se a contagem não veio, voltamos a depender da página vazia:
    // uma otimização que remove a rede de segurança antiga não é uma
    // otimização, é uma troca.
    if (received.length === 0 && total !== null && rows.length < total) {
      throw new Error(`${table}: incomplete export (${rows.length}/${total} rows).`);
    }

    if ((total !== null && rows.length >= total) || received.length === 0) {
      complete = true;
      break;
    }

    // Avançamos pelo que recebemos, não por PAGE_SIZE.
    from += received.length;
  }

  // Se saímos do ciclo sem chegar ao fim, é melhor rebentar do que
  // devolver dados incompletos em silêncio — que é o bug que viemos corrigir.
  if (!complete) {
    throw new Error(
      `${table}: mais de ${MAX_PAGES * PAGE_SIZE} linhas; revê o filtro ou pagina no chamador.`,
    );
  }

  return rows;
}