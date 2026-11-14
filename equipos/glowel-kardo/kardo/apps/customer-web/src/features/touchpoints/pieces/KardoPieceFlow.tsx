import type {
  KardoPieceClaimPreview,
  KardoPieceClaimResult,
  PieceModel,
  TouchpointGroup,
} from "@kardo/contracts";
import { pieceModels } from "@kardo/contracts";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { groupsApi } from "../../../api/groups.js";
import { kardoPiecesApi } from "../../../api/kardo-pieces.js";
import { Field } from "../../../components/Field.js";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import type { StepTrackItem } from "../../../components/StepTrack.js";
import { ApiRequestError, errorMessage } from "../../../lib/api.js";
import { formatDayMonth } from "../../../lib/format.js";
import { clearPendingPieceCode } from "../../../lib/pending-piece-code.js";
import { notifyPlanLimit } from "../../../lib/plan-required.js";
import { Link, type Route, useRouter } from "../../../lib/router.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { flattenGroupTree, indentedName, siblingNamed } from "../group-tree.js";
import { excludeLinks } from "../kind.js";
import { PieceThumb } from "./PieceThumb.js";
import {
  activateLabel,
  claimProblem,
  clearPieceDraft,
  codeHint,
  codeIsComplete,
  draftWithCode,
  emptyPieceDraft,
  formatCodeInput,
  loadPieceDraft,
  type PieceChoice,
  type PieceFlowDraft,
  type PieceGroupMode,
  panelSentence,
  pieceFlowSteps,
  piecesToActivate,
  previewHeadline,
  savePieceDraft,
} from "./piece-flow-model.js";
import { pieceViews } from "./pieces.js";

export type PieceFlow = {
  steps: StepTrackItem[];
  current: number;
  onSelect: (index: number) => void;
  body: ReactNode;
  footer: ReactNode;
  done: boolean;
};

/**
 * «Producto de Kardo» inside «Nuevo QR o etiqueta» (ADR 026): 1) which piece
 * you have (or a kit), 2) the code that came with it, 3) the names and,
 * for several, an optional group. A hook, so the dialog keeps one frame and
 * only swaps its body and footer. The code may arrive from the activation
 * card's QR (`/activar?codigo=`): then the pieces show right away.
 */
