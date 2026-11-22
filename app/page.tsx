import { Frank_Ruhl_Libre, IBM_Plex_Mono } from "next/font/google";
import Home from "@/components/home/Home";

/** Display serif + numeric mono for the cinematic homepage only. */
const serif = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], weight: ["300", "400", "500"], variable: "--hv-serif", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--hv-mono", display: "swap" });

export default function Page() {
  return (
    <div className={`${serif.variable} ${mono.variable}`}>
      <Home />
    </div>
  );
}
