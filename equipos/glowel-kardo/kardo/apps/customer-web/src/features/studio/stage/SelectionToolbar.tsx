import {
  type BlockStyle,
  type DesignBlock,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  BringToFront,
  LockOpen,
  RotateCcw,
  SendToBack,
} from "lucide-react";
import { DropdownMenu, Popover } from "radix-ui";
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { Icon, type IconName } from "../../../components/Icon.js";
import { useToast } from "../../../components/Toast.js";
import { Tooltip } from "../../../components/Tooltip.js";
import { isOpenImageBackground } from "../ai/apply-design.js";
import {
  blockHasShapeControls,
  ShapeSection,
} from "../inspector/ShapeSection.js";
import { colorTokenLabels, colorTokens, isColorToken } from "../labels.js";
import { blockKindLabel } from "../model/blocks.js";
import {
  alignCanvasItems,
  type CanvasAlign,
  canvasItemOf,
  canvasLayerOf,
  distributeCanvasItems,
  duplicateCanvasItems,
  moveCanvasLayer,
  removeCanvasItems,
  rotateCanvasItem,
  setCanvasItemsFlag,
} from "../model/canvas.js";
import { idFactoryFor } from "../model/ids.js";
import {
  duplicateBlockBlocker,
  duplicateSectionBlocker,
  removeBlockBlocker,
  removeSectionBlocker,
} from "../model/limits.js";
import {
  canMoveBlockStep,
  findSection,
  locateBlock,
  sectionIndexOf,
  setBlockStyle,
  updateBlock,
} from "../model/operations.js";
import { selectedBlockIds, useStudio } from "../StudioContext.js";
import { useConvertToCanvas } from "./canvas-convert.js";
import { measuredItemHeight } from "./canvas-measure.js";
import { writesOnPage } from "./inline-edit.js";
import { type PhotoSpace, usePhotoSpaces } from "./photo-spaces.js";
import { selectionOf } from "./selection.js";

/**
 * The quick actions over the selection, Canva style: write on the page,
 * color, text size, alignment, layer order, duplicate, lock and delete for
 * a block; align and distribute for several; move, duplicate, "Convertir
 * en lienzo" and delete for a section. It floats above the selection (or
 * under it when there is no room), never over it. Every action is a button
 * with its name, reachable with the keyboard.
 */

type ToolIcon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean | "true";
}>;

function Glyph({ icon, name }: { icon?: ToolIcon; name?: IconName }) {
  if (name) return <Icon name={name} size={15} />;
  if (!icon) return null;
  const Component = icon;
  return (
    <Component
      aria-hidden="true"
      className="icon"
      size={15}
      strokeWidth={1.7}
    />
  );
}

type Tool = {
  id: string;
  label: string;
  run: () => void;
  blocked?: string | null | undefined;
  danger?: boolean;
  pressed?: boolean;
} & ({ name: IconName; icon?: never } | { icon: ToolIcon; name?: never });

function ToolButton({ tool }: { tool: Tool }) {
  const blocked = tool.blocked ?? null;
  return (
    <Tooltip content={blocked ?? tool.label}>
      <button
        aria-disabled={blocked ? true : undefined}
        aria-label={blocked ? `${tool.label}: ${blocked}` : tool.label}
        aria-pressed={tool.pressed === undefined ? undefined : tool.pressed}
        className={tool.danger ? "es-tb-tool es-tb-danger" : "es-tb-tool"}
        onClick={() => {
          if (!blocked) tool.run();
        }}
        type="button"
      >
        {tool.name ? <Glyph name={tool.name} /> : <Glyph icon={tool.icon} />}
      </button>
    </Tooltip>
  );
}

const textKinds = new Set<DesignBlock["kind"]>([
  "heading",
  "text",
  "button",
  "brandButton",
  "contentTitle",
  "profileHeader",
  "contentLinks",
]);
const alignKinds = new Set<DesignBlock["kind"]>([
  "heading",
  "text",
  "button",
  "brandButton",
  "contentTitle",
  "profileHeader",
  "contentSocials",
  "image",
]);

