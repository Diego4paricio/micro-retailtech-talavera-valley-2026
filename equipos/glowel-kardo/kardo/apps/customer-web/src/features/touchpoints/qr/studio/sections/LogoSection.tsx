import {
  type Asset,
  isImageMediaType,
  type QrLogo,
  qrLogoPaddingRange,
  qrLogoPlates,
  qrLogoSizeRange,
} from "@kardo/contracts";
import { RadioGroup } from "radix-ui";
import { type CSSProperties, useId } from "react";
import { acceptedAssetTypes } from "../../../../../api/assets.js";
import { Icon } from "../../../../../components/Icon.js";
import { Notice } from "../../../../../components/Notice.js";
import { Link } from "../../../../../lib/router.js";
import type { QrBudget } from "../../engine/index.js";
import {
  ControlBlock,
  OptionalColorField,
  RangeField,
  Segmented,
} from "../controls.js";
import { asChoice, logoPlateLabels } from "../labels.js";
import { readCachedLogo } from "../logo-cache.js";
import { useStudio } from "../StudioContext.js";
import { SectionWarnings } from "./SectionWarnings.js";

type LogoChoice = "none" | "brand" | "asset";

/** Starting size and plate for a newly added logo. */
export const defaultLogoSettings: Omit<QrLogo, "source" | "assetId"> = {
  size: 0.16,
  plate: "rounded",
  padding: 1,
  plateColor: null,
};

export function LogoSection() {
  const {
    design,
    change,
    readOnly,
    logo,
    profile,
    assets,
    canUploadAssets,
    swatches,
  } = useStudio();
  const choiceId = useId();
  const current = design.logo;
  const choice: LogoChoice = current?.source ?? "none";
  const brandAssetId = profile.data?.logoAssetId ?? null;
  const images = (assets.data ?? []).filter(
    (asset) =>
      asset.status === "validated" && isImageMediaType(asset.mediaType),
  );

  const settings = current
    ? {
        size: current.size,
        plate: current.plate,
        padding: current.padding,
        plateColor: current.plateColor,
      }
    : defaultLogoSettings;

  function choose(next: LogoChoice) {
    if (next === "none") {
      change((design) => ({ ...design, logo: null }));
      return;
    }
    if (next === "brand") {
      change((design) => ({
        ...design,
        logo: { source: "brand", ...settings },
      }));
      return;
    }
    const assetId =
      current?.source === "asset" && current.assetId
        ? current.assetId
        : images[0]?.id;
    change((design) => ({
      ...design,
      logo: assetId
        ? { source: "asset", assetId, ...settings }
        : { source: "asset", ...settings },
    }));
  }

  const setLogo = (patch: Partial<QrLogo>, key?: string) =>
    change(
      (design) =>
        design.logo
          ? { ...design, logo: { ...design.logo, ...patch } }
          : design,
      key,
    );

  return (
    <>
      {logo.legacyHref ? <LegacyLogoNotice /> : null}
      <SectionWarnings section="logo" />

      <ControlBlock title="Origen">
        <RadioGroup.Root
          aria-label="Origen del logo"
          className="qrs-options"
          disabled={readOnly}
          id={choiceId}
          onValueChange={(next) => {
            if (next) choose(next as LogoChoice);
          }}
          value={choice}
        >
          <LogoOption
            description="Solo el código, sin imagen al centro."
            icon="ban"
            label="Sin logo"
            value="none"
          />
          <LogoOption
            description={
              profile.isLoading && !profile.data
                ? "Cargando la marca…"
                : brandAssetId
                  ? "El logo de Configuración, sección Marca. Si lo cambias ahí, se actualiza aquí."
                  : "Tu organización aún no tiene logo."
            }
            disabled={!profile.isLoading && !brandAssetId}
            icon="organization"
            label="Logo de la marca"
            value="brand"
          />
          <LogoOption
            description="Una imagen PNG, JPG o WebP de tu biblioteca."
            icon="asset"
            label="Imagen de la biblioteca"
            value="asset"
          />
        </RadioGroup.Root>
        {!profile.isLoading && !brandAssetId ? (
          <p className="qrs-hint">
            <Link
              className="link-button"
              to={{ name: "settings", section: "marca" }}
            >
              Agregar el logo de la marca
            </Link>
          </p>
        ) : null}
      </ControlBlock>

      {choice === "asset" ? (
        <ControlBlock
          actions={canUploadAssets && !readOnly ? <UploadButton /> : null}
          title="Biblioteca"
        >
          <LibraryPicker
            disabled={readOnly}
            images={images}
            isLoading={assets.isLoading && !assets.data}
            onSelect={(assetId) => setLogo({ assetId })}
            value={current?.source === "asset" ? current.assetId : undefined}
          />
        </ControlBlock>
      ) : null}

      {choice === "none" && canUploadAssets && !readOnly ? (
        <div className="qrs-inline-actions">
          <UploadButton />
        </div>
      ) : null}

      {current ? <LogoStatus /> : null}

      {current ? (
        <>
          <ControlBlock title="Tamaño y placa">
            <LogoSizeField />
            <Segmented
              disabled={readOnly}
              fill
              label="Placa detrás del logo"
              onChange={(plate) => setLogo({ plate })}
              options={qrLogoPlates.map((plate) => ({
                value: plate,
                label: logoPlateLabels[plate],
              }))}
              value={asChoice(qrLogoPlates, current.plate)}
            />
            <RangeField
              disabled={readOnly}
              format={(value) =>
                `${value.toLocaleString("es-MX", { maximumFractionDigits: 1 })} ${value === 1 ? "módulo" : "módulos"}`
              }
              hint="Espacio libre entre el logo y los módulos. Más espacio se ve más limpio, pero ocupa más margen de corrección."
              label="Espacio alrededor"
              max={qrLogoPaddingRange.max}
              min={qrLogoPaddingRange.min}
              onChange={(padding) => setLogo({ padding }, "logo.padding")}
              step={0.5}
              value={current.padding}
            />
            {current.plate !== "none" ? (
              <OptionalColorField
                disabled={readOnly}
                fallback={design.background.color}
                inheritLabel={
                  current.plateColor === null
                    ? "Usa el color de fondo del código."
                    : "Color propio."
                }
                label="Color de la placa"
                onChange={(plateColor) =>
                  setLogo({ plateColor }, "logo.plateColor")
                }
                swatches={swatches.background}
                value={current.plateColor}
              />
            ) : null}
          </ControlBlock>
          <CorrectionBudget />
        </>
      ) : null}
    </>
  );
}

