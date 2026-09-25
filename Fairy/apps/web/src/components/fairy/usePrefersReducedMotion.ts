import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function queryReducedMotion(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

/**
 * 跟踪系统「减弱动态效果」偏好；不支持 matchMedia 的环境（SSR/旧浏览器）视为不降级。
 * 仅作渲染开关，CSS 侧另有同名 media 兜底（见 FairyAvatar.css）。
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => queryReducedMotion()?.matches ?? false);

  useEffect(() => {
    const query = queryReducedMotion();
    if (!query) {
      return;
    }
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener("change", onChange);
    setReduced(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
