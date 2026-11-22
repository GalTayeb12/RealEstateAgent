"use client";
/**
 * Developer deal pipeline (Concept C V2 funnel + timeline) computed from the developer's real
 * offers and group requests. The prototype's "viewed / walked / advisor" funnel needs analytics
 * that are not tracked, so it is deliberately not shown here; this funnel covers the deal stages
 * that exist in the data: offer, developer signed, buyer signed, deposit paid.
 */
import "./dev-pipeline.css";
import { useI18n } from "@/components/LocaleProvider";

export interface PipelineOffer {
  id: string; offeredPrice: number; depositPaid: boolean; buyerSignature: string | null;
  developerSignature: string | null; createdAt: string; unitType: { unitLabel: string; project: { name: string } };
}
export interface PipelineGroup {
  id: string; memberCount: number; status: string; createdAt: string; unitType: { unitLabel: string; project: { name: string } };
}

export default function DevPipeline({ offers, groups }: { offers: PipelineOffer[]; groups: PipelineGroup[] }) {
  const { locale, formatPrice } = useI18n();
  const he = locale === "he";
  if (offers.length === 0 && groups.length === 0) return null;

  const stages: [string, number][] = [
    [he ? "הצעות שהוגשו" : "Offers made", offers.length],
    [he ? "נחתמו על ידך" : "Signed by you", offers.filter((o) => o.developerSignature).length],
    [he ? "נחתמו על ידי הקונה" : "Signed by buyer", offers.filter((o) => o.buyerSignature).length],
    [he ? "מקדמה שולמה" : "Deposit paid", offers.filter((o) => o.depositPaid).length],
  ];
  const top = Math.max(1, stages[0][1]);

  type Ev = { id: string; at: number; title: string; meta: string; tone: "gold" | "teal" };
  const date = (iso: string) => new Date(iso).toLocaleDateString(he ? "he-IL" : "en-GB", { day: "numeric", month: "short" });
  const events: Ev[] = [
    ...offers.map((o): Ev => ({
      id: "o" + o.id, at: +new Date(o.createdAt), tone: "gold",
      title: `${he ? "הצעה" : "Offer"} · ${o.unitType.project.name} — ${o.unitType.unitLabel}`,
      meta: `${formatPrice(o.offeredPrice)}${o.depositPaid ? ` · ${he ? "מקדמה שולמה" : "deposit paid"}` : o.buyerSignature && o.developerSignature ? ` · ${he ? "נחתם" : "signed"}` : ""}`,
    })),
    ...groups.map((g): Ev => ({
      id: "g" + g.id, at: +new Date(g.createdAt), tone: "teal",
      title: `${he ? "בקשת קבוצה" : "Group request"} · ${g.unitType.project.name} — ${g.unitType.unitLabel}`,
      meta: `${g.memberCount} ${he ? "חברים" : g.memberCount === 1 ? "member" : "members"}`,
    })),
  ].sort((a, b) => b.at - a.at).slice(0, 8);

  return (
    <section className="dpl" aria-label={he ? "צינור עסקאות" : "Deal pipeline"}>
      <div className="dpl-card">
        <h3>{he ? "משפך עסקאות" : "Deal funnel"}</h3>
        <div className="dpl-fun">
          {stages.map(([n, v]) => (
            <div key={n}>
              <span>{n}<b className="num">{v}</b></span>
              <i style={{ ["--w" as string]: `${Math.round((v / top) * 100)}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="dpl-card">
        <h3>{he ? "פעילות אחרונה" : "Recent activity"}</h3>
        <ol className="dpl-tl">
          {events.map((e) => (
            <li key={e.id} data-tone={e.tone}>
              <b>{e.title}</b>
              <small>{e.meta} · {date(new Date(e.at).toISOString())}</small>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
