import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  type CanvasItem,
  type CanvasSection,
  type DesignBlock,
  type DesignSection,
  isCanvasSection,
  type PageSection,
} from "@kardo/contracts";
import { DropdownMenu } from "radix-ui";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
} from "react";
import { Icon, type IconName } from "../../../components/Icon.js";
import { Tooltip } from "../../../components/Tooltip.js";
import { layersColumnId, sectionDragId } from "../dnd.js";
import { LayoutGlyph } from "../inspector/controls.js";
import { layoutLabels } from "../labels.js";
import {
  blockKindIcon,
  blockKindLabel,
  blockSummary,
  isBoundKind,
} from "../model/blocks.js";
import { canvasLayerOf, moveCanvasLayer } from "../model/canvas.js";
import { applyStack, stackOrder } from "../model/canvas-items.js";
import {
  duplicateBlockBlocker,
  duplicateSectionBlocker,
  moveToSectionBlocker,
  removeBlockBlocker,
  removeSectionBlocker,
} from "../model/limits.js";
import {
  canMoveBlockStep,
  setCanvasItemFlags,
  updateCanvasSection,
} from "../model/operations.js";
import { useStudio } from "../StudioContext.js";
import { useConvertToCanvas } from "../stage/canvas-convert.js";
import { CanvasGlyph } from "./AddBlockPanel.js";

/** Where a block dragged from another column would land (a line on a row). */
export type LayersDrop = { overId: string; placement: "before" | "after" };
export const LayersDropContext = createContext<LayersDrop | null>(null);

function transformStyle(
  transform: { x: number; y: number } | null,
  transition: string | undefined,
): CSSProperties {
  return {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
  };
}

/**
 * Capas: the outline of the page (sections → columns → blocks). Rows select;
 * grips drag (pointer, or Space + arrows); every move also has a menu item.
 * A canvas section ("lienzo libre") lists its blocks in reading order (top
 * to bottom, then left to right): their order comes from where they sit,
 * so they are not dragged here.
 */
export function LayersPanel() {
  const { design } = useStudio();
  return (
    <div className="es-layers">
      <SortableContext
        items={design.sections.map((section) => sectionDragId(section.id))}
        strategy={verticalListSortingStrategy}
      >
        {design.sections.map((section, index) => (
          <LayerSection index={index} key={section.id} section={section} />
        ))}
      </SortableContext>
    </div>
  );
}

