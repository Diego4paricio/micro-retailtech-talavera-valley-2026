import media from "@/content/media.json";

type MediaEntry = { width: number; height: number; widths: number[] };

const entries = media as Record<string, MediaEntry>;

/** Whether scripts/media/landing-images.mjs produced this image. */
export function hasMedia(name: string): boolean {
  return name in entries;
}

/**
 * A landing photo in the WebP sizes scripts/media/landing-images.mjs wrote
 * for it (src/content/media.json), with its real width and height so the
 * page does not jump while it loads.
 */
export function EditorialImage({
  name,
  alt,
  sizes = "(max-width: 767px) 100vw, 60vw",
  priority = false,
  className,
}: {
  name: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const entry = entries[name];
  if (!entry) throw new Error(`No media "${name}": run landing-images.mjs`);
  const url = (w: number) => `/media/landing/${name}-${w}.webp`;
  const fallback = entry.widths.find((w) => w >= 1200) ?? entry.width;
  return (
    // biome-ignore lint/performance/noImgElement: Preoptimized local WebP variants with explicit srcSet for the static export.
    <img
      src={url(fallback)}
      srcSet={entry.widths.map((w) => `${url(w)} ${w}w`).join(", ")}
      sizes={sizes}
      alt={alt}
      width={entry.width}
      height={entry.height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
    />
  );
}
