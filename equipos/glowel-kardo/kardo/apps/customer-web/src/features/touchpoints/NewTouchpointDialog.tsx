import type {
  ExperienceSummary,
  Touchpoint,
  TouchpointGroup,
} from "@kardo/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { groupsApi } from "../../api/groups.js";
import { qrTemplatesApi } from "../../api/qr-designs.js";
import { touchpointsApi } from "../../api/touchpoints.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Icon, type IconName } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { StepTrack } from "../../components/StepTrack.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { type Route, useRouter } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { showExperienceOn } from "../experiences/assign.js";
import { latestExperience } from "../experiences/quick-qr.js";
import {
  flattenGroupTree,
  groupPathLabel,
  indentedName,
  nearestServedName,
  parentChoices,
  siblingNamed,
} from "./group-tree.js";
import {
  effectiveKind,
  physicalTouchpointKinds,
  touchpointKindDescriptions,
  touchpointKindIcons,
  touchpointKindLabels,
} from "./kind.js";
import {
  BATCH_MAX,
  batchNamePreview,
  clampBatch,
  creationHeadline,
  creationNames,
  defaultSplits,
  emptyNewTouchpointDraft,
  evenSplits,
  type GroupMode,
  type GroupSplit,
  type NewTouchpointDraft,
  type NewTouchpointStep,
  newTouchpointSteps,
  orderSummary,
  splitProblem,
  splitRanges,
  stepIsComplete,
  touchpointKindExamples,
  touchpointNameSuggestions,
  withCountAt,
  withOrderDefaults,
} from "./new-touchpoint-model.js";
import { useKardoPieceFlow } from "./pieces/KardoPieceFlow.js";
import { clearPieceDraft } from "./pieces/piece-flow-model.js";

type CreatedGroup = { id: string; name: string; start: number; count: number };

export type Created =
  | { kind: "single"; touchpoint: Touchpoint; groupName: string | null }
  | {
      kind: "batch";
      prefix: string;
      count: number;
      /** The groups they went to, in order (empty: no group). */
      groups: CreatedGroup[];
      propagated: number;
    };

/**
 * "Nuevo touchpoint" as a short assistant in a dialog: 1) which physical
 * object, 2) what the team calls it (one, or many at once), 3) where it goes:
 * no group, a group that exists, a group created right there or, for many
 * at once, split across several groups. It ends on what to do next.
 */
