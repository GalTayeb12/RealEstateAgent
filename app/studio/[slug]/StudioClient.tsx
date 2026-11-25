"use client";

/** WebGL only, so the studio is client-rendered (`ssr: false` must live in a Client Component). */
import dynamic from "next/dynamic";
import type { ProjectExperience } from "@/lib/experience/types";

const StudioApp = dynamic(() => import("@/components/studio/StudioApp"), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "#0b0b0c" }} />,
});

export default function StudioClient({ experience }: { experience: ProjectExperience }) {
  return <StudioApp experience={experience} />;
}