/** What "Color" changes on each kind: the text, a button's fill or a
 * shape's fill (`null`: the block has no single color). */
function colorTarget(block: DesignBlock): "text" | "fill" | "shape" | null {
  if (block.kind === "shape") return "shape";
  if (block.kind === "button") return "fill";
  if (
    block.kind === "heading" ||
    block.kind === "text" ||
    block.kind === "contentTitle" ||
    block.kind === "profileHeader" ||
    block.kind === "divider"
  )
    return "text";
  return null;
}

function currentColor(
  block: DesignBlock,
  target: "text" | "fill" | "shape",
): string | undefined {
  if (target === "shape" && block.kind === "shape") return block.fill;
  return target === "fill" ? block.style?.background : block.style?.color;
}

export function SelectionToolbar({
  onEditText,
  fontSizeOf,
  onMore,
}: {
  onEditText: (blockId: string) => void;
  /** The rendered text size of a block, in design px. */
  fontSizeOf: (blockId: string) => number | null;
  /** "Más opciones": the inspector, where it is not always shown. */
  onMore?: (() => void) | undefined;
}) {
  const studio = useStudio();
  const { selection, design, readOnly } = studio;
  if (!selection || readOnly) return null;
  let tools: ReactNode = null;
  if (selection.kind === "section")
    tools = <SectionTools sectionId={selection.id} />;
  else {
    const ids = selectedBlockIds(selection);
    const id = ids[0];
    const at = id ? locateBlock(design, id) : null;
    if (ids.length > 1) tools = <GroupTools ids={ids} />;
    else if (at)
      tools = (
        <BlockTools
          block={at.block}
          fontSize={fontSizeOf(at.block.id)}
          onCanvas={at.on === "canvas"}
          onEditText={onEditText}
        />
      );
  }
  if (!tools) return null;
  return (
    <MoreContext.Provider value={onMore ?? null}>{tools}</MoreContext.Provider>
  );
}

const MoreContext = createContext<(() => void) | null>(null);

