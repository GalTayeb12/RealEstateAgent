"use client";

import { useMemo } from "react";
import { planSvg } from "@/lib/twin/svg";
import type { PlanTwin } from "@/lib/twin/schema";
import type { Lang } from "./planText";

/**
 * The architectural drawing of the twin (lib/twin/svg), with issue refs and the
 * current selection outlined in red. planSvg escapes all text it writes.
 */
export function PlanDrawing({ twin, lang, highlight }: { twin: PlanTwin; lang: Lang; highlight: string[] }) {
  const html = useMemo(
    () => planSvg(twin, { lang, highlight }).replace("<svg ", '<svg style="width:100%;height:auto;display:block" role="img" '),
    [twin, lang, highlight],
  );
  return (
    <div
      data-testid="plan-drawing"
      style={{ border: "1px solid var(--qp-border)", borderRadius: "0.625rem", overflow: "hidden", background: "var(--c-card,#fbfaf7)" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