export function NewTouchpointDialog({
  open,
  onClose,
  piece = false,
  pieceCode = null,
  onPiece,
  onLeavePiece,
}: {
  open: boolean;
  onClose: () => void;
  /** Opens on «Producto de Kardo» (`/activar`, ADR 026). */
  piece?: boolean;
  /** A code from the activation card's QR, or one that waited through the
   * sign up. */
  pieceCode?: string | null;
  /** «Producto de Kardo» picked: the page moves to `/activar`, so a reload
   * comes back to the same step. */
  onPiece?: () => void;
  /** Back to the four kinds from «Producto de Kardo». */
  onLeavePiece?: () => void;
}) {
  const { workspace, groups, upsertTouchpoint, refreshGroups, can } =
    useWorkspace();
  const [draft, setDraft] = useState<NewTouchpointDraft>(
    emptyNewTouchpointDraft,
  );
  const [step, setStep] = useState<NewTouchpointStep>("kind");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  // What a try that failed halfway already made (groups, split parts), so
  // trying again finishes the job instead of repeating it.
  const madeGroups = useRef(new Map<string, string>());
  const doneParts = useRef(new Map<string, CreatedGroup>());
  const donePropagated = useRef(0);
  const qrTemplates = useResource(
    open && draft.kind === "qr" ? `qr-templates:${workspace.id}` : null,
    (signal) => qrTemplatesApi.list(workspace.id, signal),
  );
  const groupList = groups.data ?? [];
  // The one group they all go to, when it already exists.
  const parentId = draft.newGroupParentId || null;
  const targetGroup =
    draft.groupMode === "existing"
      ? (groupList.find((group) => group.id === draft.groupId) ?? null)
      : draft.groupMode === "new"
        ? (siblingNamed(groupList, parentId, draft.newGroupName) ?? null)
        : null;
  const groupTemplateId = targetGroup?.qrTemplateId ?? null;
  const groupTemplateName = groupTemplateId
    ? (qrTemplates.data?.find((template) => template.id === groupTemplateId)
        ?.name ?? "diseño del grupo")
    : null;
  const templateName = draft.qrTemplateId
    ? (qrTemplates.data?.find((template) => template.id === draft.qrTemplateId)
        ?.name ?? null)
    : null;
  // What they receive on arrival: the nearest serving group of their chain.
  const groupHint = targetGroup
    ? nearestServedName(groupList, targetGroup.id)
    : draft.groupMode !== "none" && parentId
      ? nearestServedName(groupList, parentId)
      : null;
  const stepIndex = newTouchpointSteps.findIndex((item) => item.id === step);

  function update(patch: Partial<NewTouchpointDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  // `/activar` opens straight on «Producto de Kardo».
  useEffect(() => {
    if (open && piece)
      setDraft((current) =>
        current.kind === "kardo" ? current : { ...current, kind: "kardo" },
      );
  }, [open, piece]);

  const pieceFlow = useKardoPieceFlow({
    active: open && draft.kind === "kardo",
    initialCode: pieceCode,
    onBack: () => {
      clearPieceDraft();
      setDraft((current) => ({ ...current, kind: null }));
      setStep("kind");
      onLeavePiece?.();
    },
    onClose: () => close(),
  });

  function reset() {
    setDraft(emptyNewTouchpointDraft);
    setStep("kind");
    setError(null);
    setCreated(null);
    madeGroups.current = new Map();
    doneParts.current = new Map();
    donePropagated.current = 0;
  }

  function close() {
    // Leaving on purpose starts «Producto de Kardo» fresh next time; only a
    // reload keeps its step.
    if (draft.kind === "kardo") clearPieceDraft();
    onClose();
    // The dialog animates out with its last content; start fresh next time.
    window.setTimeout(reset, 250);
  }

  /** The id of the group with this name under `parentId`, creating it the
   * first time (names are unique among siblings). */
  async function groupIdFor(name: string): Promise<string> {
    const clean = name.trim();
    const key = `${parentId ?? ""}|${clean.toLowerCase()}`;
    const known =
      siblingNamed(groupList, parentId, clean)?.id ??
      madeGroups.current.get(key);
    if (known) return known;
    const group = await groupsApi.create(workspace.id, {
      name: clean,
      ...(parentId ? { parentId } : {}),
      kind: "group",
    });
    madeGroups.current.set(key, group.id);
    return group.id;
  }

  async function create() {
    if (
      !draft.kind ||
      draft.kind === "kardo" ||
      !stepIsComplete("details", draft)
    )
      return;
    const kind = draft.kind;
    setError(null);
    setIsSubmitting(true);
    const qrDesign =
      kind === "qr" && draft.qrTemplateId
        ? { qrTemplateId: draft.qrTemplateId }
        : {};
    const oneGroupName =
      draft.groupMode === "existing"
        ? (targetGroup?.name ?? "")
        : draft.groupMode === "new"
          ? draft.newGroupName.trim()
          : "";
    try {
      if (draft.mode === "single") {
        const groupId =
          draft.groupMode === "existing"
            ? draft.groupId
            : draft.groupMode === "new"
              ? await groupIdFor(draft.newGroupName)
              : null;
        const touchpoint = await touchpointsApi.create(workspace.id, {
          operationalName: draft.name.trim(),
          kind,
          ...(groupId ? { groupId } : {}),
          ...qrDesign,
        });
        upsertTouchpoint(touchpoint);
        setCreated({
          kind: "single",
          touchpoint,
          groupName: groupId ? oneGroupName : null,
        });
      } else {
        const prefix = draft.namePrefix.trim();
        const parts =
          draft.groupMode === "split"
            ? splitRanges(draft.start, draft.splits)
            : [{ name: oneGroupName, start: draft.start, count: draft.count }];
        for (const part of parts) {
          const key = `${prefix}|${part.start}|${part.count}|${part.name.toLowerCase()}`;
          if (doneParts.current.has(key)) continue;
          const groupId =
            draft.groupMode === "existing"
              ? draft.groupId
              : draft.groupMode !== "none" && part.name
                ? await groupIdFor(part.name)
                : null;
          const result = await touchpointsApi.createBatch(workspace.id, {
            namePrefix: prefix,
            start: part.start,
            count: part.count,
            kind,
            ...(groupId ? { groupId } : {}),
            ...qrDesign,
          });
          for (const touchpoint of result.touchpoints)
            upsertTouchpoint(touchpoint);
          doneParts.current.set(key, {
            id: groupId ?? "",
            name: groupId ? part.name : "",
            start: part.start,
            count: result.touchpoints.length,
          });
          donePropagated.current += result.propagatedPublications ?? 0;
        }
        const done = [...doneParts.current.values()];
        setCreated({
          kind: "batch",
          prefix,
          count: done.reduce((sum, part) => sum + part.count, 0),
          groups: done.filter((part) => part.id),
          propagated: donePropagated.current,
        });
      }
      if (draft.groupMode !== "none") void refreshGroups();
    } catch (requestError) {
      const done = [...doneParts.current.values()].reduce(
        (sum, part) => sum + part.count,
        0,
      );
      setError(
        done
          ? `${errorMessage(requestError)} Ya se crearon ${done}; intenta de nuevo para crear los que faltan.`
          : errorMessage(requestError),
      );
      if (madeGroups.current.size) void refreshGroups();
    } finally {
      setIsSubmitting(false);
    }
  }

  function next(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!stepIsComplete(step, draft)) return;
    if (step === "kind") setStep("name");
    else if (step === "name") {
      setDraft(withOrderDefaults);
      setStep("details");
    } else void create();
  }

  function back() {
    setError(null);
    if (step === "details") setStep("name");
    else if (step === "name") setStep("kind");
  }

  const isPiece = draft.kind === "kardo";
  const footer = isPiece ? (
    pieceFlow.footer
  ) : created ? (
    <CreatedActions
      canPublish={can("experiences.edit")}
      created={created}
      onAnother={reset}
      onClose={close}
    />
  ) : (
    <>
      <button
        className="button button-secondary"
        onClick={step === "kind" ? close : back}
        type="button"
      >
        {step === "kind" ? (
          "Cancelar"
        ) : (
          <>
            <Icon name="arrow-left" size={16} /> Atrás
          </>
        )}
      </button>
      {step !== "kind" ? (
        <button
          className="button button-primary"
          disabled={isSubmitting || !stepIsComplete(step, draft)}
          form="new-touchpoint-step"
          type="submit"
        >
          {step === "name" ? (
            <>
              Siguiente <Icon name="arrow-right" size={16} />
            </>
          ) : isSubmitting ? (
            "Creando…"
          ) : draft.mode === "single" ? (
            draft.kind === "qr" ? (
              "Crear QR"
            ) : draft.kind === "nfc" ? (
              "Crear etiqueta NFC"
            ) : (
              "Crear objeto"
            )
          ) : (
            `Crear ${draft.count} ${
              draft.kind === "qr"
                ? "QR"
                : draft.kind === "nfc"
                  ? "etiquetas NFC"
                  : "objetos"
            }`
          )}
        </button>
      ) : null}
    </>
  );

  return (
    <Dialog
      description={
        created || (isPiece && pieceFlow.done)
          ? undefined
          : isPiece
            ? "Activa la pieza que compraste a Kardo con el código que viene con ella. Su QR y su NFC quedan en tu cuenta."
            : "Lo que tus clientes escanean o tocan: un QR, una etiqueta NFC o una tarjeta. Si cambias lo que muestra, el QR sigue igual."
      }
      footer={footer}
      onClose={close}
      open={open}
      size="large"
      title={
        created || (isPiece && pieceFlow.done) ? "Listo" : "Nuevo QR o etiqueta"
      }
    >
      {isPiece ? (
        pieceFlow.done ? (
          pieceFlow.body
        ) : (
          <div className="tp-new">
            <StepTrack
              current={pieceFlow.current}
              items={pieceFlow.steps}
              onSelect={pieceFlow.onSelect}
            />
            {pieceFlow.body}
          </div>
        )
      ) : created ? (
        <CreatedSummary created={created} />
      ) : (
        <div className="tp-new">
          <StepTrack
            current={stepIndex}
            items={newTouchpointSteps.map((item, index) => ({
              label: item.label,
              done: index < stepIndex,
              locked: index >= stepIndex,
            }))}
            onSelect={(index) => {
              const target = newTouchpointSteps[index];
              if (target && index < stepIndex) setStep(target.id);
            }}
          />

          <form id="new-touchpoint-step" onSubmit={next}>
            {step === "kind" ? (
              <KindStep
                kind={draft.kind}
                onPick={(kind) => {
                  if (kind === "kardo") {
                    update({ kind, qrTemplateId: "" });
                    onPiece?.();
                    return;
                  }
                  update({
                    kind,
                    qrTemplateId: kind === "qr" ? draft.qrTemplateId : "",
                  });
                  setStep("name");
                }}
              />
            ) : step === "name" ? (
              <NameStep draft={draft} update={update} />
            ) : (
              <div className="tp-new-panel">
                {error ? <Notice tone="danger">{error}</Notice> : null}
                <OrderStep draft={draft} groups={groupList} update={update} />
                {groupHint ? (
                  <Notice tone="info">
                    {draft.mode === "single" ? "Recibirá" : "Recibirán"}{" "}
                    automáticamente «{groupHint}», lo que el grupo ya tiene
                    publicado.
                  </Notice>
                ) : null}
                {draft.kind === "qr" && qrTemplates.data?.length ? (
                  <Field
                    hint="Puedes cambiarlo cuando quieras en Diseño del QR; los QR impresos siguen funcionando."
                    id="new-touchpoint-qr-design"
                    label="Diseño del QR"
                    optional
                  >
                    <select
                      id="new-touchpoint-qr-design"
                      onChange={(event) =>
                        update({ qrTemplateId: event.target.value })
                      }
                      value={draft.qrTemplateId}
                    >
                      <option value="">
                        {groupTemplateName
                          ? `El del grupo («${groupTemplateName}»)`
                          : "Diseño Kardo por defecto"}
                      </option>
                      {qrTemplates.data.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <section aria-label="Resumen" className="tp-new-summary">
                  <span aria-hidden="true" className="tp-new-summary-icon">
                    <Icon
                      name={draft.kind ? touchpointKindIcons[draft.kind] : "qr"}
                      size={22}
                    />
                  </span>
                  <div>
                    <strong>Vas a crear {creationHeadline(draft)}</strong>
                    <p>{creationNames(draft)}</p>
                    <small>
                      {orderSummary(
                        draft,
                        targetGroup
                          ? groupPathLabel(groupList, targetGroup.id)
                          : null,
                        parentId ? groupPathLabel(groupList, parentId) : null,
                      )}
                      {draft.kind === "qr"
                        ? ` · ${templateName ? `diseño «${templateName}»` : groupTemplateName ? "diseño del grupo" : "diseño Kardo"}`
                        : ""}
                    </small>
                  </div>
                </section>
              </div>
            )}
          </form>
        </div>
      )}
    </Dialog>
  );
}

type OrderOption = {
  id: GroupMode;
  icon: IconName;
  label: string;
  description: string;
};

/** The choices in "Orden", most likely first. */
export function orderOptions(
  draft: Pick<NewTouchpointDraft, "mode" | "count" | "start" | "namePrefix">,
  hasGroups: boolean,
): OrderOption[] {
  const existing: OrderOption = {
    id: "existing",
    icon: "group",
    label: "Grupo que ya existe",
    description:
      draft.mode === "single"
        ? "Súmalo a uno de tus grupos."
        : "Súmalos a uno de tus grupos.",
  };
  if (draft.mode === "single")
    return [
      {
        id: "none",
        icon: "empty",
        label: "Sin grupo",
        description: "Lo agrupas después, si quieres.",
      },
      ...(hasGroups ? [existing] : []),
      {
        id: "new",
        icon: "plus",
        label: "Grupo nuevo",
        description: "Créalo aquí mismo; por ejemplo, el local o la zona.",
      },
    ];
  const prefix = draft.namePrefix.trim() || "Mesa";
  const half = Math.ceil(draft.count / 2);
  return [
    {
      id: "new",
      icon: "plus",
      label: "Grupo nuevo",
      description: `Los ${draft.count} juntos en un grupo nuevo.`,
    },
    ...(hasGroups ? [existing] : []),
    {
      id: "split",
      icon: "columns",
      label: "Varios grupos",
      description:
        draft.count >= 2
          ? `Ej. ${prefix} ${draft.start}–${draft.start + half - 1} en un local y ${prefix} ${draft.start + half}–${draft.start + draft.count - 1} en otro.`
          : "Reparte el lote en varios grupos.",
    },
    {
      id: "none",
      icon: "empty",
      label: "Sin grupo",
      description: "Los ordenas después desde la lista.",
    },
  ];
}

export function OrderStep({
  draft,
  groups,
  update,
}: {
  draft: NewTouchpointDraft;
  groups: readonly TouchpointGroup[];
  update: (patch: Partial<NewTouchpointDraft>) => void;
}) {
  const options = orderOptions(draft, groups.length > 0).filter(
    (option) => option.id !== "split" || draft.count >= 2,
  );
  const reused =
    draft.groupMode === "new"
      ? siblingNamed(groups, draft.newGroupParentId || null, draft.newGroupName)
      : undefined;

  function choose(groupMode: GroupMode) {
    const patch: Partial<NewTouchpointDraft> = {
      groupMode,
      orderTouched: true,
    };
    if (groupMode === "split" && draft.splits.length < 2)
      patch.splits = defaultSplits(draft.count);
    if (groupMode === "existing" && !draft.groupId && groups[0])
      patch.groupId = groups[0].id;
    update(patch);
  }

  return (
    <>
      <h3>
        {draft.mode === "single"
          ? "¿Va en un grupo?"
          : `¿Cómo ordenas estos ${draft.count}?`}
      </h3>
      <p className="field-hint">
        Un grupo junta QR y etiquetas de un local, una zona o un tipo de objeto:
        publicas una página en el grupo y llega a todos, también a los que
        agregues después.
      </p>
      <fieldset className="tp-new-order-options">
        <legend className="visually-hidden">Dónde van</legend>
        {options.map((option) => (
          <button
            aria-pressed={draft.groupMode === option.id}
            className={
              draft.groupMode === option.id
                ? "tp-new-order-option tp-new-order-option-selected"
                : "tp-new-order-option"
            }
            key={option.id}
            onClick={() => choose(option.id)}
            type="button"
          >
            <span aria-hidden="true" className="tp-new-order-icon">
              <Icon name={option.icon} size={18} />
            </span>
            <span className="tp-new-order-text">
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
          </button>
        ))}
      </fieldset>

      {(draft.groupMode === "new" || draft.groupMode === "split") &&
      groups.length ? (
        <ParentSelect
          groups={groups}
          onChange={(value) =>
            update({ newGroupParentId: value, orderTouched: true })
          }
          plural={draft.groupMode === "split"}
          value={draft.newGroupParentId}
        />
      ) : null}
      {draft.groupMode === "new" ? (
        <Field
          counter={{ value: draft.newGroupName.length, max: 120 }}
          hint={
            reused
              ? `Ya tienes «${reused.name}» aquí: se agregan a ese grupo.`
              : "Por ejemplo, el local, la zona o el tipo de objeto."
          }
          id="new-touchpoint-group-name"
          label="Nombre del grupo"
        >
          <input
            id="new-touchpoint-group-name"
            maxLength={120}
            onChange={(event) =>
              update({ newGroupName: event.target.value, orderTouched: true })
            }
            placeholder={
              draft.mode === "single" ? "Ej. Sucursal Centro" : "Ej. Mesas"
            }
            value={draft.newGroupName}
          />
        </Field>
      ) : draft.groupMode === "existing" ? (
        <Field id="new-touchpoint-group" label="Grupo">
          <select
            id="new-touchpoint-group"
            onChange={(event) => update({ groupId: event.target.value })}
            value={draft.groupId}
          >
            {flattenGroupTree(groups).map(({ group, depth }) => (
              <option key={group.id} value={group.id}>
                {indentedName(group.name, depth)} (
                {group.totalTouchpointCount ?? group.touchpointCount})
              </option>
            ))}
          </select>
        </Field>
      ) : draft.groupMode === "split" ? (
        <SplitEditor draft={draft} groups={groups} update={update} />
      ) : (
        <p className="field-hint">
          Cuando quieras, en la lista selecciona varios y muévelos a un grupo.
        </p>
      )}
    </>
  );
}

/** Where new groups go: the top level or inside an existing group. */
function ParentSelect({
  groups,
  value,
  plural,
  onChange,
}: {
  groups: readonly TouchpointGroup[];
  value: string;
  plural: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      hint={
        value
          ? `${plural ? "Los grupos nuevos quedarán" : "Quedará"} en «${groupPathLabel(groups, value)}».`
          : "Por ejemplo, dentro de un local para separar zonas o mesas."
      }
      id="new-touchpoint-group-parent"
      label={plural ? "Los grupos van dentro de" : "Dentro de"}
      optional
    >
      <select
        id="new-touchpoint-group-parent"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Ninguno (nivel principal)</option>
        {parentChoices(groups, null).map(({ group, depth }) => (
          <option key={group.id} value={group.id}>
            {indentedName(group.name, depth)}
          </option>
        ))}
      </select>
    </Field>
  );
}

const splitPlaceholders = [
  "Ej. Sucursal Centro",
  "Ej. Sucursal Norte",
  "Ej. Terraza",
  "Ej. Planta alta",
];
const SPLIT_MAX = 10;

/** Many at once, split into consecutive ranges, one group per range. */
export function SplitEditor({
  draft,
  groups,
  update,
}: {
  draft: NewTouchpointDraft;
  groups: readonly TouchpointGroup[];
  update: (patch: Partial<NewTouchpointDraft>) => void;
}) {
  const ranges = splitRanges(draft.start, draft.splits);
  const prefix = draft.namePrefix.trim();
  const problem = splitProblem(draft);
  // Missing names is the normal starting point, not an error.
  const missingNames = "Ponle nombre a cada grupo.";

  function setSplit(index: number, patch: Partial<GroupSplit>) {
    update({
      splits: draft.splits.map((split, at) =>
        at === index ? { ...split, ...patch } : split,
      ),
    });
  }

  return (
    <div className="tp-new-split">
      <datalist id="new-touchpoint-group-names">
        {groups
          .filter((group) => (group.parentId ?? "") === draft.newGroupParentId)
          .map((group) => (
            <option key={group.id} value={group.name} />
          ))}
      </datalist>
      <div aria-hidden="true" className="tp-new-split-head">
        <span>Grupo</span>
        <span>Cuántos</span>
        <span>Quedan</span>
      </div>
      <ol>
        {draft.splits.map((split, index) => {
          const range = ranges[index];
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional; each range follows the ones before it
            <li className="tp-new-split-row" key={index}>
              <label
                className="visually-hidden"
                htmlFor={`new-touchpoint-split-name-${index}`}
              >
                Nombre del grupo {index + 1}
              </label>
              <input
                id={`new-touchpoint-split-name-${index}`}
                list="new-touchpoint-group-names"
                maxLength={120}
                onChange={(event) =>
                  setSplit(index, { name: event.target.value })
                }
                placeholder={
                  splitPlaceholders[index % splitPlaceholders.length]
                }
                value={split.name}
              />
              <label
                className="visually-hidden"
                htmlFor={`new-touchpoint-split-count-${index}`}
              >
                Cuántos van al grupo {index + 1}
              </label>
              <input
                id={`new-touchpoint-split-count-${index}`}
                inputMode="numeric"
                max={BATCH_MAX}
                min={1}
                onChange={(event) =>
                  update({
                    splits: withCountAt(
                      draft.count,
                      draft.splits,
                      index,
                      event.target.value === ""
                        ? 0
                        : clampBatch(Number(event.target.value), 0, BATCH_MAX),
                    ),
                  })
                }
                type="number"
                value={split.count || ""}
              />
              <span className="tp-new-split-range">
                {range && range.count > 0 && prefix
                  ? range.count === 1
                    ? `${prefix} ${range.start}`
                    : `${prefix} ${range.start} a ${range.start + range.count - 1}`
                  : "—"}
              </span>
              <button
                aria-label={`Quitar el grupo ${index + 1}`}
                className="icon-button"
                disabled={draft.splits.length <= 2}
                onClick={() =>
                  update({
                    splits: evenSplits(
                      draft.count,
                      draft.splits.filter((_, at) => at !== index),
                    ),
                  })
                }
                title="Quitar este grupo"
                type="button"
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="tp-new-split-actions">
        <button
          className="button button-secondary button-small"
          disabled={draft.splits.length >= Math.min(SPLIT_MAX, draft.count)}
          onClick={() =>
            update({
              splits: evenSplits(draft.count, [
                ...draft.splits,
                { name: "", count: 0 },
              ]),
            })
          }
          type="button"
        >
          <Icon name="plus" size={14} /> Otro grupo
        </button>
        <button
          className="link-button"
          onClick={() =>
            update({ splits: evenSplits(draft.count, draft.splits) })
          }
          type="button"
        >
          Repartir parejo
        </button>
      </div>
      <p
        aria-live="polite"
        className={
          problem && problem !== missingNames
            ? "tp-new-split-status tp-new-split-problem"
            : "tp-new-split-status"
        }
      >
        {problem ??
          `Listo: ${draft.count} repartidos en ${draft.splits.length} grupos. Si un nombre ya existe, se agregan a ese grupo.`}
      </p>
    </div>
  );
}

export function KindStep({
  kind,
  onPick,
}: {
  kind: NewTouchpointDraft["kind"];
  onPick: (kind: NonNullable<NewTouchpointDraft["kind"]>) => void;
}) {
  return (
    <div className="tp-new-panel">
      <h3>¿Qué objeto vas a usar?</h3>
      {/* People who wanted a shareable social link created a QR instead
          (round 4: Karla, Ana, Mateo). Point them to Links up front. */}
      <p className="field-hint">
        ¿Solo quieres un enlace para compartir por WhatsApp o Instagram? Eso es
        un Link (en la sección «Links»), no un QR.
      </p>
      <div className="tp-new-kinds">
        {physicalTouchpointKinds.map((option) => (
          <button
            aria-pressed={kind === option}
            className={
              kind === option
                ? "tp-new-kind tp-new-kind-selected"
                : "tp-new-kind"
            }
            key={option}
            onClick={() => onPick(option)}
            type="button"
          >
            <span aria-hidden="true" className="tp-new-kind-icon">
              <Icon name={touchpointKindIcons[option]} size={26} />
            </span>
            <strong>{touchpointKindLabels[option]}</strong>
            <span className="tp-new-kind-description">
              {touchpointKindDescriptions[option]}
            </span>
            <small>{touchpointKindExamples[option]}</small>
          </button>
        ))}
      </div>
      <p className="field-hint">
        ¿Un mismo objeto llevará QR y NFC? Crea uno de cada formato: cada uno
        tiene su URL y sus visitas por separado. Las piezas de Kardo son la
        excepción: ya traen los dos y Analítica separa sus visitas.
      </p>
      {/* Paola created a separate QR as an NFC's backup (round 4): an NFC
          already includes one, from its own page. */}
      <p className="field-hint">
        Una etiqueta NFC ya trae su propio QR de respaldo (lo imprimes desde la
        etiqueta): no hace falta crear un QR aparte para eso.
      </p>
    </div>
  );
}

export function NameStep({
  draft,
  update,
}: {
  draft: NewTouchpointDraft;
  update: (patch: Partial<NewTouchpointDraft>) => void;
}) {
  const preview = batchNamePreview(draft);
  const kind = draft.kind ?? "qr";
  // Switching between one and many moves the cursor to the new name field.
  const panel = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on mode change only
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    panel.current
      ?.querySelector<HTMLInputElement>(
        "#new-touchpoint-name, #new-touchpoint-prefix",
      )
      ?.focus();
  }, [draft.mode]);
  return (
    <div className="tp-new-panel" ref={panel}>
      <h3>¿Cómo lo llama tu equipo?</h3>
      <fieldset className="segmented tp-new-mode">
        <legend className="visually-hidden">Cuántos crear</legend>
        {(
          [
            ["single", "Solo uno"],
            ["batch", "Varios a la vez"],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-pressed={draft.mode === value}
            className={
              draft.mode === value ? "segment segment-current" : "segment"
            }
            key={value}
            onClick={() => update({ mode: value })}
            type="button"
          >
            {label}
          </button>
        ))}
      </fieldset>

      {draft.mode === "single" ? (
        <>
          <Field
            counter={{ value: draft.name.length, max: 120 }}
            hint="Solo lo ven tú y tu equipo; tus clientes nunca."
            id="new-touchpoint-name"
            label="Nombre interno"
          >
            <input
              // biome-ignore lint/a11y/noAutofocus: the step's only field
              autoFocus
              id="new-touchpoint-name"
              maxLength={120}
              onChange={(event) => update({ name: event.target.value })}
              placeholder={`Ej. ${touchpointNameSuggestions[kind][0]}`}
              value={draft.name}
            />
          </Field>
          <fieldset className="tp-new-suggestions">
            <legend className="visually-hidden">Sugerencias</legend>
            {touchpointNameSuggestions[kind].map((suggestion) => (
              <button
                className="tp-new-chip"
                key={suggestion}
                onClick={() => update({ name: suggestion })}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </fieldset>
        </>
      ) : (
        <>
          <Field
            hint="Se numeran solos: «Mesa» crea Mesa 1, Mesa 2…"
            id="new-touchpoint-prefix"
            label="Nombre base"
          >
            <input
              // biome-ignore lint/a11y/noAutofocus: the step's first field
              autoFocus
              id="new-touchpoint-prefix"
              maxLength={100}
              onChange={(event) => update({ namePrefix: event.target.value })}
              placeholder="Ej. Mesa"
              value={draft.namePrefix}
            />
          </Field>
          <div className="form-grid-2 tp-new-numbers">
            <Field
              hint="El número del primero."
              id="new-touchpoint-start"
              label="Empieza en"
            >
              <input
                id="new-touchpoint-start"
                inputMode="numeric"
                max={9999}
                min={1}
                // Empty while typing (0), back to 1 when leaving the field.
                onBlur={() => {
                  if (draft.start < 1) update({ start: 1 });
                }}
                onChange={(event) =>
                  update({
                    start:
                      event.target.value === ""
                        ? 0
                        : clampBatch(Number(event.target.value), 0, 9999),
                  })
                }
                type="number"
                value={draft.start || ""}
              />
            </Field>
            <Field
              hint={`Hasta ${BATCH_MAX} por vez.`}
              id="new-touchpoint-count"
              label="Cuántos"
            >
              <input
                id="new-touchpoint-count"
                inputMode="numeric"
                max={BATCH_MAX}
                min={1}
                onBlur={() => {
                  if (draft.count < 1) update({ count: 1 });
                }}
                onChange={(event) =>
                  update({
                    count:
                      event.target.value === ""
                        ? 0
                        : clampBatch(Number(event.target.value), 0, BATCH_MAX),
                  })
                }
                type="number"
                value={draft.count || ""}
              />
            </Field>
          </div>
          {preview.names.length ? (
            <div aria-live="polite" className="tp-new-preview">
              <span className="field-hint">Se crearán:</span>
              <ul>
                {preview.names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
                {preview.last ? (
                  <>
                    <li aria-hidden="true" className="tp-new-preview-gap">
                      {preview.more > 0 ? `+${preview.more}` : "…"}
                    </li>
                    <li>{preview.last}</li>
                  </>
                ) : null}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const createdKindSentence: Record<
  NonNullable<NewTouchpointDraft["kind"]>,
  string
> = {
  qr: "Su URL es permanente: imprime su QR cuando quieras.",
  nfc: "Su URL es permanente: programa su etiqueta NFC cuando quieras.",
  other: "Su URL es permanente: compártela donde quieras.",
  kardo: "Su QR y su NFC ya abren su dirección permanente.",
};

export function CreatedSummary({ created }: { created: Created }) {
  return (
    <div className="tp-new-done">
      <span aria-hidden="true" className="tp-new-done-icon">
        <Icon name="circle-check" size={30} />
      </span>
      {created.kind === "single" ? (
        <>
          <h3>«{created.touchpoint.operationalName}» ya existe</h3>
          <p>
            {createdKindSentence[effectiveKind(created.touchpoint.kind)]} Lo que
            muestre lo decides publicando una página, y puedes cambiarlo sin
            tocar el objeto.
            {created.groupName
              ? ` Quedó en el grupo «${created.groupName}».`
              : ""}
          </p>
          <code className="tp-new-done-id">{created.touchpoint.publicId}</code>
        </>
      ) : (
        <>
          <h3>
            {created.count === 1
              ? "Se creó 1 QR o etiqueta"
              : `Se crearon ${created.count} QR y etiquetas`}
            {created.groups.length > 1
              ? ` en ${created.groups.length} grupos`
              : created.groups[0]
                ? ` en «${created.groups[0].name}»`
                : ""}
          </h3>
          {created.groups.length > 1 ? (
            <ul className="tp-new-done-groups">
              {created.groups.map((group) => (
                <li key={group.id}>
                  <Icon name="group" size={16} />
                  <strong>{group.name}</strong>
                  <span>
                    {group.count === 1
                      ? `${created.prefix} ${group.start}`
                      : `${created.prefix} ${group.start} a ${group.start + group.count - 1}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p>
            {created.propagated
              ? `${
                  created.groups.length === 1
                    ? `El grupo «${created.groups[0]?.name}» ya tenía`
                    : "Algunos grupos ya tenían"
                } una página publicada: se está publicando en ${
                  created.propagated === 1
                    ? "1 de ellos"
                    : `${created.propagated} de ellos`
                }.`
              : created.groups.length
                ? "Publica una página en el grupo para que todos muestren lo mismo."
                : "Cada uno tiene su URL permanente. Publica una página para decidir qué muestran."}
          </p>
        </>
      )}
    </div>
  );
}

function CreatedActions({
  created,
  canPublish,
  onAnother,
  onClose,
}: {
  created: Created;
  canPublish: boolean;
  onAnother: () => void;
  onClose: () => void;
}) {
  const { navigate } = useRouter();
  const { workspace, experiences, refreshPublicationState } = useWorkspace();
  const { notify } = useToast();
  const [isPublishing, setIsPublishing] = useState(false);
  // The Experience the person most likely wants on a new QR: the one they
  // edited last. "Publicar una Experience" used to open a new, empty one
  // even when theirs was ready (relevo 31, finding 1).
  const latest =
    created.kind === "single" ? latestExperience(experiences.data ?? []) : null;
  function go(route: Route) {
    onClose();
    navigate(route);
  }
  async function publishExisting(
    experience: ExperienceSummary,
    touchpoint: Touchpoint,
  ) {
    setIsPublishing(true);
    try {
      await showExperienceOn(workspace.id, experience, touchpoint.id);
      await refreshPublicationState();
      notify(
        `Publicando «${experience.name}» en «${touchpoint.operationalName}». Se activa en unos segundos.`,
        "success",
      );
      go({ name: "touchpoint", id: touchpoint.id });
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      setIsPublishing(false);
    }
  }
  return (
    <>
      {latest && canPublish ? null : (
        <button
          className="button button-secondary"
          onClick={onAnother}
          type="button"
        >
          <Icon name="plus" size={16} /> Crear otro
        </button>
      )}
      {created.kind === "single" ? (
        latest && canPublish ? (
          <>
            <button
              className="button button-secondary"
              disabled={isPublishing}
              onClick={() =>
                go({
                  name: "experience-new",
                  touchpointId: created.touchpoint.id,
                  groupId: null,
                })
              }
              type="button"
            >
              Crear una página nueva
            </button>
            <button
              aria-busy={isPublishing || undefined}
              className="button button-primary"
              disabled={isPublishing}
              onClick={() => void publishExisting(latest, created.touchpoint)}
              type="button"
            >
              <Icon name="experience" size={16} />
              {isPublishing ? "Publicando…" : `Publicar «${latest.name}»`}
            </button>
          </>
        ) : (
          <>
            <button
              className="button button-secondary"
              onClick={() =>
                go({ name: "touchpoint", id: created.touchpoint.id })
              }
              type="button"
            >
              Ver QR o etiqueta
            </button>
            {canPublish ? (
              <button
                className="button button-primary"
                onClick={() =>
                  go({
                    name: "experience-new",
                    touchpointId: created.touchpoint.id,
                    groupId: null,
                  })
                }
                type="button"
              >
                <Icon name="experience" size={16} /> Publicar una página
              </button>
            ) : null}
          </>
        )
      ) : (
        <>
          {canPublish && created.groups.length === 1 && !created.propagated ? (
            <button
              className="button button-secondary"
              onClick={() =>
                go({
                  name: "experience-new",
                  touchpointId: null,
                  groupId: created.groups[0]?.id ?? null,
                })
              }
              type="button"
            >
              <Icon name="experience" size={16} /> Publicar en el grupo
            </button>
          ) : null}
          <button
            className="button button-primary"
            onClick={onClose}
            type="button"
          >
            Ver la lista
          </button>
        </>
      )}
    </>
  );
}
