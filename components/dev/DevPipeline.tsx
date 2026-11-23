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
  const { locale, m, formatPrice } = useI18n();
  const he = locale === "he";
  if (offers.length === 0 && groups.length === 0) return null;

  const stages: [string, number][] = [
    [m.devPipeline.offersMade, offers.length],
    [m.devPipeline.signedByYou, offers.filter((o) => o.developerSignature).length],
    [m.devPipeline.signedByBuyer, offers.filter((o) => o.buyerSignature).length],
    [m.devPipeline.depositPaid, offers.filter((o) => o.depositPaid).length],
  ];
  const top = Math.max(1, stages[0][1]);

  type Ev = { id: string; at: number; title: string; meta: string; tone: "gold" | "teal" };
  const date = (iso: string) => new Date(iso).toLocaleDateString(m.devPipeline.enGb, { day: "numeric", month: "short" });
  const events: Ev[] = [
    ...offers.map((o): Ev => ({
      id: "o" + o.id, at: +new Date(o.createdAt), tone: "gold",
      title: `${m.devPipeline.offer} · ${o.unitType.project.name} — ${o.unitType.unitLabel}`,
      meta: `${formatPrice(o.offeredPrice)}${o.depositPaid ? ` · ${m.devPipeline.depositPaid2}` : o.buyerSignature && o.developerSignature ? ` · ${m.devPipeline.signed}` : ""}`,
    })),
    ...groups.map((g): Ev => ({
      id: "g" + g.id, at: +new Date(g.createdAt), tone: "teal",
      title: `${m.devPipeline.groupRequest} · ${g.unitType.project.name} — ${g.unitType.unitLabel}`,
      meta: `${g.memberCount} ${he ? "חברים" : g.memberCount === 1 ? "member" : "members"}`,
    })),
  ].sort((a, b) => b.at - a.at).slice(0, 8);

  return (
    <section className="dpl" aria-label={m.devPipeline.dealPipeline}>
      <div className="dpl-card">
        <h3>{m.devPipeline.dealFunnel}</h3>
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
        <h3>{m.devPipeline.recentActivity}</h3>
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
