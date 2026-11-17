/** 95 -> "1:35". Negative values clamp to 0. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** 75 -> "+1:15" for sim-time offsets in the event log. */
export function formatSimTime(seconds: number): string {
  return `T+${formatDuration(seconds)}`;
}