function Bar({ label, children }: { label: string; children: ReactNode }) {
  const onMore = useContext(MoreContext);
  return (
    <div
      aria-label={`Acciones de ${label}`}
      className="es-tb"
      onPointerDown={(event) => event.stopPropagation()}
      role="toolbar"
    >
      {children}
      {onMore ? (
        <>
          <Separator />
          <ToolButton
            tool={{
              id: "more",
              name: "sliders",
              label: "Más opciones",
              run: onMore,
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function Separator() {
  return <span aria-hidden="true" className="es-tb-sep" />;
}

/** "Subir foto" on an image block or a background that is still a photo
 * space (2026-10-03; backgrounds added in relevo 37, B3): the same upload
 * as tapping the space on the page, also reachable on a canvas, where the
 * page itself does not take the click, and for a background, which has no
 * click target of its own at all. */
function PhotoSpaceTool({ space }: { space: PhotoSpace }) {
  const spaces = usePhotoSpaces();
  if (!spaces.canFill) return null;
  return (
    <>
      <ToolButton
        tool={{
          id: "photo",
          name: "image-plus",
          label: spaces.isUploading ? "Subiendo tu foto…" : "Subir foto",
          run: () => spaces.open(space),
        }}
      />
      <input
        accept="image/png,image/jpeg,image/webp"
        aria-hidden="true"
        className="visually-hidden"
        onChange={(event) => spaces.onFile(event.target.files?.[0])}
        ref={spaces.input}
        tabIndex={-1}
        type="file"
      />
    </>
  );
}

function BlockTools({
  block,
  onCanvas,
  fontSize,
  onEditText,
}: {
  block: DesignBlock;
  onCanvas: boolean;
  fontSize: number | null;
  onEditText: (blockId: string) => void;
}) {
  const { design, type, change, actions, select, canEditHtml } = useStudio();
  const { notify } = useToast();
  const id = block.id;
  const item = onCanvas ? canvasItemOf(design, id)?.item : null;
  const locked = Boolean(item?.locked);
  const layer = onCanvas ? canvasLayerOf(design, id) : null;
  const target = colorTarget(block);
  const style = (patch: Partial<BlockStyle>, key?: string) =>
    change((current) => setBlockStyle(current, id, patch), key);
  const label = blockKindLabel(block.kind, type);

  const size = block.style?.fontSize ?? (fontSize ? Math.round(fontSize) : 16);
  const nextSize = (step: number) =>
    Math.min(72, Math.max(12, Math.round(size + step)));

  const align = block.style?.align ?? "start";
  const nextAlign =
    align === "start" ? "center" : align === "center" ? "end" : "start";
  const alignIcon: IconName =
    align === "center"
      ? "align-center"
      : align === "end"
        ? "align-right"
        : "align-left";

  return (
    <Bar label={label}>
      <span className="es-tb-label">{label}</span>
      {block.kind === "image" && !block.imageRef ? (
        <PhotoSpaceTool space={{ kind: "block", blockId: id }} />
      ) : null}
      {writesOnPage(block.kind) ? (
        <ToolButton
          tool={{
            id: "edit",
            name: "edit",
            label: "Escribir en la página (Enter)",
            run: () => onEditText(id),
            blocked: locked ? "Desbloquéalo para editarlo" : null,
          }}
        />
      ) : null}
      {target ? (
        <ColorTool
          label={target === "text" ? "Color del texto" : "Color de relleno"}
          onPick={(color) =>
            target === "shape"
              ? change(
                  (current) =>
                    updateBlock(current, id, (value) =>
                      value.kind === "shape"
                        ? { ...value, fill: color }
                        : value,
                    ),
                  `${id}:fill`,
                )
              : style(
                  target === "fill" ? { background: color } : { color },
                  `${id}:color`,
                )
          }
          value={currentColor(block, target)}
        />
      ) : null}
      {textKinds.has(block.kind) ? (
        <span className="es-tb-size">
          <ToolButton
            tool={{
              id: "smaller",
              name: "minus",
              label: "Letra más chica",
              run: () => style({ fontSize: nextSize(-2) }, `${id}:size`),
              blocked: size <= 12 ? "Es el tamaño mínimo" : null,
            }}
          />
          <output aria-label="Tamaño de letra" className="es-tb-value">
            {size}
          </output>
          <ToolButton
            tool={{
              id: "bigger",
              name: "plus",
              label: "Letra más grande",
              run: () => style({ fontSize: nextSize(2) }, `${id}:size`),
              blocked: size >= 72 ? "Es el tamaño máximo" : null,
            }}
          />
        </span>
      ) : null}
      {alignKinds.has(block.kind) ? (
        <ToolButton
          tool={{
            id: "align",
            name: alignIcon,
            label:
              nextAlign === "center"
                ? "Centrar"
                : nextAlign === "end"
                  ? "Alinear a la derecha"
                  : "Alinear a la izquierda",
            run: () => style({ align: nextAlign }),
          }}
        />
      ) : null}
      {blockHasShapeControls(block) ? <ShapeTool block={block} /> : null}
      <Separator />
      {onCanvas && layer ? (
        <>
          <ToolButton
            tool={{
              id: "front",
              icon: BringToFront,
              label: "Traer al frente",
              run: () =>
                change((current) => moveCanvasLayer(current, id, "front")),
              blocked:
                layer.position >= layer.count - 1
                  ? "Ya está hasta el frente"
                  : null,
            }}
          />
          <ToolButton
            tool={{
              id: "back",
              icon: SendToBack,
              label: "Enviar atrás",
              run: () =>
                change((current) => moveCanvasLayer(current, id, "back")),
              blocked: layer.position <= 0 ? "Ya está hasta atrás" : null,
            }}
          />
          <CanvasAlignMenu ids={[id]} />
        </>
      ) : (
        <>
          <ToolButton
            tool={{
              id: "up",
              name: "arrow-up",
              label: "Mover arriba",
              run: () => actions.moveBlockStep(id, -1),
              blocked: canMoveBlockStep(design, id, -1)
                ? null
                : "Ya está hasta arriba",
            }}
          />
          <ToolButton
            tool={{
              id: "down",
              name: "arrow-down",
              label: "Mover abajo",
              run: () => actions.moveBlockStep(id, 1),
              blocked: canMoveBlockStep(design, id, 1)
                ? null
                : "Ya está hasta abajo",
            }}
          />
        </>
      )}
      {item?.r ? (
        <ToolButton
          tool={{
            id: "unrotate",
            icon: RotateCcw,
            label: `Quitar el giro (${item.r}°)`,
            run: () => change((current) => rotateCanvasItem(current, id, 0)),
            blocked: locked ? "Desbloquéalo para girarlo" : null,
          }}
        />
      ) : null}
      <ToolButton
        tool={{
          id: "duplicate",
          name: "duplicate",
          label: "Duplicar (⌘D)",
          run: () => actions.duplicateBlock(id),
          blocked: duplicateBlockBlocker(design, type, id, canEditHtml),
        }}
      />
      {onCanvas ? (
        locked ? (
          <ToolButton
            tool={{
              id: "unlock",
              icon: LockOpen,
              label: "Desbloquear",
              pressed: true,
              run: () =>
                change((current) =>
                  setCanvasItemsFlag(current, [id], "locked", false),
                ),
            }}
          />
        ) : (
          <ToolButton
            tool={{
              id: "lock",
              name: "lock",
              label: "Bloquear posición",
              pressed: false,
              run: () => {
                change((current) =>
                  setCanvasItemsFlag(current, [id], "locked", true),
                );
                notify(
                  "Bloqueaste su posición: ya no se mueve por error.",
                  "info",
                );
              },
            }}
          />
        )
      ) : null}
      <ToolButton
        tool={{
          id: "remove",
          name: "trash",
          label: "Eliminar (Supr)",
          danger: true,
          run: () => {
            actions.removeBlock(id);
            select(null);
          },
          blocked: removeBlockBlocker(design, type, id, canEditHtml),
        }}
      />
    </Bar>
  );
}

/** Align (to the canvas for one block, to each other for several) and
 * distribute (three or more). */
function CanvasAlignMenu({ ids }: { ids: readonly string[] }) {
  const { change } = useStudio();
  const measured = (blockId: string) => measuredItemHeight(blockId);
  const aligns: { value: CanvasAlign; label: string; icon: ToolIcon }[] = [
    { value: "left", label: "Izquierda", icon: AlignStartVertical },
    { value: "center", label: "Centro", icon: AlignCenterVertical },
    { value: "right", label: "Derecha", icon: AlignEndVertical },
    { value: "top", label: "Arriba", icon: AlignStartHorizontal },
    { value: "middle", label: "En medio", icon: AlignCenterHorizontal },
    { value: "bottom", label: "Abajo", icon: AlignEndHorizontal },
  ];
  const single = ids.length === 1;
  return (
    <DropdownMenu.Root>
      <Tooltip
        content={single ? "Alinear en el espacio libre" : "Alinear y repartir"}
      >
        <DropdownMenu.Trigger asChild>
          <button
            aria-label={
              single ? "Alinear en el espacio libre" : "Alinear y repartir"
            }
            className="es-tb-tool es-tb-menu"
            type="button"
          >
            <Glyph icon={AlignCenterVertical} />
            <Icon name="chevron-down" size={11} />
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="es-tb-dropdown"
          collisionPadding={12}
          sideOffset={6}
        >
          <DropdownMenu.Label className="es-tb-dropdown-title">
            {single ? "Alinear en el espacio libre" : "Alinear entre sí"}
          </DropdownMenu.Label>
          {aligns.map((align) => (
            <DropdownMenu.Item
              className="es-tb-dropdown-item"
              key={align.value}
              onSelect={() =>
                change((current) =>
                  alignCanvasItems(current, ids, align.value, measured),
                )
              }
            >
              <Glyph icon={align.icon} />
              {align.label}
            </DropdownMenu.Item>
          ))}
          {ids.length >= 3 ? (
            <>
              <DropdownMenu.Separator className="es-tb-dropdown-sep" />
              <DropdownMenu.Label className="es-tb-dropdown-title">
                Repartir el espacio
              </DropdownMenu.Label>
              <DropdownMenu.Item
                className="es-tb-dropdown-item"
                onSelect={() =>
                  change((current) =>
                    distributeCanvasItems(current, ids, "horizontal", measured),
                  )
                }
              >
                <Glyph icon={AlignHorizontalDistributeCenter} />
                Horizontal
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="es-tb-dropdown-item"
                onSelect={() =>
                  change((current) =>
                    distributeCanvasItems(current, ids, "vertical", measured),
                  )
                }
              >
                <Glyph icon={AlignVerticalDistributeCenter} />
                Vertical
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function GroupTools({ ids }: { ids: readonly string[] }) {
  const { design, type, change, select, contentIds, canEditHtml } = useStudio();
  const { notify } = useToast();
  const items = ids
    .map((id) => canvasItemOf(design, id)?.item)
    .filter((item) => item !== undefined);
  const allLocked = items.length > 0 && items.every((item) => item?.locked);
  return (
    <Bar label={`${ids.length} bloques`}>
      <span className="es-tb-label">{ids.length} bloques</span>
      <CanvasAlignMenu ids={ids} />
      <Separator />
      <ToolButton
        tool={{
          id: "duplicate",
          name: "duplicate",
          label: "Duplicar (⌘D)",
          run: () => {
            const result = duplicateCanvasItems(
              design,
              type,
              ids,
              idFactoryFor(design, contentIds),
              canEditHtml,
            );
            if (result.ids.length) {
              change(() => result.design);
              select(selectionOf(result.ids));
            }
            if (result.reason) notify(result.reason, "info");
          },
        }}
      />
      <ToolButton
        tool={
          allLocked
            ? {
                id: "unlock",
                icon: LockOpen,
                label: "Desbloquear",
                pressed: true,
                run: () =>
                  change((current) =>
                    setCanvasItemsFlag(current, ids, "locked", false),
                  ),
              }
            : {
                id: "lock",
                name: "lock",
                label: "Bloquear posición",
                pressed: false,
                run: () =>
                  change((current) =>
                    setCanvasItemsFlag(current, ids, "locked", true),
                  ),
              }
        }
      />
      <ToolButton
        tool={{
          id: "remove",
          name: "trash",
          label: "Eliminar (Supr)",
          danger: true,
          run: () => {
            const result = removeCanvasItems(design, type, ids);
            if (result.removed) change(() => result.design);
            if (result.reason) notify(result.reason, "info");
            select(null);
          },
        }}
      />
    </Bar>
  );
}

function SectionTools({ sectionId }: { sectionId: string }) {
  const { design, type, actions, canEditHtml } = useStudio();
  const convert = useConvertToCanvas();
  const section = findSection(design, sectionId);
  if (!section) return null;
  const index = sectionIndexOf(design, sectionId);
  const canvas = isCanvasSection(section);
  const convertBlocked = canvas ? null : convert.blocker(sectionId);
  return (
    <Bar label={`la sección ${index + 1}`}>
      <span className="es-tb-label">
        {canvas ? `Espacio libre ${index + 1}` : `Sección ${index + 1}`}
      </span>
      {isOpenImageBackground(section.background) ? (
        <PhotoSpaceTool space={{ kind: "section-background", sectionId }} />
      ) : null}
      {!canvas ? (
        <Tooltip
          content={convertBlocked ?? "Mueve cada bloque a donde quieras"}
        >
          <button
            aria-disabled={convertBlocked ? true : undefined}
            className="es-tb-action"
            onClick={() => {
              if (!convertBlocked) void convert.convert(sectionId);
            }}
            type="button"
          >
            <Icon name="move-to" size={15} />
            Convertir en espacio libre
          </button>
        </Tooltip>
      ) : null}
      <Separator />
      <ToolButton
        tool={{
          id: "up",
          name: "arrow-up",
          label: "Mover arriba la sección",
          run: () => actions.moveSectionStep(sectionId, -1),
          blocked: index > 0 ? null : "Ya es la primera sección",
        }}
      />
      <ToolButton
        tool={{
          id: "down",
          name: "arrow-down",
          label: "Mover abajo la sección",
          run: () => actions.moveSectionStep(sectionId, 1),
          blocked:
            index < design.sections.length - 1
              ? null
              : "Ya es la última sección",
        }}
      />
      <ToolButton
        tool={{
          id: "duplicate",
          name: "duplicate",
          label: "Duplicar sección",
          run: () => actions.duplicateSection(sectionId),
          blocked: duplicateSectionBlocker(design, sectionId, canEditHtml),
        }}
      />
      <ToolButton
        tool={{
          id: "remove",
          name: "trash",
          label: "Eliminar sección",
          danger: true,
          run: () => actions.removeSection(sectionId),
          blocked: removeSectionBlocker(design, type, sectionId, canEditHtml),
        }}
      />
    </Bar>
  );
}

/** "Forma": the same "Forma" section the inspector shows, in a popover —
 * the floating toolbar's own answer to "no sé en qué apartado poder mover
 * la forma". One click applies, ⌘Z undoes, like every other quick action. */
function ShapeTool({ block }: { block: DesignBlock }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Tooltip content="Forma">
        <Popover.Trigger asChild>
          <button aria-label="Forma" className="es-tb-tool" type="button">
            <Icon name="blend" size={15} />
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          aria-label="Forma"
          className="es-tb-popover es-tb-popover-shape"
          collisionPadding={12}
          sideOffset={8}
        >
          <ShapeSection block={block} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Palette colors first (they follow the page), then the brand and a
 * free color. */
function ColorTool({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string | undefined;
  onPick: (color: string) => void;
}) {
  const { design, swatches } = useStudio();
  const [open, setOpen] = useState(false);
  const shown = resolveColor(design, value);
  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Tooltip content={label}>
        <Popover.Trigger asChild>
          <button aria-label={label} className="es-tb-tool" type="button">
            <span
              aria-hidden="true"
              className="es-tb-swatch"
              style={{ background: shown }}
            />
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          aria-label={label}
          className="es-tb-popover"
          collisionPadding={12}
          sideOffset={8}
        >
          <p className="es-tb-dropdown-title">De tu página</p>
          <div className="es-tb-swatches">
            {colorTokens.map((token) => (
              <button
                aria-label={colorTokenLabels[token]}
                aria-pressed={value === token}
                className="es-tb-color"
                key={token}
                onClick={() => {
                  onPick(token);
                  setOpen(false);
                }}
                style={{ background: design.style.palette[token] }}
                title={colorTokenLabels[token]}
                type="button"
              />
            ))}
          </div>
          <p className="es-tb-dropdown-title">Más colores</p>
          <div className="es-tb-swatches">
            {swatches.map((swatch) => (
              <button
                aria-label={swatch.name}
                aria-pressed={
                  value?.toLowerCase() === swatch.color.toLowerCase()
                }
                className="es-tb-color"
                key={swatch.color}
                onClick={() => {
                  onPick(swatch.color.toLowerCase());
                  setOpen(false);
                }}
                style={{ background: swatch.color }}
                title={swatch.name}
                type="button"
              />
            ))}
            <label
              className="es-tb-color es-tb-custom"
              title="Elegir otro color"
            >
              <span className="visually-hidden">Elegir otro color</span>
              <input
                onChange={(event) => onPick(event.target.value.toLowerCase())}
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(shown) ? shown : "#000000"}
              />
            </label>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function resolveColor(design: PageDesign, value: string | undefined): string {
  if (!value) return design.style.palette.text;
  if (isColorToken(value)) return design.style.palette[value];
  return value;
}