function LayerSection({
  section,
  index,
}: {
  section: PageSection;
  index: number;
}) {
  const {
    design,
    type,
    selection,
    select,
    actions,
    readOnly,
    issues,
    canEditHtml,
  } = useStudio();
  const toCanvas = useConvertToCanvas();
  const label = `Sección ${index + 1}`;
  const canvas = isCanvasSection(section);
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionDragId(section.id),
    data: {
      type: "section",
      sectionId: section.id,
      label: `la ${label.toLowerCase()}`,
    },
    disabled: readOnly,
  });
  const selected = selection?.kind === "section" && selection.id === section.id;
  const flagged = issues.some(
    (issue) => issue.sectionId === section.id && !issue.blockId,
  );
  const menu: MenuItem[] = [
    {
      label: "Mover arriba la sección",
      icon: "arrow-up",
      blocked: index > 0 ? null : "Ya es la primera",
      run: () => actions.moveSectionStep(section.id, -1),
    },
    {
      label: "Mover abajo la sección",
      icon: "arrow-down",
      blocked: index < design.sections.length - 1 ? null : "Ya es la última",
      run: () => actions.moveSectionStep(section.id, 1),
    },
    ...(canvas
      ? []
      : [
          {
            label: "Convertir en espacio libre",
            icon: "frame" as const,
            blocked: toCanvas.blocker(section.id),
            run: () => void toCanvas.convert(section.id),
          },
        ]),
    {
      label: "Duplicar sección",
      icon: "duplicate",
      blocked: duplicateSectionBlocker(design, section.id, canEditHtml),
      run: () => actions.duplicateSection(section.id),
    },
    {
      label: "Eliminar sección",
      icon: "trash",
      blocked: removeSectionBlocker(design, type, section.id, canEditHtml),
      run: () => actions.removeSection(section.id),
      danger: true,
    },
  ];

  return (
    <div
      className="es-layer-section"
      data-canvas={canvas || undefined}
      data-dragging={isDragging || undefined}
      ref={setNodeRef}
      style={transformStyle(transform, transition)}
    >
      <div
        className="es-layer-row es-layer-section-row"
        data-selected={selected || undefined}
      >
        {!readOnly ? (
          <button
            aria-label={`Mover ${label}`}
            className="es-grip"
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
          >
            <Icon name="grip" size={15} />
          </button>
        ) : null}
        <button
          aria-current={selected || undefined}
          className="es-layer-select"
          onClick={() => select({ kind: "section", id: section.id })}
          type="button"
        >
          {canvas ? <CanvasGlyph /> : <LayoutGlyph layout={section.layout} />}
          <span className="es-layer-name">
            <strong>{label}</strong>
            <small>
              {canvas
                ? "Espacio libre"
                : `${layoutLabels[section.layout]}${section.card ? " · Tarjeta" : ""}`}
            </small>
          </span>
          {flagged ? (
            <span className="es-issue-dot" title="Falta completar" />
          ) : null}
        </button>
        {!readOnly ? <RowMenu items={menu} label={label} /> : null}
      </div>
      {canvas ? (
        <LayerCanvas section={section} />
      ) : (
        <div className="es-layer-columns">
          {section.columns.map((column, columnIndex) => (
            <LayerColumn
              blocks={column}
              columnIndex={columnIndex}
              // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
              key={columnIndex}
              section={section}
              sectionNumber={index + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LayerColumn({
  section,
  sectionNumber,
  columnIndex,
  blocks,
}: {
  section: DesignSection;
  sectionNumber: number;
  columnIndex: number;
  blocks: DesignBlock[];
}) {
  const many = section.columns.length > 1;
  const label = many
    ? `la columna ${columnIndex + 1} de la sección ${sectionNumber}`
    : `la sección ${sectionNumber}`;
  const { setNodeRef, isOver } = useDroppable({
    id: layersColumnId(section.id, columnIndex),
    data: {
      type: "column",
      origin: "layers",
      sectionId: section.id,
      columnIndex,
      label,
    },
  });
  return (
    <div
      className="es-layer-column"
      data-over={isOver || undefined}
      ref={setNodeRef}
    >
      {many ? (
        <p className="es-layer-column-title">Columna {columnIndex + 1}</p>
      ) : null}
      <SortableContext
        items={blocks.map((block) => block.id)}
        strategy={verticalListSortingStrategy}
      >
        {blocks.length ? (
          blocks.map((block) => (
            <LayerBlock
              block={block}
              columnIndex={columnIndex}
              key={block.id}
              sectionId={section.id}
            />
          ))
        ) : (
          <p className="es-layer-empty">Vacía. Arrastra aquí un bloque.</p>
        )}
      </SortableContext>
    </div>
  );
}

/** Moves to every other section, with the reason when one cannot take it. */
function moveToItems(
  design: ReturnType<typeof useStudio>["design"],
  type: ReturnType<typeof useStudio>["type"],
  actions: ReturnType<typeof useStudio>["actions"],
  block: DesignBlock,
  sectionId: string,
  canEditHtml: boolean,
): MenuItem[] {
  return design.sections
    .filter((section) => section.id !== sectionId)
    .map((section) => ({
      label: `Mover a la sección ${design.sections.indexOf(section) + 1}${isCanvasSection(section) ? " (espacio libre)" : ""}`,
      icon: "move-to" as const,
      blocked: moveToSectionBlocker(
        design,
        type,
        block.id,
        section.id,
        canEditHtml,
      ),
      run: () => actions.moveBlockToSection(block.id, section.id),
    }));
}

function LayerBlock({
  block,
  sectionId,
  columnIndex,
}: {
  block: DesignBlock;
  sectionId: string;
  columnIndex: number;
}) {
  const {
    type,
    design,
    selection,
    select,
    actions,
    readOnly,
    issues,
    canEditHtml,
  } = useStudio();
  const drop = useContext(LayersDropContext);
  const label = blockKindLabel(block.kind, type);
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    data: {
      type: "block",
      blockId: block.id,
      sectionId,
      columnIndex,
      label: `«${label}»`,
    },
    disabled: readOnly,
  });
  const selected = selection?.kind === "block" && selection.id === block.id;

  return (
    <div
      className="es-layer-row es-layer-block"
      data-drop={drop?.overId === block.id ? drop.placement : undefined}
      data-dragging={isDragging || undefined}
      data-selected={selected || undefined}
      ref={setNodeRef}
      style={transformStyle(transform, transition)}
    >
      {!readOnly ? (
        <button
          aria-label={`Mover ${label}`}
          className="es-grip"
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
        >
          <Icon name="grip" size={15} />
        </button>
      ) : null}
      <BlockSelect
        block={block}
        flagged={issues.some((issue) => issue.blockId === block.id)}
        label={label}
        onSelect={() => select({ kind: "block", id: block.id })}
        selected={selected}
      />
      {!readOnly ? (
        <RowMenu
          items={[
            {
              label: "Mover arriba",
              icon: "arrow-up",
              blocked: canMoveBlockStep(design, block.id, -1)
                ? null
                : "Ya está hasta arriba",
              run: () => actions.moveBlockStep(block.id, -1),
            },
            {
              label: "Mover abajo",
              icon: "arrow-down",
              blocked: canMoveBlockStep(design, block.id, 1)
                ? null
                : "Ya está hasta abajo",
              run: () => actions.moveBlockStep(block.id, 1),
            },
            ...moveToItems(
              design,
              type,
              actions,
              block,
              sectionId,
              canEditHtml,
            ),
            {
              label: "Duplicar",
              icon: "duplicate",
              blocked: duplicateBlockBlocker(
                design,
                type,
                block.id,
                canEditHtml,
              ),
              run: () => actions.duplicateBlock(block.id),
            },
            {
              label: "Eliminar",
              icon: "trash",
              blocked: removeBlockBlocker(design, type, block.id, canEditHtml),
              run: () => actions.removeBlock(block.id),
              danger: true,
            },
          ]}
          label={label}
        />
      ) : null}
    </div>
  );
}

/**
 * The blocks of a canvas, top of the list first, exactly like Canva: the
 * top row is the one drawn on top (front), the bottom row is the one drawn
 * first (back). Drag a row to change `z`; the pointer, a menu item
 * ("Traer al frente"…) and the keyboard (Space to grab, arrows to move) all
 * do the same thing.
 */
function LayerCanvas({ section }: { section: CanvasSection }) {
  const { change, readOnly } = useStudio();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  // stackOrder: back to front. The list reads front to back, top to bottom.
  const frontToBack = [...stackOrder(section.items)].reverse();
  const itemsById = new Map(
    section.items.map((item) => [item.block.id, item] as const),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = frontToBack.indexOf(String(active.id));
    const to = frontToBack.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(frontToBack, from, to);
    const backToFront = [...reordered].reverse();
    change((current) =>
      updateCanvasSection(current, section.id, (canvas) => ({
        ...canvas,
        items: applyStack(canvas.items, backToFront),
      })),
    );
  };

  return (
    <div className="es-layer-columns">
      <div className="es-layer-column">
        {frontToBack.length ? (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            sensors={sensors}
          >
            <SortableContext
              disabled={readOnly}
              items={frontToBack}
              strategy={verticalListSortingStrategy}
            >
              {frontToBack.map((blockId) => {
                const item = itemsById.get(blockId);
                return item ? (
                  <LayerCanvasItem
                    item={item}
                    key={blockId}
                    sectionId={section.id}
                  />
                ) : null;
              })}
            </SortableContext>
          </DndContext>
        ) : (
          <p className="es-layer-empty">
            Vacío. Agrega un bloque o arrástralo al espacio libre.
          </p>
        )}
      </div>
    </div>
  );
}

function LayerCanvasItem({
  item,
  sectionId,
}: {
  item: CanvasItem;
  sectionId: string;
}) {
  const {
    type,
    design,
    change,
    selection,
    select,
    actions,
    readOnly,
    issues,
    canEditHtml,
  } = useStudio();
  const { block } = item;
  const label = blockKindLabel(block.kind, type);
  const selected = selection?.kind === "block" && selection.id === block.id;
  const layer = canvasLayerOf(design, block.id);
  const onTop = !layer || layer.position === layer.count - 1;
  const atBack = !layer || layer.position === 0;
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    disabled: readOnly,
  });

  return (
    <div
      className="es-layer-row es-layer-block es-layer-placed"
      data-dragging={isDragging || undefined}
      data-selected={selected || undefined}
      ref={setNodeRef}
      style={transformStyle(transform, transition)}
    >
      {!readOnly ? (
        <button
          aria-label={`Mover ${label} en las capas`}
          className="es-grip"
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
        >
          <Icon name="grip" size={15} />
        </button>
      ) : null}
      <BlockSelect
        block={block}
        flagged={issues.some((issue) => issue.blockId === block.id)}
        label={label}
        onSelect={() => select({ kind: "block", id: block.id })}
        selected={selected}
      />
      {!readOnly ? (
        <span className="es-layer-flags">
          <Tooltip content={item.locked ? "Desbloquear" : "Bloquear"}>
            <button
              aria-label={`${item.locked ? "Desbloquear" : "Bloquear"} ${label}`}
              aria-pressed={Boolean(item.locked)}
              className="icon-button"
              data-active={item.locked || undefined}
              onClick={() =>
                change((current) =>
                  setCanvasItemFlags(current, block.id, {
                    locked: !item.locked,
                  }),
                )
              }
              type="button"
            >
              <Icon name="lock" size={14} />
            </button>
          </Tooltip>
          <Tooltip content={item.hidden ? "Mostrar" : "Ocultar"}>
            <button
              aria-label={`${item.hidden ? "Mostrar" : "Ocultar"} ${label}`}
              aria-pressed={Boolean(item.hidden)}
              className="icon-button"
              data-active={item.hidden || undefined}
              onClick={() =>
                change((current) =>
                  setCanvasItemFlags(current, block.id, {
                    hidden: !item.hidden,
                  }),
                )
              }
              type="button"
            >
              <Icon name={item.hidden ? "eye-off" : "eye"} size={14} />
            </button>
          </Tooltip>
        </span>
      ) : null}
      {!readOnly ? (
        <RowMenu
          items={[
            {
              label: "Traer al frente",
              icon: "arrow-up",
              blocked: onTop ? "Ya está al frente" : null,
              run: () =>
                change((current) =>
                  moveCanvasLayer(current, block.id, "front"),
                ),
            },
            {
              label: "Enviar al fondo",
              icon: "arrow-down",
              blocked: atBack ? "Ya está al fondo" : null,
              run: () =>
                change((current) => moveCanvasLayer(current, block.id, "back")),
            },
            ...moveToItems(
              design,
              type,
              actions,
              block,
              sectionId,
              canEditHtml,
            ),
            {
              label: "Duplicar",
              icon: "duplicate",
              blocked: duplicateBlockBlocker(
                design,
                type,
                block.id,
                canEditHtml,
              ),
              run: () => actions.duplicateBlock(block.id),
            },
            {
              label: "Eliminar",
              icon: "trash",
              blocked: removeBlockBlocker(design, type, block.id, canEditHtml),
              run: () => actions.removeBlock(block.id),
              danger: true,
            },
          ]}
          label={label}
        />
      ) : null}
    </div>
  );
}

function BlockSelect({
  block,
  label,
  selected,
  flagged,
  onSelect,
}: {
  block: DesignBlock;
  label: string;
  selected: boolean;
  flagged: boolean;
  onSelect: () => void;
}) {
  const summary = blockSummary(block);
  return (
    <button
      aria-current={selected || undefined}
      className="es-layer-select"
      onClick={onSelect}
      type="button"
    >
      <span
        aria-hidden="true"
        className="es-layer-icon"
        data-bound={isBoundKind(block.kind) || undefined}
      >
        <Icon name={blockKindIcon(block.kind)} size={15} />
      </span>
      <span className="es-layer-name">
        <strong>{label}</strong>
        {summary ? <small>{summary}</small> : null}
      </span>
      {flagged ? (
        <span className="es-issue-dot" title="Falta completar" />
      ) : null}
    </button>
  );
}

type MenuItem = {
  label: string;
  icon: IconName;
  blocked: string | null;
  run: () => void;
  danger?: boolean;
};

function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Acciones de ${label}`}
          className="es-row-menu"
          type="button"
        >
          <Icon name="more" size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="kd-dropdown-content"
          sideOffset={4}
        >
          {items.map((item) => (
            <MenuEntry item={item} key={item.label} />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuEntry({ item }: { item: MenuItem }): ReactNode {
  return (
    <DropdownMenu.Item
      className={
        item.danger
          ? "kd-dropdown-item kd-dropdown-item-danger"
          : "kd-dropdown-item"
      }
      disabled={Boolean(item.blocked)}
      onSelect={item.run}
      title={item.blocked ?? undefined}
    >
      <Icon name={item.icon} size={16} /> {item.label}
    </DropdownMenu.Item>
  );
}
