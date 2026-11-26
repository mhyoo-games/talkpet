// 방마다 씨앗을 저장해 두는 난수 (같은 씨앗이면 같은 결과 → 시험하기 쉬움)
export function rand(s: { seed: number }): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick = <T>(s: { seed: number }, xs: readonly T[]): T => xs[Math.floor(rand(s) * xs.length)];
