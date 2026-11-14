import { type CSSProperties, useEffect, useRef, useState } from "react";

/**
 * An iframe that draws each new `srcDoc` behind the one on screen and swaps
 * them once it is drawn, so a preview redrawn while the owner types or picks
 * a color never goes blank in between (owner, 2026-10-07). The two frames
 * keep their place in the DOM: moving one would reload it.
 */
export function SwapFrame({
  srcDoc,
  title,
  sandbox,
  style,
  loading,
  onDocument,
}: {
  srcDoc: string;
  title: string;
  sandbox: string;
  style?: CSSProperties | undefined;
  loading?: "lazy" | "eager" | undefined;
  /** Each document once drawn (to stop its links, for example). */
  onDocument?: ((doc: Document) => void) | undefined;
}) {
  const [docs, setDocs] = useState<[string, string]>(() => [srcDoc, ""]);
  const [front, setFront] = useState<0 | 1>(0);
  const latest = useRef(srcDoc);
  latest.current = srcDoc;
  useEffect(() => {
    setDocs((current) => {
      if (current[front] === srcDoc) return current;
      return front === 0 ? [current[0], srcDoc] : [srcDoc, current[1]];
    });
  }, [srcDoc, front]);
  return (
    <>
      {([0, 1] as const).map((slot) =>
        docs[slot] ? (
          <iframe
            aria-hidden={slot === front ? undefined : true}
            key={slot}
            loading={loading}
            onLoad={(event) => {
              const doc = event.currentTarget.contentDocument;
              if (doc) onDocument?.(doc);
              if (slot !== front && docs[slot] === latest.current)
                setFront(slot);
            }}
            sandbox={sandbox}
            srcDoc={docs[slot]}
            style={slot === front ? style : { ...style, visibility: "hidden" }}
            tabIndex={-1}
            title={title}
          />
        ) : null,
      )}
    </>
  );
}
