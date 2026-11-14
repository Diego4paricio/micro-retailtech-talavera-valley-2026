import type { Asset } from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "../api.js";
import { type PreparePdfPagesResult, preparePdfPages } from "./prepare.js";
import { pdfErrorMessage } from "./raster.js";

/** One page's locally drawn preview: a page number (1-based) and an object
 * URL built straight from the canvas — no network round trip needed to show
 * it, so the first page can appear as soon as it's drawn. */
export type PdfPagePreview = { pageNumber: number; url: string };

export type PdfPagesStatus =
  | { phase: "idle" }
  | {
      phase: "preparing";
      fileName: string;
      fileSize: number;
      /** 0 while the file is still being opened and the page count isn't
       * known yet ("Leyendo tu PDF…"). */
      total: number;
      completed: number;
      previews: PdfPagePreview[];
    }
  | { phase: "error"; message: string }
  | {
      phase: "done";
      fileName: string;
      fileSize: number;
      totalPages: number;
      truncated: boolean;
      previews: PdfPagePreview[];
      downloadUnavailableNotice: string | undefined;
    };

/**
 * Drives `preparePdfPages` from a component: progress visible as it goes
 * ("Preparando página 3 de 12"), cancelable, and only one run at a time (a
 * new `prepare` call aborts whatever was still running). Each page's local
 * preview URL is kept alive for as long as the UI might still show it, and
 * revoked exactly when it can't any more: starting a new run, canceling, an
 * error, or unmounting — never on success, since the "done" view keeps
 * showing them.
 */
export function usePdfPagesPreparation(workspaceId: string) {
  const [status, setStatus] = useState<PdfPagesStatus>({ phase: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  const revokePreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current = [];
  }, []);

  // Unmount only: `revokePreviews` is stable, so this never re-runs earlier.
  useEffect(() => revokePreviews, [revokePreviews]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    revokePreviews();
    setStatus({ phase: "idle" });
  }, [revokePreviews]);

  const prepare = useCallback(
    (
      file: File,
      onDone: (result: PreparePdfPagesResult) => void,
      onAssetUploaded: (asset: Asset) => void,
    ) => {
      controllerRef.current?.abort();
      revokePreviews();
      const controller = new AbortController();
      controllerRef.current = controller;
      // A plain local array alongside the state: both callbacks below mutate
      // it imperatively and publish a fresh copy, so neither ever reads a
      // stale `previews` from a closure over last render's state.
      const previews: PdfPagePreview[] = [];
      setStatus({
        phase: "preparing",
        fileName: file.name,
        fileSize: file.size,
        total: 0,
        completed: 0,
        previews: [],
      });
      preparePdfPages({
        workspaceId,
        file,
        signal: controller.signal,
        onProgress: (completed, total) => {
          if (controller.signal.aborted) return;
          setStatus({
            phase: "preparing",
            fileName: file.name,
            fileSize: file.size,
            total,
            completed,
            previews: [...previews],
          });
        },
        onPagePreview: (pageNumber, total, url) => {
          if (controller.signal.aborted) {
            URL.revokeObjectURL(url);
            return;
          }
          previewUrlsRef.current.push(url);
          previews.push({ pageNumber, url });
          previews.sort((a, b) => a.pageNumber - b.pageNumber);
          setStatus((current) =>
            current.phase === "preparing"
              ? { ...current, total, previews: [...previews] }
              : current,
          );
        },
        onAssetUploaded,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setStatus({
            phase: "done",
            fileName: file.name,
            fileSize: file.size,
            totalPages: result.totalPages,
            truncated: result.truncated,
            previews: [...previews],
            downloadUnavailableNotice: result.downloadUnavailableNotice,
          });
          onDone(result);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) {
            revokePreviews();
            setStatus({ phase: "idle" });
            return;
          }
          revokePreviews();
          setStatus({ phase: "error", message: pdfErrorMessage(error) });
        });
    },
    [workspaceId, revokePreviews],
  );

  return { status, prepare, cancel };
}
