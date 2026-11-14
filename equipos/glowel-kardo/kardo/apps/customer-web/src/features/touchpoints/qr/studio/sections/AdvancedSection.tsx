import {
  qrErrorCorrectionLevels,
  qrQuietZoneRange,
  qrVersionRange,
} from "@kardo/contracts";
import { useId } from "react";
import { Icon } from "../../../../../components/Icon.js";
import { ControlBlock, RangeField, Segmented } from "../controls.js";
import { asChoice, errorCorrectionInfo } from "../labels.js";
import { useStudio } from "../StudioContext.js";
import { SectionWarnings } from "./SectionWarnings.js";

const versionOptions = Array.from(
  { length: qrVersionRange.max - qrVersionRange.min + 1 },
  (_, index) => qrVersionRange.min + index,
);

export function AdvancedSection() {
  const { design, change, readOnly, build } = useStudio();
  const versionId = useId();
  const analysis = build?.analysis ?? null;
  const hasLogo = design.logo !== null;
  const level = asChoice(qrErrorCorrectionLevels, design.errorCorrection);

  return (
    <>
      <SectionWarnings section="advanced" />
      <ControlBlock title="Corrección de errores">
        <Segmented
          aside={
            hasLogo ? (
              <span className="qrs-lock">
                <Icon name="lock" size={13} /> H por el logo
              </span>
            ) : undefined
          }
          disabled={readOnly || hasLogo}
          fill
          hint={
            hasLogo
              ? "Con logo usamos siempre el nivel H: el código puede reconstruir hasta un 30 % de módulos tapados. Quita el logo para elegir otro nivel."
              : `Nivel ${level}: el código se lee aunque falte o esté manchado hasta un ${errorCorrectionInfo[level].recovers} de los módulos. Más corrección significa más módulos.`
          }
          label="Nivel"
          onChange={(errorCorrection) =>
            change((current) => ({ ...current, errorCorrection }))
          }
          options={qrErrorCorrectionLevels.map((level) => ({
            value: level,
            // The plain word, not the bare letter: «L/M/Q/H» read as jargon
            // to a first-time owner (round 4, Toño). The letter stays in the
            // hint for anyone who needs it.
            label: `${errorCorrectionInfo[level].label} (${errorCorrectionInfo[level].recovers})`,
          }))}
          value={hasLogo ? "H" : level}
        />
      </ControlBlock>

      <ControlBlock title="Versión">
        <div className="qrs-control">
          <div className="qrs-control-head">
            <label className="qrs-control-label" htmlFor={versionId}>
              Versión mínima
            </label>
          </div>
          <select
            className="input qrs-select"
            disabled={readOnly}
            id={versionId}
            onChange={(event) => {
              const raw = event.target.value;
              change((current) => ({
                ...current,
                minVersion: raw === "auto" ? null : Number(raw),
              }));
            }}
            value={design.minVersion === null ? "auto" : design.minVersion}
          >
            <option value="auto">
              Automática (la más pequeña que funcione)
            </option>
            {versionOptions.map((version) => (
              <option key={version} value={version}>
                {`Versión ${version} (${version * 4 + 17} × ${version * 4 + 17} módulos)`}
              </option>
            ))}
          </select>
        </div>
        {analysis ? (
          <dl className="qrs-facts">
            <div>
              <dt>Versión en uso</dt>
              <dd>{analysis.version}</dd>
            </div>
            <div>
              <dt>Módulos por lado</dt>
              <dd>
                {analysis.size} × {analysis.size}
              </dd>
            </div>
            <div>
              <dt>Corrección</dt>
              <dd>{analysis.errorCorrection}</dd>
            </div>
          </dl>
        ) : null}
        {analysis ? (
          <p className="qrs-hint">{versionReasonText(analysis)}</p>
        ) : null}
      </ControlBlock>

      <ControlBlock title="Margen del código">
        {/* «Zona de silencio» is the standard's term; it read as jargon, so
            the block is named in plain words and the hint keeps the term. */}
        <RangeField
          disabled={readOnly}
          format={(value) => `${value} ${value === 1 ? "módulo" : "módulos"}`}
          hint="El margen claro alrededor del código (su «zona de silencio»). La norma pide al menos 4 módulos; súbelo si lo vas a imprimir cerca de otros elementos."
          label="Margen"
          marker={{ value: 4, label: "Mínimo de la norma" }}
          max={qrQuietZoneRange.max}
          min={qrQuietZoneRange.min}
          onChange={(quietZone) =>
            change(
              (current) => ({ ...current, quietZone: Math.round(quietZone) }),
              "quietZone",
            )
          }
          step={1}
          value={design.quietZone}
        />
      </ControlBlock>
    </>
  );
}

function versionReasonText(analysis: {
  version: number;
  dataMinVersion: number;
  versionReason: "data" | "manual" | "logo";
}): string {
  switch (analysis.versionReason) {
    case "data":
      return `La versión ${analysis.version} es la más pequeña que guarda la dirección de este QR.`;
    case "manual":
      return `Usas la versión ${analysis.version} porque fijaste una versión mínima (la dirección cabría en la ${analysis.dataMinVersion}). Más módulos: más detalle, pero cada módulo es más pequeño al imprimir.`;
    case "logo":
      return `Subimos de la versión ${analysis.dataMinVersion} a la ${analysis.version} para que el logo quepa dentro del margen seguro de corrección.`;
  }
}
