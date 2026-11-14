import type { ExperienceContentByType } from "@kardo/contracts";
import { type ChangeEvent, useMemo, useState } from "react";
import { experiencesApi } from "../../api/experiences.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";

type ScanType = "menu" | "catalog";

type EditableItem = {
  id: string;
  name: string;
  description?: string;
  price?: number;
};

type EditableSection = {
  id: string;
  name: string;
  items: EditableItem[];
};

function compressImageToBase64(
  file: File,
  maxDimension = 1280,
): Promise<{ imageBase64: string; mimeType: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la foto."));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const img = new Image();
      img.onerror = () =>
        reject(new Error("El archivo no es una imagen válida."));
      img.onload = () => {
        const scale = Math.min(
          1,
          maxDimension / Math.max(img.width, img.height),
        );
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen en el navegador."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const jpegUrl = canvas.toDataURL("image/jpeg", 0.82);
        const base64 = jpegUrl.replace(/^data:image\/jpeg;base64,/, "");
        resolve({
          imageBase64: base64,
          mimeType: "image/jpeg",
          previewUrl: jpegUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Mobile-first express flow: snap a photo of a menu/chalkboard/price list,
 * review the AI-extracted items, and publish straight to a QR Touchpoint.
 */
export function QuickScanPage() {
  const { workspace, touchpoints, upsertExperience } = useWorkspace();
  const { navigate } = useRouter();
  const { notify } = useToast();

  const touchpointItems = touchpoints.data ?? [];
  const [scanType, setScanType] = useState<ScanType>("menu");
  const [selectedTouchpointId, setSelectedTouchpointId] = useState<string>(
    () => touchpointItems[0]?.id ?? "",
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<EditableSection[]>([]);
  const [catalogItems, setCatalogItems] = useState<EditableItem[]>([]);
  const [publishedInfo, setPublishedInfo] = useState<{
    experienceId: string;
    publicUrl: string | null;
  } | null>(null);

  const activeTouchpointId = useMemo(
    () => selectedTouchpointId || touchpointItems[0]?.id || "",
    [selectedTouchpointId, touchpointItems],
  );

  const hasExtracted =
    scanType === "menu" ? sections.length > 0 : catalogItems.length > 0;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setPublishedInfo(null);
    setIsScanning(true);

    try {
      const { imageBase64, mimeType, previewUrl: url } =
        await compressImageToBase64(file);
      setPreviewUrl(url);

      const extracted = await experiencesApi.extractFromImage(workspace.id, {
        type: scanType,
        imageBase64,
        mimeType,
      });

      if (extracted.type === "menu") {
        setTitle(extracted.content.title);
        setSections(extracted.content.sections);
        setCatalogItems([]);
      } else {
        setTitle(extracted.content.title);
        setCatalogItems(extracted.content.items);
        setSections([]);
      }
      notify("¡Listo! Revisa los productos detectados y publícalos.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsScanning(false);
    }
  }

  function updateSectionItem(
    sectionIdx: number,
    itemIdx: number,
    patch: { name?: string; price?: number | undefined },
  ) {
    setSections((prev) =>
      prev.map((sec, sIdx) =>
        sIdx !== sectionIdx
          ? sec
          : {
              ...sec,
              items: sec.items.map((it, iIdx) => {
                if (iIdx !== itemIdx) return it;
                const next: EditableItem = {
                  id: it.id,
                  name: patch.name ?? it.name,
                  ...(it.description ? { description: it.description } : {}),
                };
                const nextPrice =
                  "price" in patch ? patch.price : it.price;
                if (nextPrice !== undefined) next.price = nextPrice;
                return next;
              }),
            },
      ),
    );
  }

  function removeSectionItem(sectionIdx: number, itemIdx: number) {
    setSections((prev) =>
      prev
        .map((sec, sIdx) =>
          sIdx !== sectionIdx
            ? sec
            : {
                ...sec,
                items: sec.items.filter((_, iIdx) => iIdx !== itemIdx),
              },
        )
        .filter((sec) => sec.items.length > 0),
    );
  }

  function updateCatalogItem(
    itemIdx: number,
    patch: { name?: string; price?: number | undefined },
  ) {
    setCatalogItems((prev) =>
      prev.map((it, iIdx) => {
        if (iIdx !== itemIdx) return it;
        const next: EditableItem = {
          id: it.id,
          name: patch.name ?? it.name,
          ...(it.description ? { description: it.description } : {}),
        };
        const nextPrice = "price" in patch ? patch.price : it.price;
        if (nextPrice !== undefined) next.price = nextPrice;
        return next;
      }),
    );
  }

  function removeCatalogItem(itemIdx: number) {
    setCatalogItems((prev) => prev.filter((_, iIdx) => iIdx !== itemIdx));
  }

  async function publishToQr() {
    if (!hasExtracted) return;
    setError(null);
    setIsPublishing(true);

    try {
      const cleanTitle = title.trim() || (scanType === "menu" ? "Menú" : "Catálogo");
      const targets = {
        touchpointIds: activeTouchpointId ? [activeTouchpointId] : [],
        groupIds: [],
      };

      const created =
        scanType === "menu"
          ? await experiencesApi.create(workspace.id, {
              name: cleanTitle,
              type: "menu",
              targets,
              content: {
                title: cleanTitle,
                currency: "MXN",
                sections: sections.map((sec) => ({
                  ...sec,
                  items: sec.items.filter((it) => it.name.trim().length > 0),
                })),
              } satisfies ExperienceContentByType["menu"],
            })
          : await experiencesApi.create(workspace.id, {
              name: cleanTitle,
              type: "catalog",
              targets,
              content: {
                title: cleanTitle,
                currency: "MXN",
                items: catalogItems.filter((it) => it.name.trim().length > 0),
              } satisfies ExperienceContentByType["catalog"],
            });

      upsertExperience(created);

      if (activeTouchpointId) {
        await experiencesApi.publish(workspace.id, created.id);
      }

      const targetTp = touchpointItems.find(
        (tp) => tp.id === activeTouchpointId,
      );
      const resolverBase = (import.meta.env.VITE_TAP_RESOLVER_URL ?? "").replace(
        /\/$/,
        "",
      );
      const publicUrl =
        targetTp && resolverBase
          ? `${resolverBase}/t/${targetTp.publicId}`
          : null;

      setPublishedInfo({ experienceId: created.id, publicUrl });
      notify(
        activeTouchpointId
          ? "Publicado en tu QR."
          : "Página guardada como borrador.",
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <PageHeader
        actions={
          <button
            className="button button-secondary"
            onClick={() => navigate({ name: "experiences" })}
            type="button"
          >
            Volver a páginas
          </button>
        }
        description="Toma una foto a tu pizarrón, libreta o menú impreso. La IA arma tu página y la publica en tu QR en segundos."
        title="Foto a menú o catálogo"
      />

      {error ? (
        <Notice tone="danger" title="No pudimos completar este paso">
          {error}
        </Notice>
      ) : null}

      {publishedInfo ? (
        <section
          className="state-panel"
          style={{ textAlign: "left", display: "grid", gap: 16 }}
        >
          <div>
            <p className="eyebrow">¡Listo!</p>
            <h2>Tu página ya está lista</h2>
            <p className="muted">
              {publishedInfo.publicUrl
                ? "Cualquier cliente que escanee este QR ya ve lo que acabas de fotografiar."
                : "La página quedó guardada en tu espacio."}
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {publishedInfo.publicUrl ? (
              <a
                className="button button-primary"
                href={publishedInfo.publicUrl}
                rel="noreferrer"
                target="_blank"
              >
                Abrir QR en vivo
              </a>
            ) : null}
            <button
              className="button button-secondary"
              onClick={() =>
                navigate({
                  name: "availability",
                  experienceId: publishedInfo.experienceId,
                })
              }
              type="button"
            >
              Disponibilidad en vivo
            </button>
            <button
              className="button button-secondary"
              onClick={() =>
                navigate({
                  name: "experience",
                  id: publishedInfo.experienceId,
                })
              }
              type="button"
            >
              Editar en Estudio
            </button>
          </div>
        </section>
      ) : null}

      <section
        className="card"
        style={{
          padding: 20,
          display: "grid",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={`button ${scanType === "menu" ? "button-primary" : "button-secondary"}`}
            disabled={isScanning || isPublishing}
            onClick={() => setScanType("menu")}
            type="button"
          >
            Menú (con secciones)
          </button>
          <button
            className={`button ${scanType === "catalog" ? "button-primary" : "button-secondary"}`}
            disabled={isScanning || isPublishing}
            onClick={() => setScanType("catalog")}
            type="button"
          >
            Catálogo / lista de precios
          </button>
        </div>

        <label
          className="button button-primary"
          style={{
            display: "inline-flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            padding: "14px 20px",
            cursor: isScanning ? "wait" : "pointer",
            fontSize: 16,
          }}
        >
          <Icon name="image-plus" size={18} />
          {isScanning
            ? "Leyendo foto con IA…"
            : previewUrl
              ? "Tomar o subir otra foto"
              : "Tomar foto o elegir imagen"}
          <input
            accept="image/*"
            capture="environment"
            disabled={isScanning || isPublishing}
            onChange={handleFileChange}
            style={{ display: "none" }}
            type="file"
          />
        </label>

        {previewUrl ? (
          <img
            alt="Vista previa de la foto subida"
            src={previewUrl}
            style={{
              maxHeight: 220,
              width: "100%",
              objectFit: "contain",
              borderRadius: 8,
              background: "#f6f5f1",
            }}
          />
        ) : null}
      </section>

      {hasExtracted ? (
        <section
          className="card"
          style={{ padding: 20, display: "grid", gap: 16 }}
        >
          <label className="field">
            <span>Título de la página</span>
            <input
              onChange={(e) => setTitle(e.target.value)}
              type="text"
              value={title}
            />
          </label>

          {touchpointItems.length > 0 ? (
            <label className="field">
              <span>Publicar en este QR / Touchpoint</span>
              <select
                onChange={(e) => setSelectedTouchpointId(e.target.value)}
                value={activeTouchpointId}
              >
                {touchpointItems.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.operationalName} ({(tp.kind ?? "qr").toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Notice tone="info" title="Sin QR creado aún">
              Se guardará como borrador y luego podrás asignarle un QR.
            </Notice>
          )}

          {scanType === "menu"
            ? sections.map((sec, sIdx) => (
                <div
                  key={sec.id}
                  style={{
                    borderTop: "1px solid var(--border, #e5e5e0)",
                    paddingTop: 12,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <strong>{sec.name}</strong>
                  {sec.items.map((item, iIdx) => (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 90px auto",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        aria-label="Nombre del producto"
                        onChange={(e) =>
                          updateSectionItem(sIdx, iIdx, {
                            name: e.target.value,
                          })
                        }
                        type="text"
                        value={item.name}
                      />
                      <input
                        aria-label="Precio"
                        min={0}
                        onChange={(e) =>
                          updateSectionItem(sIdx, iIdx, {
                            price:
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                          })
                        }
                        placeholder="$"
                        step="0.5"
                        type="number"
                        value={item.price ?? ""}
                      />
                      <button
                        aria-label="Quitar"
                        className="button button-secondary"
                        onClick={() => removeSectionItem(sIdx, iIdx)}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ))
            : catalogItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 90px auto",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <input
                    aria-label="Nombre del producto"
                    onChange={(e) =>
                      updateCatalogItem(idx, { name: e.target.value })
                    }
                    type="text"
                    value={item.name}
                  />
                  <input
                    aria-label="Precio"
                    min={0}
                    onChange={(e) =>
                      updateCatalogItem(idx, {
                        price:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    placeholder="$"
                    step="0.5"
                    type="number"
                    value={item.price ?? ""}
                  />
                  <button
                    aria-label="Quitar"
                    className="button button-secondary"
                    onClick={() => removeCatalogItem(idx)}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              ))}

          <button
            className="button button-primary"
            disabled={isPublishing}
            onClick={publishToQr}
            style={{ padding: "14px 20px", fontSize: 16 }}
            type="button"
          >
            {isPublishing
              ? "Publicando en tu QR…"
              : activeTouchpointId
                ? "Publicar en mi QR"
                : "Guardar borrador"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
