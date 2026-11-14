import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../../components/Icon.js";
import { cachedThumbnail, loadThumbnail } from "./thumbnails.js";

/**
 * The item photo, or a neutral tile with the Experience type icon. A photo is
 * only requested once its row is about to scroll into view.
 */
export function ItemThumb({
  workspaceId,
  assetId,
  icon,
}: {
  workspaceId: string;
  assetId: string | undefined;
  icon: IconName;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState<{ assetId: string; url: string } | null>(
    () => {
      const url = assetId ? cachedThumbnail(assetId) : null;
      return assetId && url ? { assetId, url } : null;
    },
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!assetId) return;
    const cached = cachedThumbnail(assetId);
    if (cached) {
      setLoaded({ assetId, url: cached });
      return;
    }
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    const start = () => {
      setIsLoading(true);
      loadThumbnail(workspaceId, assetId)
        .then((url) => {
          if (!cancelled) setLoaded({ assetId, url });
        })
        .catch(() => {
          // The neutral tile stays: a missing photo never blocks the row.
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    };
    if (typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        start();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [workspaceId, assetId]);

  const url = loaded && loaded.assetId === assetId ? loaded.url : null;
  return (
    <span
      aria-hidden="true"
      className="av-thumb"
      data-loading={isLoading && !url ? "" : undefined}
      ref={ref}
    >
      {url ? (
        <img alt="" decoding="async" draggable={false} src={url} />
      ) : (
        <Icon name={icon} size={20} />
      )}
    </span>
  );
}
