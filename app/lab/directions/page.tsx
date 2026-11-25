import { notFound } from "next/navigation";
import Directions from "./Directions";
import { directionFontVars } from "./fonts";
import "./directions.css";

export const metadata = { title: "Haveniq — Stage 1 directions", robots: { index: false } };

/** Redesign stage 1: three visual directions to choose from. Local dev only. */
export default function DirectionsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className={directionFontVars} dir="rtl" lang="he">
      <Directions />
    </div>
  );
}
