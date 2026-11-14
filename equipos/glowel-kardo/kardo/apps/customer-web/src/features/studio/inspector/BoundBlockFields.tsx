import type { DesignBlock } from "@kardo/contracts";
import { Segmented, SwitchField } from "../../../components/controls/index.js";
import {
  catalogLayoutLabels,
  imageFrameLabels,
  leadFormLookLabels,
  priceStyleLabels,
} from "../labels.js";
import { MaskGallery, TextField } from "./controls.js";

/**
 * Fields for the Catálogo, Formulario and Imagen principal bound blocks
 * (addendum 3): every option their `DesignBlock` variant has. The content
 * itself (products, form fields, the photo) is edited in "Contenido"; these
 * only choose how it looks.
 */

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

type CatalogBlock = Extract<DesignBlock, { kind: "catalog" }>;

type CatalogPatch = {
  layout?: CatalogBlock["layout"];
  columns?: CatalogBlock["columns"];
  imageAspect?: CatalogBlock["imageAspect"] | undefined;
  descriptions?: boolean | undefined;
  buttonLabel?: string | undefined;
  priceStyle?: CatalogBlock["priceStyle"] | undefined;
};

export function CatalogFields({
  block,
  onChange,
}: {
  block: CatalogBlock;
  onChange: (patch: CatalogPatch) => void;
}) {
  return (
    <div className="es-fields">
      <Segmented
        fill
        label="Diseño"
        onChange={(layout) => onChange({ layout })}
        options={(
          Object.keys(catalogLayoutLabels) as CatalogBlock["layout"][]
        ).map((value) => ({ value, label: catalogLayoutLabels[value] }))}
        value={block.layout}
      />
      <Segmented
        fill
        hint="En computadora se agrega una columna más."
        label="Columnas en el teléfono"
        onChange={(columns) =>
          onChange({ columns: Number(columns) as 1 | 2 | 3 })
        }
        options={[
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
        ]}
        value={String(block.columns)}
      />
      <Segmented
        fill
        label="Proporción de la foto"
        onChange={(imageAspect) => onChange({ imageAspect })}
        options={[
          { value: "1:1", label: "1:1" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
        ]}
        value={block.imageAspect ?? "1:1"}
      />
      <SwitchField
        checked={block.descriptions ?? true}
        description="Muestra la descripción de cada producto."
        label="Descripciones"
        onChange={(descriptions) => onChange({ descriptions })}
      />
      <Segmented
        fill
        label="Estilo del precio"
        onChange={(priceStyle) => onChange({ priceStyle })}
        options={(
          Object.keys(priceStyleLabels) as (keyof typeof priceStyleLabels)[]
        ).map((value) => ({ value, label: priceStyleLabels[value] }))}
        value={block.priceStyle ?? "plain"}
      />
      <TextField
        hint="Se ve en cada producto que tiene un enlace."
        id={`es-${block.id}-button-label`}
        label="Texto del botón"
        max={24}
        onChange={(buttonLabel) =>
          onChange({
            buttonLabel: buttonLabel.trim() ? buttonLabel : undefined,
          })
        }
        optional
        placeholder="Ver más"
        value={block.buttonLabel ?? ""}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

type LeadFormBlock = Extract<DesignBlock, { kind: "leadForm" }>;

type LeadFormPatch = {
  look?: LeadFormBlock["look"];
  buttonWidth?: LeadFormBlock["buttonWidth"] | undefined;
};

export function LeadFormFields({
  block,
  onChange,
}: {
  block: LeadFormBlock;
  onChange: (patch: LeadFormPatch) => void;
}) {
  return (
    <div className="es-fields">
      <Segmented
        fill
        label="Estilo de los campos"
        onChange={(look) => onChange({ look })}
        options={(
          Object.keys(leadFormLookLabels) as LeadFormBlock["look"][]
        ).map((value) => ({ value, label: leadFormLookLabels[value] }))}
        value={block.look}
      />
      <Segmented
        fill
        label="Ancho del botón"
        onChange={(buttonWidth) => onChange({ buttonWidth })}
        options={[
          { value: "auto", label: "Ajustado" },
          { value: "full", label: "Todo el ancho" },
        ]}
        value={block.buttonWidth ?? "auto"}
      />
      <p className="qrs-hint">
        Los campos, el aviso de privacidad y el consentimiento se editan en
        Contenido.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Imagen principal
// ---------------------------------------------------------------------------

type ImageMainBlock = Extract<DesignBlock, { kind: "imageMain" }>;

type ImageMainPatch = {
  fit?: ImageMainBlock["fit"];
  frame?: ImageMainBlock["frame"];
  aspect?: ImageMainBlock["aspect"] | undefined;
  mask?: ImageMainBlock["mask"] | undefined;
};

export function ImageMainFields({
  block,
  onChange,
}: {
  block: ImageMainBlock;
  onChange: (patch: ImageMainPatch) => void;
}) {
  return (
    <div className="es-fields">
      <Segmented
        fill
        label="Ajuste"
        onChange={(fit) => onChange({ fit })}
        options={[
          { value: "cover", label: "Llenar" },
          { value: "contain", label: "Completa" },
        ]}
        value={block.fit}
      />
      <Segmented
        fill
        label="Marco"
        onChange={(frame) => onChange({ frame })}
        options={(
          Object.keys(imageFrameLabels) as ImageMainBlock["frame"][]
        ).map((value) => ({ value, label: imageFrameLabels[value] }))}
        value={block.frame}
      />
      <Segmented
        fill
        label="Proporción"
        onChange={(aspect) => onChange({ aspect })}
        options={[
          { value: "auto", label: "Original" },
          { value: "1:1", label: "1:1" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
        ]}
        value={block.aspect ?? "auto"}
      />
      <MaskGallery onChange={(mask) => onChange({ mask })} value={block.mask} />
    </div>
  );
}
