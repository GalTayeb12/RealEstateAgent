export type Lang = "he" | "en";
export const pickLang = (v?: string | string[]): Lang => (v === "en" ? "en" : "he");

/** PROTOTYPE DATA — fictional, for layout exploration only. */
export const IMG = {
  hero: "/images/hero-desktop.jpg",
  city: "/images/section-01-city.jpg",
  facade: "/images/section-01-city.jpg",
  terrace: "/images/section-05-developers.jpg",
  cta: "/images/cta-living-room.jpg",
  off: "/buildings/yarkon-v2/off.webp",
  on: "/buildings/yarkon-v2/on.webp",
  axo: "/buildings/yarkon-v2/apt-axo.webp",
  top: "/buildings/yarkon-v2/apt-top.webp",
  living: "/buildings/yarkon-v2/room-living.webp",
  kitchen: "/buildings/yarkon-v2/room-kitchen.webp",
  bedroom: "/buildings/yarkon-v2/room-bedroom.webp",
  bath: "/buildings/yarkon-v2/room-bath.webp",
  balcony: "/buildings/yarkon-v2/room-balcony.webp",

  detail: "/images/section-03-apartment.png",
};

export interface Unit { id: string; name: Record<Lang, string>; loc: Record<Lang, string>; rooms: number; sqm: number; floor: number; price: number; match: number; img: string; why: Record<Lang, string[]>; }
export const UNITS: Unit[] = [
  { id: "A-804", name: { he: "דירת גן-על, מגדל A", en: "Sky residence, Tower A" }, loc: { he: "ירקון, תל אביב", en: "Yarkon, Tel Aviv" }, rooms: 4, sqm: 118, floor: 8, price: 4950000, match: 94, img: IMG.living, why: { he: ["תקציב: בטווח", "אור: חזית דרום-מערב", "מרפסת 24 מ״ר"], en: ["Budget: in range", "Light: south-west facade", "24 sqm balcony"] } },
  { id: "B-512", name: { he: "דירה עם נוף לפארק, מגדל B", en: "Park-view home, Tower B" }, loc: { he: "ירקון, תל אביב", en: "Yarkon, Tel Aviv" }, rooms: 4, sqm: 106, floor: 5, price: 4380000, match: 89, img: IMG.balcony, why: { he: ["תקציב: 6% מתחת", "קרוב לגן ילדים", "חניה כפולה"], en: ["Budget: 6% under", "Near a kindergarten", "Double parking"] } },
  { id: "A-306", name: { he: "דירת משפחה, מגדל A", en: "Family home, Tower A" }, loc: { he: "ירקון, תל אביב", en: "Yarkon, Tel Aviv" }, rooms: 5, sqm: 132, floor: 3, price: 5290000, match: 81, img: IMG.kitchen, why: { he: ["5 חדרים", "מטבח פתוח", "קצת מעל התקציב"], en: ["5 rooms", "Open kitchen", "Slightly over budget"] } },
  { id: "B-1101", name: { he: "פנטהאוז, מגדל B", en: "Penthouse, Tower B" }, loc: { he: "ירקון, תל אביב", en: "Yarkon, Tel Aviv" }, rooms: 5, sqm: 164, floor: 11, price: 7900000, match: 63, img: IMG.bedroom, why: { he: ["נוף פנורמי", "מעל התקציב ב-58%"], en: ["Panoramic view", "58% over budget"] } },
];
export const money = (n: number, lang: Lang) => new Intl.NumberFormat(lang === "he" ? "he-IL" : "en-US", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

export const T = {
  brandTag: { he: "נדל״ן שמותאם אליך", en: "Real estate, matched to you" },
  nav: { he: ["פתרון", "התאמה", "בניינים", "יזמים"], en: ["Approach", "Matching", "Buildings", "Developers"] },
  login: { he: "כניסה", en: "Sign in" },
  start: { he: "מתחילים", en: "Get started" },
  protoNote: { he: "אב-טיפוס עיצובי · נתונים לדוגמה", en: "Design prototype · sample data" },
};
