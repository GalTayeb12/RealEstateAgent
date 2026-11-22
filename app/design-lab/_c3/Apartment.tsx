import { IMG, type Lang } from "../_c/content";
import { Rv, tx } from "../_c2/parts";

/** Quiet editorial section: one strong interior, a caption, no interaction. */
export default function Apartment({ lang }: { lang: Lang }) {
  const dir = lang === "he" ? "rtl" : "ltr";
  return (
    <section className="c2-sec c3-apt" id="apartment" dir={dir}>
      <div className="c3-apt-head">
        <Rv><span className="eyebrow">{tx(lang, "הדירה", "The apartment")}</span></Rv>
        <Rv delay={100}><h2 className="c2-h2">{tx(lang, "להרגיש בבית לפני שמבקרים.", "Feel at home before you visit.")}</h2></Rv>
        <Rv delay={200}><p className="c2-lede">{tx(lang, "אור, חומרים ונפח, כפי שהם באמת. מספיק כדי להבין אם זה הבית שלכם, עוד לפני הביקור הראשון.", "Light, materials and volume, as they truly are. Enough to know whether it is your home before the first visit.")}</p></Rv>
      </div>
      <Rv className="c3-apt-fig" delay={150}>
        <figure>
          <div className="im"><img src={IMG.living} alt={tx(lang, "סלון בדירה לדוגמה, הדמיה", "Living room of a sample apartment, rendering")} /></div>
          <figcaption><span className="eyebrow">{tx(lang, "סלון · דירה לדוגמה", "Living room · sample apartment")}</span><span className="eyebrow">{tx(lang, "הדמיה להמחשה", "Illustrative rendering")}</span></figcaption>
        </figure>
      </Rv>
    </section>
  );
}