export function useKardoPieceFlow({
  active,
  initialCode,
  onBack,
  onClose,
}: {
  active: boolean;
  /** A code from the address or one that waited through the sign up. */
  initialCode: string | null;
  /** Back to the four kinds. */
  onBack: () => void;
  onClose: () => void;
}): PieceFlow {
  const {
    workspace,
    touchpoints,
    groups,
    upsertTouchpoint,
    refreshGroups,
    reloadWorkspaces,
  } = useWorkspace();
  const [draft, setDraft] = useState<PieceFlowDraft>(() =>
    emptyPieceDraft(workspace.id),
  );
  const [preview, setPreview] = useState<KardoPieceClaimPreview | null>(null);
  const [result, setResult] = useState<KardoPieceClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const existingNames = excludeLinks(touchpoints.data ?? []).map(
    (touchpoint) => touchpoint.operationalName,
  );
  const groupList = groups.data ?? [];

  const update = useCallback((patch: Partial<PieceFlowDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const checkCode = useCallback(
    async (code: string) => {
      if (!codeIsComplete(code)) return;
      setBusy(true);
      setError(null);
      try {
        const found = await kardoPiecesApi.preview(workspace.id, code);
        setPreview(found);
        const models = new Set(found.pieces.map((piece) => piece.model));
        const [only] = [...models];
        setDraft((current) => ({
          ...current,
          step: "name",
          // Many of the same piece go to a group named after them, like a
          // batch of tables; a mixed kit stays without one.
          ...(current.step !== "name" &&
          found.pieces.length > 1 &&
          models.size === 1 &&
          only
            ? { groupMode: "new", newGroupName: pieceViews[only].plural }
            : {}),
        }));
      } catch (cause) {
        setPreview(null);
        setDraft((current) => ({ ...current, step: "code" }));
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [workspace.id],
  );

  // Every time the flow opens: the draft of this tab (a reload), or the
  // code that came in the address, or a fresh start.
  useEffect(() => {
    if (!active) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    setResult(null);
    setError(null);
    setPreview(null);
    const saved = loadPieceDraft(workspace.id);
    const fromAddress = initialCode
      ? draftWithCode(workspace.id, initialCode)
      : null;
    const next =
      fromAddress &&
      (!saved || formatCodeInput(saved.code) !== fromAddress.code)
        ? fromAddress
        : (saved ?? emptyPieceDraft(workspace.id));
    setDraft(next);
    // Back at the names, or a code that came ready: show its pieces again.
    if (
      (next.step === "name" || fromAddress === next) &&
      codeIsComplete(next.code)
    )
      void checkCode(next.code);
  }, [active, initialCode, workspace.id, checkCode]);

  useEffect(() => {
    if (active && !result) savePieceDraft(draft);
  }, [active, draft, result]);

  const chosen = preview ? piecesToActivate(preview, draft, existingNames) : [];
  const problem = preview ? claimProblem(preview, draft, existingNames) : null;

  async function claim() {
    if (!preview || problem) return;
    setBusy(true);
    setError(null);
    try {
      let groupId: string | null = null;
      if (draft.groupMode === "existing") groupId = draft.groupId || null;
      if (draft.groupMode === "new") {
        const name = draft.newGroupName.trim();
        groupId =
          siblingNamed(groupList, null, name)?.id ??
          (await groupsApi.create(workspace.id, { name, kind: "group" })).id;
      }
      const claimed = await kardoPiecesApi.claim(workspace.id, {
        code: draft.code,
        pieces: chosen.map((piece) => ({
          touchpointId: piece.touchpointId,
          name: piece.name.trim(),
        })),
        groupId,
      });
      for (const touchpoint of claimed.touchpoints)
        upsertTouchpoint(touchpoint);
      if (groupId) void refreshGroups();
      if (claimed.panel?.endsAt) void reloadWorkspaces();
      clearPieceDraft();
      clearPendingPieceCode();
      setResult(claimed);
    } catch (cause) {
      setError(errorMessage(cause));
      if (
        cause instanceof ApiRequestError &&
        cause.code === "PIECE_NOT_CLAIMABLE"
      )
        void checkCode(draft.code);
      if (draft.groupMode === "new") void refreshGroups();
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setError(null);
    if (draft.step === "name") update({ step: "code" });
    else if (draft.step === "code") update({ step: "piece" });
    else onBack();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.step === "code") void checkCode(draft.code);
    else if (draft.step === "name") void claim();
  }

  const stepIndex = result
    ? pieceFlowSteps.length
    : draft.step === "piece"
      ? 1
      : draft.step === "code"
        ? 2
        : 3;
  const steps: StepTrackItem[] = [
    { label: "Objeto", done: true },
    {
      label: "Pieza",
      done: Boolean(draft.choice || preview || result) || stepIndex > 1,
    },
    { label: "Código", done: Boolean(preview || result) },
    { label: "Nombre", done: Boolean(result), locked: !preview },
  ];
  const onSelect = (index: number) => {
    if (result) return;
    setError(null);
    if (index === 0) onBack();
    else if (index === 1) update({ step: "piece" });
    else if (index === 2) update({ step: "code" });
    else if (index === 3 && preview) update({ step: "name" });
  };

  const body = result ? (
    <PieceDoneSummary result={result} />
  ) : (
    <form id="kardo-piece-step" onSubmit={submit}>
      {draft.step === "piece" ? (
        <PiecePickStep
          choice={draft.choice}
          onPick={(choice) => update({ choice, step: "code" })}
        />
      ) : draft.step === "code" ? (
        <PieceCodeStep
          busy={busy}
          choice={draft.choice}
          code={draft.code}
          error={error}
          onChange={(code) => {
            setError(null);
            update({ code: formatCodeInput(code) });
          }}
        />
      ) : preview ? (
        <PieceNameStep
          chosenCount={chosen.length}
          draft={draft}
          error={error}
          existingNames={existingNames}
          groups={groupList}
          preview={preview}
          problem={problem}
          update={update}
        />
      ) : (
        <p className="field-hint" aria-live="polite">
          Revisando tu código…
        </p>
      )}
    </form>
  );

  const footer = result ? (
    <PieceDoneActions onClose={onClose} result={result} />
  ) : (
    <>
      <button className="button button-secondary" onClick={back} type="button">
        <Icon name="arrow-left" size={16} /> Atrás
      </button>
      {draft.step === "code" ? (
        <button
          aria-busy={busy || undefined}
          className="button button-primary"
          disabled={busy || !codeIsComplete(draft.code)}
          form="kardo-piece-step"
          type="submit"
        >
          {busy ? "Revisando…" : "Revisar código"}
        </button>
      ) : draft.step === "name" && preview ? (
        <button
          aria-busy={busy || undefined}
          className="button button-primary"
          disabled={busy || problem !== null}
          form="kardo-piece-step"
          type="submit"
        >
          {busy ? "Activando…" : activateLabel(chosen.length)}
        </button>
      ) : null}
    </>
  );

  return {
    steps,
    current: Math.min(stepIndex, pieceFlowSteps.length - 1),
    onSelect,
    body,
    footer,
    done: Boolean(result),
  };
}

/** The four pieces, as the site shows them, and «Un kit o varias piezas». */
export function PiecePickStep({
  choice,
  onPick,
}: {
  choice: PieceChoice | null;
  onPick: (choice: PieceChoice) => void;
}) {
  return (
    <div className="tp-new-panel">
      <h3>¿Qué pieza tienes?</h3>
      <p className="field-hint">
        Elige la tuya para saber dónde viene su código. Si compraste un kit o
        varias piezas, actívalas todas de una vez con el código del pedido.
      </p>
      <div className="piece-picks">
        {pieceModels.map((model) => {
          const view = pieceViews[model];
          return (
            <button
              aria-pressed={choice === model}
              className={
                choice === model
                  ? "piece-pick piece-pick-selected"
                  : "piece-pick"
              }
              key={model}
              onClick={() => onPick(model)}
              type="button"
            >
              <img
                alt=""
                className="piece-pick-photo"
                height={150}
                loading="lazy"
                src={view.photo}
                width={240}
              />
              <strong>{view.name}</strong>
              <span className="piece-pick-measure">{view.measure}</span>
              <small>{view.line}</small>
            </button>
          );
        })}
      </div>
      <button
        aria-pressed={choice === "kit"}
        className={
          choice === "kit" ? "piece-kit piece-pick-selected" : "piece-kit"
        }
        onClick={() => onPick("kit")}
        type="button"
      >
        <span aria-hidden="true" className="piece-kit-thumbs">
          {pieceModels.map((model) => (
            <PieceThumb key={model} model={model} size={30} />
          ))}
        </span>
        <span>
          <strong>Compré un kit o varias piezas</strong>
          <small>Un solo código las activa todas.</small>
        </span>
        <Icon name="arrow-right" size={18} />
      </button>
    </div>
  );
}

export function PieceCodeStep({
  choice,
  code,
  error,
  busy,
  onChange,
}: {
  choice: PieceChoice | null;
  code: string;
  error: string | null;
  busy: boolean;
  onChange: (code: string) => void;
}) {
  return (
    <div className="tp-new-panel">
      <h3>Escribe el código de activación</h3>
      {choice && choice !== "kit" ? (
        <p className="piece-code-chosen">
          <PieceThumb model={choice} size={36} />
          {pieceViews[choice].name}
        </p>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field hint={codeHint(choice)} id="kardo-piece-code" label="Código">
        <input
          aria-busy={busy || undefined}
          autoCapitalize="characters"
          autoComplete="off"
          // biome-ignore lint/a11y/noAutofocus: the only field of this step.
          autoFocus
          className="piece-code-input"
          id="kardo-piece-code"
          inputMode="text"
          maxLength={11}
          onChange={(event) => onChange(event.target.value)}
          placeholder="ABCD-2345"
          spellCheck={false}
          value={code}
        />
      </Field>
      <p className="field-hint">
        El código sirve una sola vez y confirma que la pieza es tuya. Con él, su
        QR y su NFC quedan conectados a tu cuenta.
      </p>
    </div>
  );
}

export function PieceNameStep({
  preview,
  draft,
  existingNames,
  groups,
  chosenCount,
  problem,
  error,
  update,
}: {
  preview: KardoPieceClaimPreview;
  draft: PieceFlowDraft;
  existingNames: readonly string[];
  groups: readonly TouchpointGroup[];
  chosenCount: number;
  problem: string | null;
  error: string | null;
  update: (patch: Partial<PieceFlowDraft>) => void;
}) {
  const all = piecesToActivate(
    preview,
    { ...draft, skipped: [] },
    existingNames,
  );
  const single = all.length === 1;
  const panel = panelSentence(preview);
  const overLimit = chosenCount > preview.limit.fits;

  function rename(touchpointId: string, name: string) {
    update({ names: { ...draft.names, [touchpointId]: name } });
  }
  function toggle(touchpointId: string) {
    update({
      skipped: draft.skipped.includes(touchpointId)
        ? draft.skipped.filter((id) => id !== touchpointId)
        : [...draft.skipped, touchpointId],
    });
  }

  return (
    <div className="tp-new-panel">
      <h3>{single ? "Ponle nombre" : "Tus piezas"}</h3>
      <p className="piece-preview-headline">
        <span aria-hidden="true" className="piece-kit-thumbs">
          {[...new Set(all.map((piece) => piece.model))].map((model) => (
            <PieceThumb key={model} model={model} size={30} />
          ))}
        </span>
        <strong>{previewHeadline(preview)}</strong>
      </p>
      {preview.alreadyActive ? (
        <p className="field-hint">
          Ya activaste{" "}
          {preview.alreadyActive === 1
            ? "1 pieza"
            : `${preview.alreadyActive} piezas`}{" "}
          de este pedido. Estas son las que faltan.
        </p>
      ) : null}
      {panel ? <Notice tone="info">{panel}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {single ? (
        <Field
          counter={{ value: all[0]?.name.length ?? 0, max: 120 }}
          hint="Es interno: tus clientes no lo ven. Por ejemplo, dónde la vas a poner."
          id="kardo-piece-name"
          label="Nombre"
        >
          <input
            id="kardo-piece-name"
            maxLength={120}
            onChange={(event) =>
              all[0] && rename(all[0].touchpointId, event.target.value)
            }
            value={all[0]?.name ?? ""}
          />
        </Field>
      ) : (
        <ul className="piece-claim-list" aria-label="Piezas a activar">
          {all.map((piece) => {
            const skipped = draft.skipped.includes(piece.touchpointId);
            const id = `kardo-piece-${piece.touchpointId}`;
            return (
              <li
                className={
                  skipped ? "piece-claim piece-claim-skipped" : "piece-claim"
                }
                key={piece.touchpointId}
              >
                <input
                  aria-label={`Activar ${piece.name || pieceViews[piece.model].name}`}
                  checked={!skipped}
                  onChange={() => toggle(piece.touchpointId)}
                  type="checkbox"
                />
                <PieceThumb model={piece.model} size={34} />
                <label className="visually-hidden" htmlFor={id}>
                  Nombre de la pieza
                </label>
                <input
                  disabled={skipped}
                  id={id}
                  maxLength={120}
                  onChange={(event) =>
                    rename(piece.touchpointId, event.target.value)
                  }
                  value={piece.name}
                />
              </li>
            );
          })}
        </ul>
      )}
      {!single ? (
        <PieceGroupChoice draft={draft} groups={groups} update={update} />
      ) : null}
      {problem && !overLimit && !preview.planRequired ? (
        <p aria-live="polite" className="field-hint">
          {problem}
        </p>
      ) : null}
      {problem && (overLimit || preview.planRequired) ? (
        <Notice
          action={
            preview.planRequired ? (
              <Link
                className="button button-secondary button-small"
                to={{ name: "settings", section: "plan" }}
              >
                Elegir un plan
              </Link>
            ) : (
              <button
                className="button button-secondary button-small"
                onClick={() =>
                  notifyPlanLimit(403, "PLAN_LIMIT", { key: "touchpoints.max" })
                }
                type="button"
              >
                Agregar QR y etiquetas
              </button>
            )
          }
          tone="warning"
        >
          {problem}
        </Notice>
      ) : null}
    </div>
  );
}

function PieceGroupChoice({
  draft,
  groups,
  update,
}: {
  draft: PieceFlowDraft;
  groups: readonly TouchpointGroup[];
  update: (patch: Partial<PieceFlowDraft>) => void;
}) {
  const options: { id: PieceGroupMode; label: string }[] = [
    { id: "none", label: "Sin grupo" },
    ...(groups.length
      ? [{ id: "existing" as const, label: "Grupo que ya existe" }]
      : []),
    { id: "new", label: "Grupo nuevo" },
  ];
  return (
    <fieldset className="piece-group">
      <legend>¿Las juntas en un grupo?</legend>
      <div className="piece-group-options">
        {options.map((option) => (
          <label
            className={
              draft.groupMode === option.id
                ? "piece-group-option piece-group-option-selected"
                : "piece-group-option"
            }
            key={option.id}
          >
            <input
              checked={draft.groupMode === option.id}
              name="kardo-piece-group"
              onChange={() => update({ groupMode: option.id })}
              type="radio"
            />
            {option.label}
          </label>
        ))}
      </div>
      {draft.groupMode === "existing" ? (
        <Field id="kardo-piece-group-existing" label="Grupo">
          <select
            id="kardo-piece-group-existing"
            onChange={(event) => update({ groupId: event.target.value })}
            value={draft.groupId}
          >
            <option value="">Elige un grupo</option>
            {flattenGroupTree(groups).map(({ group, depth }) => (
              <option key={group.id} value={group.id}>
                {indentedName(group.name, depth)}
              </option>
            ))}
          </select>
        </Field>
      ) : draft.groupMode === "new" ? (
        <Field
          hint="Si ya existe un grupo con ese nombre, se agregan a ese."
          id="kardo-piece-group-new"
          label="Nombre del grupo"
        >
          <input
            id="kardo-piece-group-new"
            maxLength={80}
            onChange={(event) => update({ newGroupName: event.target.value })}
            value={draft.newGroupName}
          />
        </Field>
      ) : null}
    </fieldset>
  );
}

export function PieceDoneSummary({
  result,
}: {
  result: KardoPieceClaimResult;
}) {
  const count = result.touchpoints.length;
  const shown = result.touchpoints.slice(0, 6);
  const panel = result.panel;
  return (
    <div className="tp-new-done">
      <span aria-hidden="true" className="tp-new-done-icon">
        <Icon name="circle-check" size={30} />
      </span>
      <h3>
        {count === 1
          ? `«${result.touchpoints[0]?.operationalName ?? "Tu pieza"}» ya está activada`
          : `Tus ${count} piezas ya están activadas`}
      </h3>
      <ul className="piece-done-list">
        {shown.map((touchpoint) => (
          <li key={touchpoint.id}>
            {touchpoint.pieceModel ? (
              <PieceThumb
                model={touchpoint.pieceModel as PieceModel}
                size={26}
              />
            ) : null}
            {touchpoint.operationalName}
          </li>
        ))}
        {count > shown.length ? <li>y {count - shown.length} más</li> : null}
      </ul>
      <p>
        Su QR y su NFC ya son tuyos. Lo que muestren lo decides publicando una
        página, y puedes cambiarlo sin tocar las piezas.
      </p>
      {panel?.endsAt &&
      (panel.outcome === "trial" || panel.outcome === "courtesy") ? (
        <Notice tone="success">
          Tu panel queda activo hasta el {formatDayMonth(panel.endsAt)}. No te
          pedimos tarjeta.
        </Notice>
      ) : null}
    </div>
  );
}

function PieceDoneActions({
  result,
  onClose,
}: {
  result: KardoPieceClaimResult;
  onClose: () => void;
}) {
  const { navigate } = useRouter();
  const { can } = useWorkspace();
  const first = result.touchpoints[0];
  const groupId = first?.groupId ?? null;
  const sameGroup =
    groupId !== null &&
    result.touchpoints.every((touchpoint) => touchpoint.groupId === groupId);
  function go(route: Route) {
    onClose();
    navigate(route);
  }
  const publish: Route | null = !can("experiences.edit")
    ? null
    : result.touchpoints.length === 1 && first
      ? { name: "experience-new", touchpointId: first.id, groupId: null }
      : sameGroup
        ? { name: "experience-new", touchpointId: null, groupId }
        : null;
  return (
    <>
      <button
        className="button button-secondary"
        onClick={() =>
          go(
            result.touchpoints.length === 1 && first
              ? { name: "touchpoint", id: first.id }
              : { name: "touchpoints" },
          )
        }
        type="button"
      >
        {result.touchpoints.length === 1 ? "Ver la pieza" : "Ver la lista"}
      </button>
      {publish ? (
        <button
          className="button button-primary"
          onClick={() => go(publish)}
          type="button"
        >
          <Icon name="experience" size={16} /> Elegir qué abren
        </button>
      ) : null}
    </>
  );
}
