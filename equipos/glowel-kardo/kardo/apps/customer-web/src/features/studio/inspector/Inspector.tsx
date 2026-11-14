import {
  type CanvasSection,
  DESIGN_LIMITS,
  type DesignBlock,
  type DesignSection,
  designBlocks,
  isCanvasSection,
} from "@kardo/contracts";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import {
  RangeField,
  Segmented,
  SwitchField,
} from "../../../components/controls/index.js";
import { Icon, type IconName } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { Tooltip } from "../../../components/Tooltip.js";
import { focusField } from "../focus-field.js";
import {
  blockKindDescription,
  blockKindIcon,
  blockKindLabel,
  isBoundKind,
} from "../model/blocks.js";
import { isWhatsAppButton } from "../model/business-contact.js";
import { setBrandButtonLook, setCanvasHeight } from "../model/canvas.js";
import type { MultiAlign } from "../model/canvas-items.js";
import {
  duplicateBlockBlocker,
  duplicateSectionBlocker,
  moveToSectionBlocker,
  removeBlockBlocker,
  removeSectionBlocker,
} from "../model/limits.js";
import {
  alignCanvasItems,
  canMoveBlockStep,
  commonCanvasSectionId,
  distributeCanvasItems,
  locateBlock,
  removeBlock,
  sectionIndexOf,
  setBlockStyleForMany,
  setSectionLayout,
  updateBlock,
  updateSection,
} from "../model/operations.js";
import { issuesFor } from "../model/validate.js";
import { useStudio } from "../StudioContext.js";
import { measuredItemHeight } from "../stage/canvas-measure.js";
import { useOrganizationBrand } from "../use-organization-brand.js";
import { AdvancedStyle } from "./AdvancedStyle.js";
import {
  CatalogFields,
  ImageMainFields,
  LeadFormFields,
} from "./BoundBlockFields.js";
import { BrandButtonFields } from "./BrandButtonFields.js";
import { CanvasPlacement, isCanvasBlock } from "./CanvasPlacement.js";
import {
  BackgroundFields,
  ColorTokenField,
  FieldIssue,
  ImageField,
  LayoutPicker,
  StepperField,
} from "./controls.js";
import { DocumentPagesFields } from "./DocumentPagesFields.js";
import { FeaturedItemsFields } from "./FeaturedItemsFields.js";
import { FeaturesBlockFields } from "./FeaturesBlockFields.js";
import { GalleryBlockFields } from "./GalleryBlockFields.js";
import { HtmlFields } from "./HtmlFields.js";
import { MenuBlockFields } from "./MenuBlockFields.js";
import { RichTextField } from "./RichTextField.js";
import { ShapeFields } from "./ShapeFields.js";
import { ShapeSection } from "./ShapeSection.js";
import { SocialsLookField } from "./SocialsLookField.js";
import { ButtonHrefField } from "./WhatsAppNumberField.js";

/**
 * The right-hand inspector: the selected block or section, its fields and
 * actions. With nothing selected it explains how to start.
 */
export function Inspector({ onClose }: { onClose?: (() => void) | undefined }) {
  const { selection, design } = useStudio();
  const located =
    selection?.kind === "block" ? locateBlock(design, selection.id) : null;
  const section =
    selection?.kind === "section"
      ? (design.sections.find((item) => item.id === selection.id) ?? null)
      : null;

  return (
    <div className="es-inspector-body">
      {selection?.kind === "blocks" ? (
        <MultiSelectInspector ids={selection.ids} onClose={onClose} />
      ) : located ? (
        <BlockInspector
          block={located.block}
          key={located.block.id}
          onClose={onClose}
          sectionNumber={located.sectionIndex + 1}
        />
      ) : section && isCanvasSection(section) ? (
        <CanvasSectionInspector
          key={section.id}
          onClose={onClose}
          section={section}
        />
      ) : section ? (
        <SectionInspector
          key={section.id}
          onClose={onClose}
          section={section}
        />
      ) : (
        <EmptyInspector onClose={onClose} />
      )}
    </div>
  );
}

