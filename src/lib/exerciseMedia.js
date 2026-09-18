export const exerciseMediaEnabled = import.meta.env?.VITE_ENABLE_EXERCISE_MEDIA === "true";

export function exerciseMediaUrl(path, enabled = exerciseMediaEnabled, base = import.meta.env?.BASE_URL || "/") {
  if (!enabled || typeof path !== "string" || path.includes("..")) return null;
  if (!/^(?:images\/[\w.-]+\.(?:jpg|jpeg|png|webp)|videos\/[\w.-]+\.gif)$/i.test(path)) return null;
  return `${base}${path}`;
}
