/** Room definition — axis-aligned bounding box with floor material. */
export interface Room {
  id: string;
  x1: number;
  x2: number;
  z1: number;
  z2: number;
  floor: "wood" | "tile" | "deck" | "concrete";
  name: string;
  /** Computed width */
  w: number;
  /** Computed depth */
  d: number;
  /** Computed area in m² */
  area: number;
  /** Center x */
  cx: number;
  /** Center z */
  cz: number;
}

/** A single furniture placement in a layout. */
export interface TourLayoutItem {
  type: string;
  params: (number | string)[];
  x: number;
  z: number;
  rotY: number;
}

/** Quick question chip data. */
export interface QuickQuestion {
  k: string;
  q: string;
}

/** Profile-specific labels for rooms. */
export type RoomLabels = Partial<Record<string, string>>;

/** Bot narration per room. */
export interface BotScript {
  intro: string;
  living: string;
  kitchen: string;
  master: string;
  room2: string;
  mamad: string;
  bath: string;
  balcony: string;
  hall: string;
  [key: string]: string;
}

/** Profile-specific rent data (investor profile). */
export type RentData = Partial<Record<string, number>>;

/** A buyer profile definition. */
export interface Profile {
  id: string;
  name: string;
  sub: string;
  match: number;
  why: string[];
  labels: RoomLabels;
  bot: BotScript;
  storage: string;
  mamad: string;
  rent?: RentData;
}

/** Apartment facts shown in the side panel. */
export interface ApartmentFacts {
  areaSqm: number;
  balconySqm: number;
  floor: string;
  storageSqm: number;
  parking: number;
  priceIls: string;
}

/** Full apartment model data (stored as JSON in the DB or loaded from sample). */
export interface ApartmentModelData {
  version: number;
  rooms: Room[];
  profiles: Profile[];
  questions: QuickQuestion[];
  layouts: Record<string, TourLayoutItem[]>;
  facts: ApartmentFacts;
}