function InspectorHead({
  icon,
  kicker,
  title,
  description,
  actions,
  onClose,
}: {
  icon: IconName;
  kicker: string;
  title: string;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  onClose?: (() => void) | undefined;
}) {
  return (
    <div className="es-inspector-head">
      <div className="es-inspector-title">
        <span aria-hidden="true" className="es-kind-icon">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <p className="es-kicker">{kicker}</p>
          <h2 tabIndex={-1}>{title}</h2>
        </div>
        {onClose ? (
          <button
            aria-label="Cerrar el inspector"
            className="icon-button es-inspector-close"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={18} />
          </button>
        ) : null}
      </div>
      {description ? <p className="es-inspector-note">{description}</p> : null}
      {actions ? <div className="es-inspector-actions">{actions}</div> : null}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabledReason,
  tone,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabledReason?: string | null | undefined;
  tone?: "danger" | undefined;
}) {
  const button = (
    <button
      aria-disabled={disabledReason ? true : undefined}
      aria-label={disabledReason ? `${label}: ${disabledReason}` : label}
      className={tone === "danger" ? "es-action es-action-danger" : "es-action"}
      onClick={() => {
        if (!disabledReason) onClick();
      }}
      type="button"
    >
      <Icon name={icon} size={16} />
    </button>
  );
  return <Tooltip content={disabledReason ?? label}>{button}</Tooltip>;
}

