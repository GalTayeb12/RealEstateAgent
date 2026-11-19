"use client";

/**
 * /tour/yarkon-walk — first-person walkthrough of the Seed Yarkon 4-room
 * apartment (Cycles-baked lighting, three.js). WebGL only, so the scene is
 * client-rendered (`ssr: false` must live in a Client Component).
 */
import dynamic from "next/dynamic";

const ApartmentWalk = dynamic(() => import("@/components/walk/ApartmentWalk"), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "#0b0b0c" }} />,
});

export default function YarkonWalkPage() {
  return <ApartmentWalk />;
}
