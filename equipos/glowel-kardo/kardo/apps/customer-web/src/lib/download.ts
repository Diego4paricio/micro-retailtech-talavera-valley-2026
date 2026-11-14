/** Triggers a browser download for a Blob or data URL. */
export function downloadFile(source: Blob | string, filename: string) {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename(filename);
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  if (typeof source !== "string")
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function safeFilename(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return cleaned || "kardo";
}
