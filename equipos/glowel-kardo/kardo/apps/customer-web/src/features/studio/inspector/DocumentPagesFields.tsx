import type { DesignBlock } from "@kardo/contracts";
import { RangeField, Segmented } from "../../../components/controls/index.js";
import { documentPageStyleLabels } from "../labels.js";

type DocumentPagesBlock = Extract<DesignBlock, { kind: "documentPages" }>;

type DocumentPagesPatch = {
  pageStyle?: DocumentPagesBlock["pageStyle"];
  gap?: number | undefined;
};

/**
 * Fields for a `documentPages` block (addendum 3): how the PDF's pages look
 * (visor) or how the download card looks, and the space between pages.
 * Which pages show, and whether it is a visor or a download, is chosen in
 * Contenido.
 */
export function DocumentPagesFields({
  block,
  onChange,
}: {
  block: DocumentPagesBlock;
  onChange: (patch: DocumentPagesPatch) => void;
}) {
  return (
    <div className="es-fields">
      <Segmented
        fill
        label="Estilo de las páginas"
        onChange={(pageStyle) => onChange({ pageStyle })}
        options={(
          Object.keys(
            documentPageStyleLabels,
          ) as DocumentPagesBlock["pageStyle"][]
        ).map((value) => ({ value, label: documentPageStyleLabels[value] }))}
        value={block.pageStyle}
      />
      <RangeField
        format={(gap) => `${gap} px`}
        label="Espacio entre páginas"
        max={48}
        min={0}
        onChange={(gap) => onChange({ gap })}
        step={4}
        value={block.gap ?? 24}
      />
      <p className="qrs-hint">
        Si tu PDF se muestra como botón de descarga en vez de visor, este bloque
        solo dibuja la tarjeta del botón. Cámbialo en Contenido.
      </p>
    </div>
  );
}
