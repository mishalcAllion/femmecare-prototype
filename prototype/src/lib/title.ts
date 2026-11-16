import { useEffect } from "react";

/** Sets the browser tab title, e.g. "Orders · FemmeCare". */
export function usePageTitle(title: string, suffix = "FemmeCare") {
  useEffect(() => {
    document.title = title ? `${title} · ${suffix}` : suffix;
  }, [title, suffix]);
}
