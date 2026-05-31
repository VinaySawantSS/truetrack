// Grade thresholds mirror src/scoring gradeFor() exactly, so the live letter
// during the gauge sweep matches the engine's final grade.
export function gradeForLive(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 50) return "D";
  return "F";
}

type RGB = [number, number, number];

// Color stops: alarming red at the bottom, sweeping through amber to signal
// green near the top. Tuned so 41 reads clearly red and 94 reads clearly green.
const STOPS: Array<[number, RGB]> = [
  [0, [255, 64, 88]],
  [46, [255, 72, 92]],
  [60, [255, 138, 56]],
  [76, [255, 196, 36]],
  [88, [54, 226, 162]],
  [100, [54, 226, 162]],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function scoreColor(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (s >= STOPS[i][0] && s <= STOPS[i + 1][0]) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const t = (s - lo[0]) / span;
  const r = Math.round(lerp(lo[1][0], hi[1][0], t));
  const g = Math.round(lerp(lo[1][1], hi[1][1], t));
  const b = Math.round(lerp(lo[1][2], hi[1][2], t));
  return `rgb(${r}, ${g}, ${b})`;
}
