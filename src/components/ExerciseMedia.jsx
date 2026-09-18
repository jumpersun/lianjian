import { useEffect, useState } from "react";
import { exerciseMediaUrl } from "../lib/exerciseMedia.js";

export function ExerciseMedia({ exercise, animated = false, compact = false, alt = "" }) {
  const src = exerciseMediaUrl(animated ? exercise?.gif_url : exercise?.image);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <span className={`exercise-text-media${compact ? " is-compact" : ""}`}>
      <strong>文字教学</strong>
      {!compact && <small>阅读动作步骤后再开始。开源版不附带第三方图片或动画。</small>}
    </span>;
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
