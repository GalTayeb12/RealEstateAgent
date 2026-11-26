"use client";

/**
 * "Add" drawer: search, style chips, category filter, preview cards. In replace
 * mode (opened from the property panel) it is limited to the selected piece's
 * category and picking a card swaps the piece in place.
 */
import { useMemo, useState } from "react";
import { categoriesOf, filterModels } from "@/lib/studio/design/options";
import { modelAssetUrl } from "@/lib/studio/catalog/assets";
import { STYLES, type ModelManifest, type Style } from "@/lib/studio/schema/catalog";
import { useStudio } from "../store";
import { useT } from "../useT";


function Card({ m, onPick, locale, t }: { m: ModelManifest; onPick: () => void; locale: "he" | "en"; t: (k: string) => string }) {
  const [broken, setBroken] = useState(false);
  const w = Math.round(m.dims.w * 100), d = Math.round(m.dims.d * 100), h = Math.round(m.dims.h * 100);
  return (
    <button type="button" className="st-card" onClick={onPick}>
      <span className="st-card__img">
        {!broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={modelAssetUrl(m.assets.preview)} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
        ) : (
          <span className="st-card__ph" aria-hidden>{t(`cat.${m.category}`).slice(0, 1)}</span>
        )}
      </span>
      <span className="st-card__name">{m.name[locale]}</span>
      <span className="st-card__meta">
        {m.sizing.mode === "modular" ? "" : `${w}×${d}×${h} cm`}
        {m.sizing.mode === "modular" && `${Math.round(m.dims.w * 100)}+ cm`}
      </span>
    </button>
  );
}

export default function CatalogDrawer() {
  const { t, locale } = useT();
  const open = useStudio((s) => s.catalogOpen);
  const replaceFor = useStudio((s) => s.replaceFor);
  const models = useStudio((s) => s.models);
  const doc = useStudio((s) => s.doc);
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<Style | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const replacing = replaceFor && doc ? doc.nodes[replaceFor] : null;
  const lockCategory = replacing && replacing.kind === "item" ? models.find((m) => m.id === replacing.catalog.id)?.category ?? null : null;
  const list = useMemo(
    () => filterModels(models, { query, style, category: lockCategory ?? category }, locale),
    [models, query, style, category, lockCategory, locale],
  );
  const categories = useMemo(() => categoriesOf(models), [models]);
  if (!open) return null;

  const pick = (m: ModelManifest) => {
    const s = useStudio.getState();
    if (replaceFor) s.replaceSelected(m); else s.addFromCatalog(m);
  };

  return (
    <aside className="st-ui st-drawer" aria-label={t("add")}>
      <header className="st-panel__head">
        <strong>{replaceFor ? t("replace") : t("addToRoom")}</strong>
        <button type="button" className="st-iconbtn" aria-label={t("close")} onClick={() => useStudio.getState().setCatalogOpen(false)}>✕</button>
      </header>
      <input className="st-search" type="search" value={query} placeholder={t("search")} onChange={(e) => setQuery(e.target.value)} aria-label={t("search")} />
      <div className="st-chips st-chips--scroll">
        <button type="button" className="st-chip" data-on={!style || undefined} onClick={() => setStyle(null)}>{t("allStyles")}</button>
        {STYLES.map((s) => (
          <button key={s} type="button" className="st-chip" data-on={style === s || undefined} onClick={() => setStyle(style === s ? null : s)}>{t(`style.${s}`)}</button>
        ))}
      </div>
      {!lockCategory && (
        <div className="st-chips st-chips--scroll">
          <button type="button" className="st-chip" data-on={!category || undefined} onClick={() => setCategory(null)}>{t("allCategories")}</button>
          {categories.map((c) => (
            <button key={c} type="button" className="st-chip" data-on={category === c || undefined} onClick={() => setCategory(category === c ? null : c)}>{t(`cat.${c}`)}</button>
          ))}
        </div>
      )}
      <div className="st-cards">
        {list.map((m) => <Card key={`${m.id}@${m.version}`} m={m} locale={locale} t={t} onPick={() => pick(m)} />)}
        {list.length === 0 && <p className="st-empty">{t("noResults")}</p>}
      </div>
    </aside>
  );
}
