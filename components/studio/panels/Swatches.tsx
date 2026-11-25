"use client";
import type { MaterialManifest } from "@/lib/studio/schema/catalog";

const CATALOG = "/studio/catalog";

/** Round material swatches: the albedo texture when there is one, the flat colour otherwise. */
export function Swatches({ materials, selectedId, onPick, locale }: {
  materials: MaterialManifest[]; selectedId?: string; onPick: (m: MaterialManifest) => void; locale: "he" | "en";
}) {
  return (
    <div className="st-swatches" role="listbox">
      {materials.map((m) => {
        const albedo = m.pbr.maps.albedo ? `${CATALOG}/${m.id}/${m.version}/${m.pbr.maps.albedo}` : null;
        return (
          <button
            key={m.id} type="button" role="option" aria-selected={m.id === selectedId} aria-label={m.name[locale]} title={m.name[locale]}
            className="st-swatch" data-on={m.id === selectedId || undefined}
            style={{ backgroundColor: m.pbr.baseColor, backgroundImage: albedo ? `url(${albedo})` : undefined }}
            onClick={() => onPick(m)}
          />
        );
      })}
    </div>
  );
}
