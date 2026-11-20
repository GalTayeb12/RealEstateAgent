"use client";

/** WebGL only, so the walk is client-rendered (`ssr: false` must live in a Client Component). */
import dynamic from "next/dynamic";
import type { ProjectExperience } from "@/lib/experience/types";

const ApartmentWalk = dynamic(() => import("@/components/walk/ApartmentWalk"), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "#0b0b0c" }} />,
});

export default function WalkClient({ experience }: { experience: ProjectExperience }) {
  return <ApartmentWalk experience={experience} />;
}
