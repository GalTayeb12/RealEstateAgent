"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import "./cinematic.css";
import { isCinematicPath } from "@/lib/theme";

/** Wraps the routed content and switches it to the Concept C theme on opted-in routes. */
export default function ThemeScope({ children }: { children: ReactNode }) {
  const cin = isCinematicPath(usePathname());
  return <div className={`flex-1 flex flex-col min-h-0${cin ? " cin" : ""}`}>{children}</div>;
}
