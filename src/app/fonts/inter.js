import localFont from "next/font/local";

// Inter variável reduzida a Latin + Latin Extended-A + pontuação, setas,
// símbolos matemáticos e €: 126 KB em vez dos 344 KB do ficheiro completo
// (InterVariable.woff2, guardado ao lado para gerar novos subsets).
// Gerado com:
//   pyftsubset InterVariable.woff2 --layout-features='*' --flavor=woff2
//     --unicodes="U+0000-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,
//     U+02DC,U+0300-0301,U+0303,U+0327,U+2000-206F,U+2074,U+20AC,U+2122,
//     U+2190-21FF,U+2200-22FF,U+25A0-25FF,U+2713,U+2715,U+FEFF,U+FFFD"
//     --output-file=InterVariable-latin.woff2
// Caracteres fora disto (ex.: emoji, cirílico) caem para a fonte do sistema.
export const inter = localFont({
  src: [
    {
      path: "./InterVariable-latin.woff2",
      style: "normal",
      weight: "100 900",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});
