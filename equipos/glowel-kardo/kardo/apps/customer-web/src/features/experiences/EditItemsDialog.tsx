import type { ExperienceContent, ExperienceSummary } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { experiencesApi } from "../../api/experiences.js";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import { republishInPlace } from "./assign.js";
import {
  changedElsewhereMessage,
  isChangedElsewhere,
} from "./draft-conflict.js";
import {
  type ItemsPageType,
  itemsNoun,
  itemsSaveMode,
  withPrefilledRow,
  withReconciledDesign,
} from "./edit-items.js";
import type { SectionRows } from "./items/pasted-list.js";
import {
  QuickItemsEditor,
  quickItemsSummary,
} from "./items/QuickItemsEditor.js";
import { contentFromRows, rowsFromContent } from "./items/rows.js";
import { pagePlanFor } from "./page-types.js";

const defaultSection = (type: ItemsPageType) =>
  type === "menu" ? "Menú" : "Productos";

/** "platillos", "servicios"… for this organization's giro. */
export function useItemsNoun(type: ItemsPageType): {
  one: string;
  many: string;
} {
  const plan = pagePlanFor(useWorkspaceProfile().data?.industry);
  return itemsNoun(type, plan.type === type ? plan.noun : null);
}

/**
 * «Editar productos»: a Menú's dishes or a Catálogo's products as rows of
 * name and price, from the Experience and from Disponibilidad, with the
 * same quick editor as Primeros pasos. Saves the draft and, when the page
 * is already live with nothing else pending, publishes it at once.
 * `focusItem` puts the cursor on one item's price (Disponibilidad's
 * «Cambiar precio»).
 */
export function EditItemsDialog({
  open,
  experience,
  focusItem,
  prefillName,
  onClose,
  onSaved,
}: {
  open: boolean;
  experience: ExperienceSummary & { type: ItemsPageType };
  focusItem?: { id: string; name: string } | null | undefined;
  /** S1 (Disponibilidad → «Agregarlo»): a new row starts with this name
   * already typed, so finishing it is the only thing left to do. */
  prefillName?: string | null | undefined;
  onClose: () => void;
  /** After saving (and publishing, when it did), with the saved content. */
  onSaved?:
    | ((result: {
        published: boolean;
        content: ExperienceContent;
        /** The draft revision after this save (domain audit A2-22). */
        draftRevision: number | undefined;
      }) => void)
    | undefined;
}) {
  const { workspace, upsertExperience, refreshPublicationState } =
    useWorkspace();
  const { notify } = useToast();
  const type = experience.type;
  const noun = useItemsNoun(type);
  const mode = itemsSaveMode(experience);

  const [base, setBase] = useState<ExperienceContent | null>(null);
  // The revision of the draft just read: the save is refused when someone
  // else saved in between (domain audit A2-22).
  const [revision, setRevision] = useState<number | undefined>(undefined);
  const [hasConflict, setHasConflict] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [sections, setSections] = useState<SectionRows[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Every opening reads the draft again: it may have changed in the Estudio.
  // `reloadCount` reads it again after a conflict.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadCount is the retrigger
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBase(null);
    setError(null);
    setHasConflict(false);
    void experiencesApi
      .get(workspace.id, experience.id, controller.signal)
      .then((detail) => {
        const content = detail.experience.content as ExperienceContent;
        setBase(content);
        setRevision(detail.experience.draftRevision);
        const rows = rowsFromContent(type, content, defaultSection(type));
        setSections(withPrefilledRow(rows, prefillName));
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      });
    return () => controller.abort();
  }, [open, workspace.id, experience.id, type, prefillName, reloadCount]);

  // «Cambiar precio», and S1's «Agregarlo»: the cursor lands on the price
  // of, respectively, the item picked or the new prefilled row.
  useEffect(() => {
    if (!open || !base) return;
    const name = focusItem?.name ?? prefillName;
    if (!name?.trim()) return;
    const input = document.querySelector<HTMLInputElement>(
      `.edit-items input[aria-label="Precio de ${CSS.escape(name.trim())}"]`,
    );
    input?.focus();
    input?.select();
  }, [open, base, focusItem, prefillName]);

  const summary = quickItemsSummary(sections);

  async function save() {
    if (!base) return;
    setError(null);
    setIsSaving(true);
    try {
      const next = withReconciledDesign(
        type,
        contentFromRows({
          type,
          base,
          sections,
          title: experience.name,
          defaultSection: defaultSection(type),
        }),
        base,
      );
      const updated = await experiencesApi.update(workspace.id, experience.id, {
        name: experience.name,
        content: next,
        ...(revision !== undefined ? { expectedDraftRevision: revision } : {}),
      });
      upsertExperience(updated);
      const publish = mode === "publish";
      if (publish) {
        // Where the page already is; never taking a QR from another page.
        await republishInPlace(workspace.id, experience.id);
        void refreshPublicationState();
      }
      notify(
        publish
          ? `Listo. Tus clientes verán tus ${noun.many} nuevos en unos segundos.`
          : mode === "save-pending"
            ? "Guardado. Publica tu página cuando termines tus otros cambios."
            : "Guardado. Tus clientes lo verán cuando publiques tu página.",
        "success",
      );
      onSaved?.({
        published: publish,
        content: updated.content as ExperienceContent,
        draftRevision: updated.draftRevision,
      });
      onClose();
    } catch (requestError) {
      if (isChangedElsewhere(requestError)) {
        setHasConflict(true);
        setError(changedElsewhereMessage);
      } else setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      description={
        mode === "publish"
          ? `Escribe cada ${noun.one} con su precio. Al guardar se publica en tus QR.`
          : mode === "save-pending"
            ? `Escribe cada ${noun.one} con su precio. Tu página tiene otros cambios sin publicar: esto se guarda con ellos y lo publicas cuando termines.`
            : `Escribe cada ${noun.one} con su precio. Tus clientes lo verán cuando publiques tu página.`
      }
      footer={
        <>
          <button
            className="button button-secondary"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={
              !base || isSaving || summary.filled === 0 || summary.priceErrors
            }
            onClick={() => void save()}
            type="button"
          >
            {isSaving
              ? "Guardando…"
              : mode === "publish"
                ? "Guardar y publicar"
                : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title={`Tus ${noun.many} en «${experience.name}»`}
    >
      <div className="edit-items">
        {error ? (
          <Notice
            action={
              hasConflict ? (
                <button
                  className="text-action"
                  onClick={() => setReloadCount((count) => count + 1)}
                  type="button"
                >
                  Recargar
                </button>
              ) : null
            }
            tone="danger"
          >
            {error}
          </Notice>
        ) : null}
        {base ? (
          <QuickItemsEditor
            defaultSection={defaultSection(type)}
            noun={noun}
            onChange={setSections}
            sections={sections}
            type={type}
          />
        ) : error ? null : (
          <Skeleton label={`Cargando tus ${noun.many}…`} lines={4} />
        )}
      </div>
    </Dialog>
  );
}
