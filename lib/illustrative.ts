/** Listings carry no photos, so screens use an illustrative render picked deterministically per listing key. */
const ROOMS = ["living", "balcony", "kitchen", "bedroom", "bath"].map((r) => `/buildings/yarkon-v2/room-${r}.webp`);
export function illustrativeImage(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ROOMS[h % ROOMS.length];
}
