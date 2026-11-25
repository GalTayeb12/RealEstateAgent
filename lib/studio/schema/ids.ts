/**
 * Identifiers. Baseline entities derive their ids from the plan twin ids, so
 * they are stable across re-publishes of the same twin. User-created nodes get
 * ULID-style ids (time-sortable, collision-safe without coordination).
 */
export const baselineIds = {
  wall: (twinWallId: string) => `wall:${twinWallId}`,
  room: (twinRoomId: string) => `room:${twinRoomId}`,
  opening: (twinOpeningId: string) => `opening:${twinOpeningId}`,
  /** Side "a" is the left of the wall direction a->b, side "b" the right. */
  wallSurface: (twinWallId: string, side: WallSide) => `surface:${twinWallId}:${side}`,
  floor: (twinRoomId: string) => `surface:floor:${twinRoomId}`,
  ceiling: (twinRoomId: string) => `surface:ceiling:${twinRoomId}`,
} as const;

export type WallSide = "a" | "b";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 26-char ULID: 10 chars of millisecond time + 16 chars of randomness. */
export function newNodeId(now: number = Date.now(), rand: () => number = Math.random): string {
  let t = Math.floor(now);
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let r = "";
  for (let i = 0; i < 16; i++) r += CROCKFORD[Math.floor(rand() * 32) % 32];
  return time + r;
}

export function isBaselineId(id: string): boolean {
  return /^(wall|room|opening|surface):/.test(id);
}
