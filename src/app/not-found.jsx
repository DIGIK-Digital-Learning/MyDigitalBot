// app/not-found.jsx
import styles from "./[locale]/(auth)/login/login.module.css";
import { inter } from "./fonts/inter";
import NotFoundAction from "./NotFoundAction";

// Sem headers()/cookies() aqui: o not-found da raiz faz parte da árvore de
// todas as páginas, e usá-los tornava o site inteiro dinâmico. A língua e a
// sessão para o botão decidem-se no browser (NotFoundAction).
export default function NotFound() {
  // O layout raiz só devolve children (o <html> está em [locale]/layout.js),
  // por isso esta página, que fica fora do [locale], traz o seu.
  return (
    <html lang="pt" className={inter.variable}>
      <body>
        <main className={styles.page}>
          <h1 className={styles.brand}>MyDigitalBot</h1>
          <section className={styles.card}>
            <h2 className={styles.title}>Página não encontrada</h2>
            <p className={styles.message} style={{ marginBottom: "0.75rem" }}>
              Ups! A página que procura não existe ou foi movida.
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "center",
              }}
            >
              <NotFoundAction className={styles.btnPrimary} />
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