function LogoOption({
  value,
  label,
  description,
  icon,
  disabled,
}: {
  value: LogoChoice;
  label: string;
  description: string;
  icon: "ban" | "organization" | "asset";
  disabled?: boolean | undefined;
}) {
  return (
    <RadioGroup.Item className="qrs-option" disabled={disabled} value={value}>
      <span aria-hidden="true" className="qrs-option-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="qrs-option-text">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span aria-hidden="true" className="qrs-option-radio" />
    </RadioGroup.Item>
  );
}

function LibraryPicker({
  images,
  value,
  onSelect,
  isLoading,
  disabled,
}: {
  images: readonly Asset[];
  value: string | undefined;
  onSelect: (assetId: string) => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  if (isLoading) return <p className="qrs-hint">Cargando la biblioteca…</p>;
  if (!images.length)
    return (
      <p className="qrs-hint">
        Aún no hay imágenes validadas en la biblioteca. Sube tu logo en PNG, JPG
        o WebP.
      </p>
    );
  return (
    <RadioGroup.Root
      aria-label="Imagen de la biblioteca"
      className="qrs-library"
      disabled={disabled}
      onValueChange={(next) => {
        if (next) onSelect(next);
      }}
      value={value ?? ""}
    >
      {images.map((asset) => {
        const cached = readCachedLogo(asset.id);
        return (
          <RadioGroup.Item
            className="qrs-library-item"
            key={asset.id}
            value={asset.id}
          >
            <span aria-hidden="true" className="qrs-library-thumb">
              {cached ? (
                <img alt="" src={cached.href} />
              ) : (
                <Icon name="asset" size={18} />
              )}
            </span>
            <span className="qrs-library-name">{asset.filename}</span>
            <span aria-hidden="true" className="qrs-option-radio" />
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}

function UploadButton() {
  const { logo } = useStudio();
  return (
    <label
      aria-busy={logo.isUploading || undefined}
      className="button button-secondary button-small qrs-file"
    >
      {logo.isUploading ? (
        <>
          <span aria-hidden="true" className="button-spinner" /> Subiendo…
        </>
      ) : (
        <>
          <Icon name="upload" size={14} /> Subir imagen
        </>
      )}
      <input
        accept={acceptedAssetTypes
          .filter((type) => type.startsWith("image/"))
          .join(",")}
        className="visually-hidden"
        disabled={logo.isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void logo.upload(file);
        }}
        type="file"
      />
    </label>
  );
}

function LogoStatus() {
  const { logo } = useStudio();
  const { state } = logo;
  if (state.status === "loading")
    return (
      <p className="qrs-status-line" role="status">
        <Icon className="qrs-spin" name="loader" size={16} /> Cargando el logo…
        El espacio ya está reservado en el código.
      </p>
    );
  if (state.status === "unavailable")
    return (
      <Notice title="El logo no está disponible" tone="warning">
        {state.message}
        <span className="qrs-notice-actions">
          <button
            className="button button-secondary button-small"
            onClick={logo.retry}
            type="button"
          >
            <Icon name="refresh" size={14} /> Reintentar
          </button>
        </span>
      </Notice>
    );
  return null;
}

function LogoSizeField() {
  const { design, change, readOnly, build } = useStudio();
  const current = design.logo;
  if (!current) return null;
  const analysis = build?.analysis ?? null;
  const limit = analysis?.maxLogoSize ?? null;
  const percent = (value: number) => `${Math.round(value * 100)} %`;
  return (
    <RangeField
      disabled={readOnly}
      format={percent}
      hint={
        limit !== null && analysis
          ? current.size > limit + 0.001
            ? `Tan grande no cabe ni en la versión más grande: Kardo lo muestra a ${percent(limit)} para no dañar la lectura.`
            : `Con la versión ${analysis.version} cabe hasta ${percent(limit)} (la marca en la barra). Más grande, el código sube de versión para seguir leyéndose.`
          : "Porcentaje del ancho del código que ocupa el lado mayor del logo."
      }
      label="Tamaño del logo"
      marker={
        limit !== null
          ? { value: limit, label: `Límite seguro: ${percent(limit)}` }
          : undefined
      }
      max={qrLogoSizeRange.max}
      min={qrLogoSizeRange.min}
      onChange={(size) =>
        change(
          (design) =>
            design.logo
              ? {
                  ...design,
                  logo: { ...design.logo, size: Math.round(size * 100) / 100 },
                }
              : design,
          "logo.size",
        )
      }
      step={0.01}
      value={current.size}
    />
  );
}

function CorrectionBudget() {
  const { build } = useStudio();
  const analysis = build?.analysis ?? null;
  if (!analysis?.budget) return null;
  return (
    <ControlBlock title="Margen de corrección">
      <BudgetMeter budget={analysis.budget} />
      <p className="qrs-hint">
        <Icon name="lock" size={13} /> Con logo, la corrección de errores pasa a
        nivel H (hasta 30 %).{" "}
        {analysis.versionReason === "logo"
          ? `Para que el logo quepa, el código subió de la versión ${analysis.dataMinVersion} a la ${analysis.version}.`
          : `El código usa la versión ${analysis.version}.`}
      </p>
      <details className="qrs-details">
        <summary>¿Por qué a veces sube la versión?</summary>
        <p>
          El logo tapa módulos y el lector los reconstruye con la corrección de
          errores. Kardo nunca tapa los ojos ni los patrones de alineación y
          sincronía, y deja un margen de seguridad. Si el logo ocupa más de lo
          que ese margen permite, usamos una versión con más módulos: cada
          módulo tapado pesa menos y el código sigue leyéndose.
        </p>
      </details>
    </ControlBlock>
  );
}

export function BudgetMeter({ budget }: { budget: QrBudget }) {
  const percent = Math.round(budget.ratio * 100);
  const tone = budget.ratio <= 0.7 ? "ok" : budget.ratio <= 1 ? "warn" : "over";
  const text =
    budget.ratio <= 1
      ? `El logo usa el ${percent} % del margen seguro de corrección.`
      : `El logo pasa el margen seguro de corrección (${percent} %). Reduce su tamaño o el espacio alrededor.`;
  return (
    <div className="qrs-budget" data-tone={tone}>
      {/* biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot draw the safe-zone mark */}
      <div
        aria-label="Margen de corrección usado por el logo"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.min(percent, 100)}
        aria-valuetext={text}
        className="qrs-budget-track"
        role="meter"
      >
        <span
          className="qrs-budget-fill"
          style={
            {
              "--qrs-fill": Math.min(1, Math.max(0.02, budget.ratio)),
            } as CSSProperties
          }
        />
        <span aria-hidden="true" className="qrs-budget-safe" />
      </div>
      <p className="qrs-budget-text">{text}</p>
      <p className="qrs-hint">
        Tapa {budget.damagedCodewords} de las {budget.allowedCodewords} palabras
        de datos que el código puede reconstruir con seguridad en su bloque más
        exigido ({budget.clearedModules} módulos despejados).
      </p>
    </div>
  );
}

function LegacyLogoNotice() {
  const { logo, canUploadAssets } = useStudio();
  return (
    <Notice title="Encontramos tu logo anterior" tone="info">
      Lo tenías guardado solo en este navegador. Súbelo a la biblioteca para
      usarlo en el nuevo estudio desde cualquier dispositivo.
      <span className="qrs-notice-actions">
        {canUploadAssets ? (
          <button
            aria-busy={logo.isUploading || undefined}
            className="button button-secondary button-small"
            disabled={logo.isUploading}
            onClick={() => void logo.uploadLegacy()}
            type="button"
          >
            <Icon name="upload" size={14} />
            {logo.isUploading ? "Subiendo…" : "Subir a la biblioteca"}
          </button>
        ) : null}
        <button
          className="button button-ghost button-small"
          onClick={logo.dismissLegacy}
          type="button"
        >
          Descartar
        </button>
      </span>
    </Notice>
  );
}
