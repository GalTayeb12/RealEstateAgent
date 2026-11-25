import {
  Assistant,
  Frank_Ruhl_Libre,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Hebrew,
  Karantina,
  Rubik,
} from "next/font/google";

/* Stage-1 direction candidates only. Nothing outside /lab imports these. */

export const rubik = Rubik({
  weight: ["400", "500", "800"],
  subsets: ["latin", "hebrew"],
  variable: "--dx-rubik",
  display: "swap",
});

export const plexHebrew = IBM_Plex_Sans_Hebrew({
  weight: ["400", "500", "600"],
  subsets: ["latin", "hebrew"],
  variable: "--dx-plex",
  display: "swap",
});

export const karantina = Karantina({
  weight: ["400", "700"],
  subsets: ["latin", "hebrew"],
  variable: "--dx-karantina",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--dx-mono",
  display: "swap",
});

export const frankRuhl = Frank_Ruhl_Libre({
  weight: ["300", "500", "900"],
  subsets: ["latin", "hebrew"],
  variable: "--dx-frank",
  display: "swap",
});

export const assistant = Assistant({
  weight: ["400", "600"],
  subsets: ["latin", "hebrew"],
  variable: "--dx-assistant",
  display: "swap",
});

export const directionFontVars = [
  rubik.variable,
  plexHebrew.variable,
  karantina.variable,
  plexMono.variable,
  frankRuhl.variable,
  assistant.variable,
].join(" ");