function EmptyInspector({ onClose }: { onClose?: (() => void) | undefined }) {
  const { openRail, design, readOnly } = useStudio();
  const blocks = designBlocks(design).length;
  return (
    <>
      <InspectorHead
        icon="select-block"
        kicker="Inspector"
        onClose={onClose}
        title="Selecciona algo para editarlo"
      />
      <div className="es-empty-inspector">
        <p>
          Toca un bloque en la vista previa o en <strong>Capas</strong> para
          cambiar su texto, su imagen o su estilo.
        </p>
        <dl className="es-facts">
          <div>
            <dt>Secciones</dt>
            <dd>{design.sections.length}</dd>
          </div>
          <div>
            <dt>Bloques</dt>
            <dd>{blocks}</dd>
          </div>
        </dl>
        {!readOnly ? (
          <div className="es-empty-actions">
            <button
              className="button button-secondary"
              onClick={() => openRail("add")}
              type="button"
            >
              <Icon name="plus" size={16} /> Agregar bloque
            </button>
            <button
              className="button button-ghost"
              onClick={() => openRail("style")}
              type="button"
            >
              <Icon name="palette" size={16} /> Estilo de la página
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Multi-select: several items of one canvas (shift-click or a marquee).
// ---------------------------------------------------------------------------

const multiAlignments: { align: MultiAlign; label: string; icon: IconName }[] =
  [
    { align: "left", label: "Alinear a la izquierda", icon: "align-left" },
    { align: "center-h", label: "Centrar horizontal", icon: "align-center" },
    { align: "right", label: "Alinear a la derecha", icon: "align-right" },
    { align: "top", label: "Alinear arriba", icon: "align-left" },
    { align: "center-v", label: "Centrar vertical", icon: "align-center" },
    { align: "bottom", label: "Alinear abajo", icon: "align-right" },
  ];

function MultiSelectInspector({
  ids,
  onClose,
}: {
  ids: string[];
  onClose?: (() => void) | undefined;
}) {
  const { design, change, select, readOnly } = useStudio();
  const sectionId = commonCanvasSectionId(design, ids);
  const count = ids.length;

  return (
    <>
      <InspectorHead
        actions={
          readOnly ? null : (
            <ActionButton
              icon="trash"
              label="Eliminar la selección"
              onClick={() => {
                change((current) =>
                  ids.reduce((next, id) => removeBlock(next, id), current),
                );
                select(null);
              }}
              tone="danger"
            />
          )
        }
        description={`${count} bloques seleccionados. Alinéalos entre sí, distribúyelos o cámbiales un color a la vez.`}
        icon="select-block"
        kicker="Selección múltiple"
        onClose={onClose}
        title={`${count} bloques`}
      />
      {sectionId ? (
        <fieldset className="es-fields" disabled={readOnly}>
          <h4 className="es-group-title">Alinear en el espacio libre</h4>
          <div className="es-cv-align">
            {multiAlignments.map(({ align, label, icon }, index) => (
              <Tooltip content={label} key={align}>
                <button
                  aria-label={label}
                  className="es-action"
                  onClick={() =>
                    change((current) =>
                      alignCanvasItems(
                        current,
                        sectionId,
                        ids,
                        align,
                        measuredItemHeight,
                      ),
                    )
                  }
                  type="button"
                >
                  <Icon
                    className={index >= 3 ? "es-cv-vertical" : undefined}
                    name={icon}
                    size={16}
                  />
                </button>
              </Tooltip>
            ))}
          </div>
          {count >= 3 ? (
            <>
              <h4 className="es-group-title">Distribuir</h4>
              <div className="es-cv-layers">
                <button
                  className="button button-secondary button-small"
                  onClick={() =>
                    change((current) =>
                      distributeCanvasItems(
                        current,
                        sectionId,
                        ids,
                        "horizontal",
                        measuredItemHeight,
                      ),
                    )
                  }
                  type="button"
                >
                  <Icon name="distribute-h" size={16} /> Horizontal
                </button>
                <button
                  className="button button-secondary button-small"
                  onClick={() =>
                    change((current) =>
                      distributeCanvasItems(
                        current,
                        sectionId,
                        ids,
                        "vertical",
                        measuredItemHeight,
                      ),
                    )
                  }
                  type="button"
                >
                  <Icon name="distribute-v" size={16} /> Vertical
                </button>
              </div>
            </>
          ) : null}
        </fieldset>
      ) : (
        <Notice title="Bloques de secciones distintas" tone="info">
          Alinear y distribuir solo funciona cuando todos los bloques están en
          el mismo espacio libre.
        </Notice>
      )}
      <fieldset className="es-fields" disabled={readOnly}>
        <h4 className="es-group-title">Cambios comunes</h4>
        <ColorTokenField
          allowNone
          label="Color de todos"
          onChange={(value) =>
            change((current) =>
              setBlockStyleForMany(current, ids, { color: value }),
            )
          }
          value={undefined}
        />
        <StepperField
          fallback={100}
          label="Opacidad de todos"
          max={100}
          min={20}
          onChange={(value) =>
            change((current) =>
              setBlockStyleForMany(current, ids, { opacity: value }),
            )
          }
          unit="%"
          value={undefined}
        />
      </fieldset>
    </>
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function BlockInspector({
  block,
  sectionNumber,
  onClose,
}: {
  block: DesignBlock;
  sectionNumber: number;
  onClose?: (() => void) | undefined;
}) {
  const {
    type,
    design,
    actions,
    readOnly,
    issues,
    openRail,
    select,
    canEditHtml,
  } = useStudio();
  const own = issuesFor(issues, { blockId: block.id });
  const issueOf = (field: string) =>
    own.find((issue) => issue.field === field)?.message;
  const bound = isBoundKind(block.kind);
  const label = blockKindLabel(block.kind, type);
  const others = design.sections.filter(
    (section) => section.id !== locateBlock(design, block.id)?.section.id,
  );
  // On a canvas, the position comes from X and Y, not from the order.
  const onCanvas = isCanvasBlock(design, block.id);
  // C5e: with no business WhatsApp yet, an empty WhatsApp button's "Falta
  // completar" offers a way out instead of leaving the owner stuck on it
  // (Iván, relevo 37 informe §4: "pensé que era opcional").
  const businessWhatsAppUrl = useOrganizationBrand().brand?.whatsappUrl;
  const whatsappHrefIssue =
    isWhatsAppButton(block) && own.some((issue) => issue.field === "href");
  const canRemoveBlock =
    removeBlockBlocker(design, type, block.id, canEditHtml) === null;

  return (
    <>
      <InspectorHead
        actions={
          readOnly ? null : (
            <>
              {onCanvas ? null : (
                <>
                  <ActionButton
                    disabledReason={
                      canMoveBlockStep(design, block.id, -1)
                        ? null
                        : "Ya está hasta arriba"
                    }
                    icon="arrow-up"
                    label="Subir"
                    onClick={() => actions.moveBlockStep(block.id, -1)}
                  />
                  <ActionButton
                    disabledReason={
                      canMoveBlockStep(design, block.id, 1)
                        ? null
                        : "Ya está hasta abajo"
                    }
                    icon="arrow-down"
                    label="Bajar"
                    onClick={() => actions.moveBlockStep(block.id, 1)}
                  />
                </>
              )}
              {others.length ? (
                <DropdownMenu.Root>
                  <Tooltip content="Mover a otra sección">
                    <DropdownMenu.Trigger asChild>
                      <button
                        aria-label="Mover a otra sección"
                        className="es-action"
                        type="button"
                      >
                        <Icon name="move-to" size={16} />
                      </button>
                    </DropdownMenu.Trigger>
                  </Tooltip>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="start"
                      className="kd-dropdown-content"
                      sideOffset={6}
                    >
                      <DropdownMenu.Label className="es-menu-label">
                        Mover a
                      </DropdownMenu.Label>
                      {others.map((section) => {
                        const blocked = moveToSectionBlocker(
                          design,
                          type,
                          block.id,
                          section.id,
                          canEditHtml,
                        );
                        return (
                          <DropdownMenu.Item
                            className="kd-dropdown-item"
                            disabled={blocked !== null}
                            key={section.id}
                            onSelect={() =>
                              actions.moveBlockToSection(block.id, section.id)
                            }
                            title={blocked ?? undefined}
                          >
                            <Icon name="section" size={16} /> Sección{" "}
                            {sectionIndexOf(design, section.id) + 1}
                            {isCanvasSection(section) ? " (espacio libre)" : ""}
                          </DropdownMenu.Item>
                        );
                      })}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : null}
              <ActionButton
                disabledReason={duplicateBlockBlocker(
                  design,
                  type,
                  block.id,
                  canEditHtml,
                )}
                icon="duplicate"
                label="Duplicar"
                onClick={() => actions.duplicateBlock(block.id)}
              />
              <ActionButton
                disabledReason={removeBlockBlocker(
                  design,
                  type,
                  block.id,
                  canEditHtml,
                )}
                icon="trash"
                label="Eliminar"
                onClick={() => actions.removeBlock(block.id)}
                tone="danger"
              />
              <button
                className="link-button es-parent-link"
                onClick={() => {
                  const at = locateBlock(design, block.id);
                  if (at) select({ kind: "section", id: at.section.id });
                }}
                type="button"
              >
                Sección {sectionNumber}
              </button>
            </>
          )
        }
        description={blockKindDescription(block.kind)}
        icon={blockKindIcon(block.kind)}
        kicker={bound ? "Bloque de tu contenido" : "Bloque"}
        onClose={onClose}
        title={label}
      />
      {own.length ? (
        <Notice title="Falta completar" tone="warning">
          {own.map((issue) => issue.message).join(" ")}
        </Notice>
      ) : null}
      {/* C5e: a separate row, below the notice — two text buttons next to
       * the warning's own "action" slot overlapped each other in the
       * Inspector's narrow column. */}
      {!readOnly && whatsappHrefIssue && !businessWhatsAppUrl ? (
        <p className="es-notice-actions">
          <button
            className="text-action"
            onClick={() => focusField(`es-${block.id}-href`)}
            type="button"
          >
            Escribir mi WhatsApp
          </button>
          {canRemoveBlock ? (
            <button
              className="text-action"
              onClick={() => {
                actions.removeBlock(block.id);
                select(null);
              }}
              type="button"
            >
              Quitar el botón
            </button>
          ) : null}
        </p>
      ) : null}
      <fieldset className="es-fields" disabled={readOnly}>
        <BlockFields block={block} issueOf={issueOf} />
      </fieldset>
      {bound ? (
        <p className="es-bound-note">
          <Icon name="info" size={15} />
          <span>
            Este bloque muestra tu contenido tal como lo escribiste.{" "}
            <button
              className="link-button text-action"
              onClick={() => openRail("content")}
              type="button"
            >
              Editar en Contenido
              <Icon name="arrow-right" size={14} />
            </button>
          </span>
        </p>
      ) : null}
      <ShapeSection block={block} />
      {onCanvas ? <CanvasPlacement blockId={block.id} /> : null}
      <AdvancedStyle block={block} />
    </>
  );
}

/**
 * Merges a field component's patch into a block, dropping any key the patch
 * sets to `undefined` instead of leaving it in place (a bare spread would
 * keep the key with an explicit `undefined` value, which the schema's
 * `additionalProperties: false` optional fields never carry). Every "shape",
 * "menu", "catalog", "leadForm", "documentPages", "imageMain" and "html"
 * field below clears an optional field this way (e.g. turning a shape's
 * gradient back into a solid fill), so they all go through this instead of
 * a raw `{ ...current, ...patch }`.
 */
function withPatch<T extends DesignBlock>(
  current: T,
  patch: Record<string, unknown>,
): T {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}

function BlockFields({
  block,
  issueOf,
}: {
  block: DesignBlock;
  issueOf: (field: string) => string | undefined;
}) {
  const { change, readOnly, openRail } = useStudio();
  const update = <K extends DesignBlock>(
    recipe: (current: K) => K,
    key?: string,
  ) =>
    change(
      (design) =>
        updateBlock(design, block.id, (current) => recipe(current as K)),
      key ? `${block.id}:${key}` : undefined,
    );
  const fieldId = (name: string) => `es-${block.id}-${name}`;

  switch (block.kind) {
    case "heading":
      return (
        <>
          <TextField
            error={issueOf("text")}
            id={fieldId("text")}
            label="Texto del título"
            max={160}
            onChange={(text) =>
              update<typeof block>((current) => ({ ...current, text }), "text")
            }
            value={block.text}
          />
          <Segmented
            fill
            label="Nivel"
            onChange={(level) =>
              update<typeof block>((current) => ({
                ...current,
                level: Number(level) as 1 | 2 | 3,
              }))
            }
            options={[
              { value: "1", label: "Grande" },
              { value: "2", label: "Mediano" },
              { value: "3", label: "Chico" },
            ]}
            value={String(block.level) as "1" | "2" | "3"}
          />
        </>
      );
    case "text":
      return (
        <RichTextField
          error={issueOf("runs")}
          label="Texto"
          onChange={(runs) =>
            update<typeof block>(
              (current) => ({
                ...current,
                runs: runs.length ? runs : [{ text: "" }],
              }),
              "runs",
            )
          }
          readOnly={readOnly}
          runs={block.runs}
        />
      );
    case "image":
      return (
        <>
          <ImageField
            error={issueOf("imageRef")}
            id={fieldId("image")}
            label="Imagen"
            onChange={(imageRef) =>
              update<typeof block>((current) => ({ ...current, imageRef }))
            }
            value={block.imageRef}
          />
          <TextField
            error={issueOf("alt")}
            hint="Describe la foto para quien no la ve. Ayuda a lectores de pantalla."
            id={fieldId("alt")}
            label="Descripción"
            max={200}
            onChange={(alt) =>
              update<typeof block>((current) => ({ ...current, alt }), "alt")
            }
            optional
            value={block.alt}
          />
          <Segmented
            fill
            label="Proporción"
            onChange={(aspect) =>
              update<typeof block>((current) => ({ ...current, aspect }))
            }
            options={[
              { value: "auto", label: "Original" },
              { value: "1:1", label: "1:1" },
              { value: "4:3", label: "4:3" },
              { value: "3:4", label: "3:4" },
              { value: "16:9", label: "16:9" },
            ]}
            value={block.aspect}
          />
          <Segmented
            fill
            label="Ajuste"
            onChange={(fit) =>
              update<typeof block>((current) => ({ ...current, fit }))
            }
            options={[
              { value: "cover", label: "Llenar" },
              { value: "contain", label: "Completa" },
            ]}
            value={block.fit}
          />
          <TextField
            error={issueOf("href")}
            id={fieldId("href")}
            label="Enlace al tocar la imagen"
            max={2048}
            onChange={(href) =>
              update<typeof block>((current) => {
                const { href: _old, ...rest } = current;
                return href ? { ...rest, href } : rest;
              }, "href")
            }
            optional
            placeholder="https://"
            type="url"
            value={block.href ?? ""}
          />
        </>
      );
    case "features":
      return (
        <FeaturesBlockFields
          block={block}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
    case "gallery":
      return (
        <GalleryBlockFields
          block={block}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
    case "featuredItems":
      return (
        <FeaturedItemsFields
          block={block}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
    case "button":
      return (
        <>
          <TextField
            error={issueOf("label")}
            id={fieldId("label")}
            label="Texto del botón"
            max={60}
            onChange={(label) =>
              update<typeof block>(
                (current) => ({ ...current, label }),
                "label",
              )
            }
            value={block.label}
          />
          <ButtonHrefField
            error={issueOf("href")}
            href={block.href}
            id={fieldId("href")}
            key={block.id}
            onChange={(href) =>
              update<typeof block>((current) => ({ ...current, href }), "href")
            }
            startsAsWhatsApp={isWhatsAppButton(block)}
          />
          <Segmented
            fill
            label="Estilo"
            onChange={(variant) =>
              update<typeof block>((current) => ({ ...current, variant }))
            }
            options={[
              { value: "primary", label: "Principal" },
              { value: "secondary", label: "Secundario" },
            ]}
            value={block.variant}
          />
        </>
      );
    case "spacer":
      return (
        <RangeField
          format={(height) => `${height} px`}
          label="Altura"
          max={160}
          min={4}
          onChange={(height) =>
            update<typeof block>(
              (current) => ({ ...current, height }),
              "height",
            )
          }
          step={4}
          value={block.height}
        />
      );
    case "divider":
      return (
        <p className="qrs-hint">
          Una línea fina. Cambia su color y sus márgenes en Avanzado.
        </p>
      );
    case "contentTitle":
      return null;
    case "profileHeader":
      return (
        <>
          <Segmented
            fill
            label="Acomodo"
            onChange={(layout) =>
              update<typeof block>((current) => ({ ...current, layout }))
            }
            options={[
              { value: "stacked", label: "Apilado" },
              { value: "inline", label: "En línea" },
            ]}
            value={block.layout}
          />
          <Segmented
            fill
            label="Foto"
            onChange={(avatarShape) =>
              update<typeof block>((current) => ({ ...current, avatarShape }))
            }
            options={[
              { value: "circle", label: "Círculo" },
              { value: "rounded", label: "Redondeada" },
              { value: "none", label: "Sin foto" },
            ]}
            value={block.avatarShape}
          />
        </>
      );
    case "contentLinks":
      return (
        <Segmented
          fill
          label="Acomodo"
          onChange={(layout) =>
            update<typeof block>((current) => ({ ...current, layout }))
          }
          options={[
            { value: "list", label: "Lista", icon: "link-list" },
            { value: "grid", label: "Cuadrícula", icon: "board" },
          ]}
          value={block.layout}
        />
      );
    case "contentSocials":
      return (
        <>
          <Segmented
            fill
            label="Tamaño de los íconos"
            onChange={(size) =>
              update<typeof block>((current) => ({ ...current, size }))
            }
            options={[
              { value: "small", label: "Chicos" },
              { value: "medium", label: "Medianos" },
              { value: "large", label: "Grandes" },
            ]}
            value={block.size}
          />
          <SocialsLookField
            onChange={(look) =>
              update<typeof block>((current) => ({ ...current, look }))
            }
            value={block.look}
          />
        </>
      );
    case "brandButton":
      return (
        <BrandButtonFields
          block={block}
          issueOf={issueOf}
          onChange={(patch) => {
            // "look" also resizes the item on a canvas (círculo becomes a
            // 56×56 square around its own center): one undo step for both.
            if (patch.look) {
              const look = patch.look;
              change(
                (design) => setBrandButtonLook(design, block.id, look),
                `${block.id}:look`,
              );
              return;
            }
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            );
          }}
        />
      );
    case "shape":
      return (
        <ShapeFields
          block={block}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
    case "menu":
      return (
        <MenuBlockFields
          block={block}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
    case "catalog":
      return (
        <CatalogFields
          block={block}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
    case "leadForm":
      return (
        <>
          <LeadFormFields
            block={block}
            onChange={(patch) =>
              update<typeof block>(
                (current) => withPatch(current, patch),
                Object.keys(patch)[0],
              )
            }
          />
          {/* S6a: Luis never found where to change Nombre/Teléfono/Mensaje
           * (Oculto, Opcional, Obligatorio); they live in Contenido. */}
          <button
            className="link-button text-action"
            onClick={() => openRail("content")}
            type="button"
          >
            Cambiar los campos
            <Icon name="arrow-right" size={14} />
          </button>
        </>
      );
    case "documentPages":
      return (
        <DocumentPagesFields
          block={block}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
    case "imageMain":
      return (
        <ImageMainFields
          block={block}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
    case "html":
      return (
        <HtmlFields
          block={block}
          issueOf={issueOf}
          onChange={(patch) =>
            update<typeof block>(
              (current) => withPatch(current, patch),
              Object.keys(patch)[0],
            )
          }
        />
      );
  }
}

function TextField({
  id,
  label,
  value,
  onChange,
  max,
  error,
  hint,
  optional,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string | undefined;
  hint?: string | undefined;
  optional?: boolean | undefined;
  placeholder?: string | undefined;
  type?: "text" | "url" | undefined;
}) {
  return (
    <div className="qrs-control">
      <div className="qrs-control-head">
        <label className="qrs-control-label" htmlFor={id}>
          {label}
          {optional ? <span className="es-optional"> (opcional)</span> : null}
        </label>
        {type === "text" && value.length > max * 0.7 ? (
          <span
            className={
              value.length > max
                ? "qrs-counter qrs-counter-full"
                : "qrs-counter"
            }
          >
            {value.length} / {max}
          </span>
        ) : null}
      </div>
      <input
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        aria-invalid={Boolean(error) || undefined}
        autoComplete="off"
        className="input"
        id={id}
        inputMode={type === "url" ? "url" : undefined}
        maxLength={type === "url" ? 2048 : max + 20}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={type === "url" ? false : undefined}
        type={type === "url" ? "url" : "text"}
        value={value}
      />
      <div id={`${id}-error`}>
        <FieldIssue message={error} />
      </div>
      {hint && !error ? (
        <p className="qrs-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionInspector({
  section,
  onClose,
}: {
  section: DesignSection;
  onClose?: (() => void) | undefined;
}) {
  const {
    type,
    design,
    change,
    actions,
    readOnly,
    issues,
    openRail,
    canEditHtml,
  } = useStudio();
  const index = sectionIndexOf(design, section.id);
  const own = issuesFor(issues, { sectionId: section.id });
  const set = (
    recipe: (current: DesignSection) => DesignSection,
    key?: string,
  ) =>
    change(
      (current) => updateSection(current, section.id, recipe),
      key ? `${section.id}:${key}` : undefined,
    );

  return (
    <>
      <InspectorHead
        actions={
          readOnly ? null : (
            <>
              <ActionButton
                disabledReason={index > 0 ? null : "Ya es la primera sección"}
                icon="arrow-up"
                label="Mover arriba la sección"
                onClick={() => actions.moveSectionStep(section.id, -1)}
              />
              <ActionButton
                disabledReason={
                  index < design.sections.length - 1
                    ? null
                    : "Ya es la última sección"
                }
                icon="arrow-down"
                label="Mover abajo la sección"
                onClick={() => actions.moveSectionStep(section.id, 1)}
              />
              <ActionButton
                disabledReason={duplicateSectionBlocker(
                  design,
                  section.id,
                  canEditHtml,
                )}
                icon="duplicate"
                label="Duplicar sección"
                onClick={() => actions.duplicateSection(section.id)}
              />
              <ActionButton
                disabledReason={removeSectionBlocker(
                  design,
                  type,
                  section.id,
                  canEditHtml,
                )}
                icon="trash"
                label="Eliminar sección"
                onClick={() => actions.removeSection(section.id)}
                tone="danger"
              />
              <button
                className="link-button es-parent-link"
                onClick={() => openRail("add")}
                type="button"
              >
                <Icon name="plus" size={14} /> Agregar bloque
              </button>
            </>
          )
        }
        description="Una franja de la página con sus columnas, su fondo y sus espacios."
        icon="section"
        kicker="Sección"
        onClose={onClose}
        title={`Sección ${index + 1}`}
      />
      {own.length ? (
        <Notice title="Falta completar" tone="warning">
          {own.map((issue) => issue.message).join(" ")}
        </Notice>
      ) : null}
      <fieldset className="es-fields" disabled={readOnly}>
        <LayoutPicker
          onChange={(layout) =>
            change((current) => setSectionLayout(current, section.id, layout))
          }
          value={section.layout}
        />
        <Segmented
          fill
          label="Alineación"
          onChange={(align) => set((current) => ({ ...current, align }))}
          options={[
            { value: "start", label: "Izquierda", icon: "align-left" },
            { value: "center", label: "Centro", icon: "align-center" },
            { value: "end", label: "Derecha", icon: "align-right" },
          ]}
          value={section.align}
        />
        <SwitchField
          checked={Boolean(section.card)}
          description="Dibuja la sección como una tarjeta sobre el fondo."
          label="Tarjeta"
          onChange={(card) =>
            set((current) => {
              const { card: _old, ...rest } = current;
              return card ? { ...rest, card: true } : rest;
            })
          }
        />
        <RangeField
          format={(value) => `${value} px`}
          label="Espacio arriba"
          max={160}
          min={0}
          onChange={(paddingTop) =>
            set((current) => ({ ...current, paddingTop }), "paddingTop")
          }
          step={4}
          value={section.paddingTop}
        />
        <RangeField
          format={(value) => `${value} px`}
          label="Espacio abajo"
          max={160}
          min={0}
          onChange={(paddingBottom) =>
            set((current) => ({ ...current, paddingBottom }), "paddingBottom")
          }
          step={4}
          value={section.paddingBottom}
        />
        <RangeField
          format={(value) => `${value} px`}
          label="Espacio entre bloques"
          max={64}
          min={0}
          onChange={(gap) => set((current) => ({ ...current, gap }), "gap")}
          step={2}
          value={section.gap}
        />
        <h4 className="es-group-title">Fondo de la sección</h4>
        <BackgroundFields
          baseColor={design.style.palette.surface}
          error={own.find((issue) => issue.field === "background")?.message}
          idPrefix={`es-${section.id}-bg`}
          noneLabel="Deja ver el fondo de la página."
          onChange={(background, key) =>
            set((current) => {
              const { background: _old, ...rest } = current;
              return background.kind === "none"
                ? rest
                : { ...rest, background };
            }, key)
          }
          value={section.background}
        />
      </fieldset>
    </>
  );
}

/** A canvas section ("lienzo libre"): its height and background. Its
 * blocks are placed on the page itself (see stage/CanvasOverlay.tsx). */
function CanvasSectionInspector({
  section,
  onClose,
}: {
  section: CanvasSection;
  onClose?: (() => void) | undefined;
}) {
  const { type, design, change, actions, readOnly, issues, canEditHtml } =
    useStudio();
  const index = sectionIndexOf(design, section.id);
  const own = issuesFor(issues, { sectionId: section.id });
  const set = (
    recipe: (current: CanvasSection) => CanvasSection,
    key?: string,
  ) =>
    change(
      (current) => ({
        ...current,
        sections: current.sections.map((item) =>
          item.id === section.id && isCanvasSection(item) ? recipe(item) : item,
        ),
      }),
      key ? `${section.id}:${key}` : undefined,
    );

  return (
    <>
      <InspectorHead
        actions={
          readOnly ? null : (
            <>
              <ActionButton
                disabledReason={index > 0 ? null : "Ya es la primera sección"}
                icon="arrow-up"
                label="Mover arriba la sección"
                onClick={() => actions.moveSectionStep(section.id, -1)}
              />
              <ActionButton
                disabledReason={
                  index < design.sections.length - 1
                    ? null
                    : "Ya es la última sección"
                }
                icon="arrow-down"
                label="Mover abajo la sección"
                onClick={() => actions.moveSectionStep(section.id, 1)}
              />
              <ActionButton
                disabledReason={duplicateSectionBlocker(
                  design,
                  section.id,
                  canEditHtml,
                )}
                icon="duplicate"
                label="Duplicar sección"
                onClick={() => actions.duplicateSection(section.id)}
              />
              <ActionButton
                disabledReason={removeSectionBlocker(
                  design,
                  type,
                  section.id,
                  canEditHtml,
                )}
                icon="trash"
                label="Eliminar sección"
                onClick={() => actions.removeSection(section.id)}
                tone="danger"
              />
            </>
          )
        }
        description="Coloca cada bloque donde quieras: arrástralo en la vista previa o escribe su posición."
        icon="section"
        kicker="Espacio libre"
        onClose={onClose}
        title={`Sección ${index + 1}`}
      />
      {own.length ? (
        <Notice title="Falta completar" tone="warning">
          {own.map((issue) => issue.message).join(" ")}
        </Notice>
      ) : null}
      <fieldset className="es-fields" disabled={readOnly}>
        <RangeField
          format={(value) => `${value} px`}
          label="Alto del espacio libre"
          max={DESIGN_LIMITS.canvasHeight}
          min={80}
          onChange={(height) =>
            change(
              (current) => setCanvasHeight(current, section.id, height),
              `${section.id}:height`,
            )
          }
          step={8}
          value={section.height}
        />
        <h4 className="es-group-title">Fondo del espacio libre</h4>
        <BackgroundFields
          baseColor={design.style.palette.surface}
          error={own.find((issue) => issue.field === "background")?.message}
          idPrefix={`es-${section.id}-bg`}
          noneLabel="Deja ver el fondo de la página."
          onChange={(background, key) =>
            set((current) => {
              const { background: _old, ...rest } = current;
              return background.kind === "none"
                ? rest
                : { ...rest, background };
            }, key)
          }
          value={section.background}
        />
      </fieldset>
    </>
  );
}
