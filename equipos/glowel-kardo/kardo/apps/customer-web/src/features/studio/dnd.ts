import {
  type Announcements,
  type CollisionDetection,
  closestCenter,
  pointerWithin,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import type { DesignBlockKind } from "@kardo/contracts";

/**
 * Drag and drop of the Estudio: blocks from "Agregar bloque" (palette), and
 * blocks and sections from Capas. Targets are Capas rows and columns, the
 * columns of the live preview and its canvases ("lienzo libre", where a
 * block lands at the pointer). Keyboard users get the same moves with
 * Space/Enter + arrows in Capas, and buttons everywhere else.
 */

export type DragData =
  | { type: "palette"; kind: DesignBlockKind; label: string }
  | {
      type: "block";
      blockId: string;
      sectionId: string;
      columnIndex: number;
      label: string;
    }
  | { type: "section"; sectionId: string; label: string };

export type DropData =
  | {
      type: "block";
      blockId: string;
      sectionId: string;
      columnIndex: number;
      label: string;
    }
  | {
      type: "column";
      origin: "layers" | "stage";
      sectionId: string;
      columnIndex: number;
      label: string;
    }
  | { type: "section"; sectionId: string; label: string }
  /** A canvas of the preview (stage/CanvasOverlay.tsx). */
  | { type: "canvas"; sectionId: string; label: string };

export const stageColumnId = (sectionId: string, columnIndex: number) =>
  `stage:${sectionId}:${columnIndex}`;
export const layersColumnId = (sectionId: string, columnIndex: number) =>
  `layers:${sectionId}:${columnIndex}`;
export const sectionDragId = (sectionId: string) => `section:${sectionId}`;
export const stageCanvasId = (sectionId: string) => `stage-canvas:${sectionId}`;

function dataOf(container: { data: { current?: unknown } }): DropData | null {
  return (container.data.current as DropData | undefined) ?? null;
}

/**
 * Sections only meet sections. Blocks and palette items go to the row,
 * column or canvas under the pointer (a Capas row wins over its column,
 * Capas over the preview); with the keyboard, to the closest Capas row or
 * column.
 */
export const studioCollisions: CollisionDetection = (args) => {
  const active = args.active.data.current as DragData | undefined;
  if (!active) return [];
  if (active.type === "section")
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => dataOf(container)?.type === "section",
      ),
    });
  const candidates = args.droppableContainers.filter((container) => {
    const data = dataOf(container);
    return (
      data?.type === "block" ||
      data?.type === "column" ||
      data?.type === "canvas"
    );
  });
  if (args.pointerCoordinates) {
    const within = pointerWithin({ ...args, droppableContainers: candidates });
    const rank = (id: string | number) => {
      const data = dataOf(
        candidates.find((container) => container.id === id) ?? {
          data: {},
        },
      );
      if (data?.type === "block") return 0;
      return data?.type === "column" && data.origin === "layers" ? 1 : 2;
    };
    return [...within].sort((a, b) => rank(a.id) - rank(b.id));
  }
  return closestCenter({
    ...args,
    droppableContainers: candidates.filter((container) => {
      const data = dataOf(container);
      return (
        data?.type !== "canvas" &&
        !(data?.type === "column" && data.origin === "stage")
      );
    }),
  });
};

const labelOf = (data: unknown) =>
  (data as { label?: string } | undefined)?.label ?? "el elemento";

export const studioAnnouncements: Announcements = {
  onDragStart({ active }) {
    return `Tomaste ${labelOf(active.data.current)}. Usa las flechas para moverlo y Espacio para soltarlo. Escape cancela.`;
  },
  onDragOver({ active, over }) {
    return over
      ? `${labelOf(active.data.current)} está sobre ${labelOf(over.data.current)}.`
      : `${labelOf(active.data.current)} no está sobre un lugar válido.`;
  },
  onDragEnd({ active, over }) {
    return over
      ? `Soltaste ${labelOf(active.data.current)} en ${labelOf(over.data.current)}.`
      : `Soltaste ${labelOf(active.data.current)} sin moverlo.`;
  },
  onDragCancel({ active }) {
    return `Cancelaste el movimiento de ${labelOf(active.data.current)}.`;
  },
};

export const studioScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Para mover este elemento pulsa Espacio o Enter, muévelo con las flechas y vuelve a pulsar Espacio para soltarlo. Escape cancela.",
};
