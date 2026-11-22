import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Heebo, Rubik, IBM_Plex_Mono } from "next/font/google";
import "./lab.css";

/* DESIGN LAB — isolated exploration. Delete this whole folder (app/design-lab)
   and /design-lab in the repo root to remove. Not linked from the product. */
const frank = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], weight: ["300", "400", "500", "700"], variable: "--dl-frank", display: "swap" });
const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--dl-heebo", display: "swap" });
const rubik = Rubik({ subsets: ["hebrew", "latin"], variable: "--dl-rubik", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--dl-mono", display: "swap" });

export const metadata: Metadata = { title: "Haveniq — Design Lab (prototype)", robots: { index: false, follow: false } };

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <div className={`dl-root ${frank.variable} ${heebo.variable} ${rubik.variable} ${plex.variable}`}>{children}</div>;
}
