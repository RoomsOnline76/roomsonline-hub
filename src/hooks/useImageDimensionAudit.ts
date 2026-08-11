import { useEffect, useMemo, useRef, useState } from "react";
import { measureImageUrl, type ImageDimensionResult } from "@/lib/imageValidation";

export type ImageAuditStatus = "pending" | "pass" | "fail" | "unmeasured";

export interface ImageAuditEntry extends ImageDimensionResult {
  status: ImageAuditStatus;
}

/**
 * Measures stored image URLs against the channel minimum (1024×768) so the
 * property/room galleries can flag photos that block channel distribution.
 */
export function useImageDimensionAudit(urls: string[]) {
  const [results, setResults] = useState<Record<string, ImageAuditEntry>>({});
  const inflight = useRef<Set<string>>(new Set());

  const key = urls.filter(Boolean).join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    let cancelled = false;

    list.forEach((url) => {
      if (inflight.current.has(url)) return;
      inflight.current.add(url);
      measureImageUrl(url).then((dims) => {
        if (cancelled) return;
        setResults((prev) => ({
          ...prev,
          [url]: {
            ...dims,
            status: dims.width && dims.height ? (dims.valid ? "pass" : "fail") : "unmeasured",
          },
        }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const failing = useMemo(
    () => Object.entries(results).filter(([, v]) => v.status !== "pass").map(([url]) => url),
    [results],
  );

  return { results, failing };
}
