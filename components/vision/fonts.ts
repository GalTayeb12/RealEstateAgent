import { Bellefair, Frank_Ruhl_Libre, Noto_Serif_Hebrew } from "next/font/google";

export const bellefair = Bellefair({
  weight: "400",
  subsets: ["latin", "hebrew"],
  variable: "--font-bellefair",
  display: "swap",
});

export const frankRuhl = Frank_Ruhl_Libre({
  weight: ["400", "500", "700"],
  subsets: ["latin", "hebrew"],
  variable: "--font-frank",
  display: "swap",
});

export const notoSerifHebrew = Noto_Serif_Hebrew({
  weight: ["400", "600"],
  subsets: ["latin", "hebrew"],
  variable: "--font-noto-serif-he",
  display: "swap",
});

export const visionFontClass = `${bellefair.variable} ${frankRuhl.variable} ${notoSerifHebrew.variable}`;
