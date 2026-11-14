import type { QrDesign, QrTemplate, QrTemplateDetail } from "@kardo/contracts";
import { maxQrTemplatesPerWorkspace } from "@kardo/contracts";
import { RadioGroup } from "radix-ui";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { qrTemplatesApi } from "../../../../api/qr-designs.js";
import { Dialog } from "../../../../components/Dialog.js";
import { Icon } from "../../../../components/Icon.js";
import { Notice } from "../../../../components/Notice.js";
import { useToast } from "../../../../components/Toast.js";
import { ApiRequestError, errorMessage } from "../../../../lib/api.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import { flattenGroupTree } from "../../group-tree.js";
import { defaultQrDesign, qrGallery } from "../qr-design.js";
import { DesignThumbnail } from "./DesignThumbnail.js";
import { worstCasePreviewUrl } from "./fingerprints.js";
import { usageText, usageTotal, usedByText } from "./model.js";
import {
  TouchpointChecklist,
  toggleIds,
  useQrTouchpoints,
} from "./TouchpointChecklist.js";

const sampleName = "Mesa 12";

/** Library errors in plain words (the API's generic 409 is not enough). */
export function templateErrorMessage(
  error: unknown,
  usage?: { touchpoints: number; groups: number } | undefined,
): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "QR_TEMPLATE_LIMIT")
      return `Tu biblioteca admite hasta ${maxQrTemplatesPerWorkspace} diseños. Borra uno que ya no uses para guardar otro.`;
    if (error.code === "QR_TEMPLATE_IN_USE")
      return `No se puede borrar: ${usage && usageTotal(usage) ? usedByText(usage) : "todavía lo usan algunos QR o grupos"}. Aplícales otro diseño y vuelve a intentarlo.`;
  }
  return errorMessage(error);
}

// ---------------------------------------------------------------------------
// Name a design (new, rename, save the current look to the library).
// ---------------------------------------------------------------------------

export function NameDialog({
  open,
  title,
  description,
  initialName,
  confirmLabel,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  initialName: string;
  confirmLabel: string;
  onClose: () => void;
  /** Resolves to an error message, or `null` when done. */
  onSubmit: (name: string) => Promise<string | null>;
  children?: ReactNode | undefined;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError(null);
    // The name is what people type first (the dialog focuses its close button).
    const input = inputRef;
    const frame = window.requestAnimationFrame(() => {
      const element = input.current;
      element?.focus();
      element?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, initialName]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Ponle un nombre para encontrarlo después.");
      return;
    }
    setIsBusy(true);
    setError(null);
    const result = await onSubmit(trimmed);
    setIsBusy(false);
    if (result) setError(result);
  }

  return (
    <Dialog
      description={description}
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isBusy || undefined}
            className="button button-primary"
            disabled={isBusy}
            form={id}
            type="submit"
          >
            {isBusy ? "Guardando…" : confirmLabel}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size={children ? "large" : "medium"}
      title={title}
    >
      <form className="form-grid" id={id} onSubmit={submit}>
        <div className={error ? "field field-invalid" : "field"}>
          <div className="field-label-row">
            <label htmlFor={`${id}-name`}>Nombre del diseño</label>
            <span className="field-counter">{name.length}/60</span>
          </div>
          <input
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            id={`${id}-name`}
            maxLength={60}
            onChange={(event) =>
              setName(event.target.value.replace(/[<>]/g, ""))
            }
            placeholder="Ej. Mesas terraza"
            ref={inputRef}
            value={name}
          />
          {error ? (
            <p className="field-error" id={`${id}-error`}>
              <Icon name="circle-alert" size={14} />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
        {children}
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// New design: name + starting point (Kardo's design or a gallery template).
// ---------------------------------------------------------------------------

export function NewDesignDialog({
  open,
  onClose,
  onCreated,
  brandAssetId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (template: QrTemplate) => void;
  brandAssetId: string | null | undefined;
}) {
  const { workspace } = useWorkspace();
  const [start, setStart] = useState("kardo");
  const labelId = useId();
  const url = worstCasePreviewUrl();

  useEffect(() => {
    if (open) setStart("kardo");
  }, [open]);

  const starting: QrDesign =
    qrGallery.find((preset) => preset.id === start)?.design ?? defaultQrDesign;
  const startingName =
    qrGallery.find((preset) => preset.id === start)?.name ?? "Diseño Kardo";

  return (
    <NameDialog
      confirmLabel="Crear y editar"
      description="Empieza desde el diseño Kardo o una plantilla y ajústalo en el editor. Nada cambia en tus QR hasta que lo apliques."
      initialName=""
      onClose={onClose}
      onSubmit={async (name) => {
        try {
          const created = await qrTemplatesApi.create(workspace.id, {
            name,
            design: starting,
          });
          onCreated(created);
          return null;
        } catch (error) {
          return templateErrorMessage(error);
        }
      }}
      open={open}
      title="Nuevo diseño"
    >
      <div className="qrs-control">
        <div className="qrs-control-head">
          <span className="qrs-control-label" id={labelId}>
            Punto de partida
          </span>
          <span className="qrs-control-aside">{startingName}</span>
        </div>
        <RadioGroup.Root
          aria-labelledby={labelId}
          className="qrs-start-grid"
          onValueChange={(value) => {
            if (value) setStart(value);
          }}
          value={start}
        >
          {[
            { id: "kardo", name: "Diseño Kardo", design: defaultQrDesign },
            ...qrGallery,
          ].map((preset) => (
            <RadioGroup.Item
              className="qrs-template qrs-start-option"
              key={preset.id}
              value={preset.id}
            >
              <DesignThumbnail
                brandAssetId={brandAssetId}
                design={preset.design}
                nombre={sampleName}
                url={url}
                workspaceId={workspace.id}
              />
              <span className="qrs-template-name">{preset.name}</span>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </div>
    </NameDialog>
  );
}

// ---------------------------------------------------------------------------
// Pick a library design (optionally "none").
// ---------------------------------------------------------------------------

export function TemplatePickerDialog({
  open,
  title,
  description,
  confirmLabel,
  templates,
  currentId,
  noneLabel,
  brandAssetId,
  onClose,
  onPick,
  footerNote,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  templates: readonly QrTemplate[];
  currentId: string | null;
  /** Offers "none" (`null`) with this label. */
  noneLabel?: string | undefined;
  brandAssetId: string | null | undefined;
  onClose: () => void;
  /** Resolves to an error message, or `null` when done. */
  onPick: (templateId: string | null) => Promise<string | null>;
  footerNote?: ReactNode | undefined;
}) {
  const { workspace } = useWorkspace();
  const labelId = useId();
  const [value, setValue] = useState<string>(currentId ?? "none");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const url = worstCasePreviewUrl();

  useEffect(() => {
    if (!open) return;
    setValue(currentId ?? (noneLabel ? "none" : (templates[0]?.id ?? "")));
    setError(null);
  }, [open, currentId, noneLabel, templates]);

  async function confirm() {
    setIsBusy(true);
    setError(null);
    const result = await onPick(value === "none" ? null : value);
    setIsBusy(false);
    if (result) setError(result);
  }

  const unchanged = (currentId ?? "none") === value;

  return (
    <Dialog
      description={description}
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isBusy || undefined}
            className="button button-primary"
            disabled={isBusy || !value || unchanged}
            onClick={() => void confirm()}
            type="button"
          >
            {isBusy ? "Aplicando…" : confirmLabel}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title={title}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {templates.length || noneLabel ? (
        <RadioGroup.Root
          aria-labelledby={labelId}
          className="qrs-picker-grid"
          onValueChange={(next) => {
            if (next) setValue(next);
          }}
          value={value}
        >
          <span className="visually-hidden" id={labelId}>
            Diseños de la biblioteca
          </span>
          {noneLabel ? (
            <RadioGroup.Item className="qrs-template" value="none">
              <DesignThumbnail
                brandAssetId={brandAssetId}
                design={defaultQrDesign}
                nombre={sampleName}
                url={url}
                workspaceId={workspace.id}
              />
              <span className="qrs-template-name">{noneLabel}</span>
              <small className="qrs-template-meta">Sin diseño asignado</small>
            </RadioGroup.Item>
          ) : null}
          {templates.map((template) => (
            <RadioGroup.Item
              className="qrs-template"
              key={template.id}
              value={template.id}
            >
              <DesignThumbnail
                brandAssetId={brandAssetId}
                design={template.design}
                nombre={sampleName}
                url={url}
                workspaceId={workspace.id}
              />
              <span className="qrs-template-name">{template.name}</span>
              <small className="qrs-template-meta">
                {template.id === currentId
                  ? "En uso"
                  : usageText(template.usage)}
              </small>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      ) : (
        <p className="qrs-hint">
          Tu biblioteca todavía no tiene diseños. Créalos en Diseño del QR o
          guarda el diseño de un QR en la biblioteca.
        </p>
      )}
      {footerNote ? <p className="qrs-hint">{footerNote}</p> : null}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Apply a library design to Touchpoints and/or as the default of groups.
// ---------------------------------------------------------------------------

export function ApplyTemplateDialog({
  open,
  template,
  onClose,
  onApplied,
}: {
  open: boolean;
  template: { id: string; name: string } | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { workspace, groups, refreshGroups } = useWorkspace();
  const { notify } = useToast();
  const { sections } = useQrTouchpoints();
  const [detail, setDetail] = useState<QrTemplateDetail | null>(null);
  const [touchpointIds, setTouchpointIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [groupIds, setGroupIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!open || !template) return;
    setTouchpointIds(new Set());
    setGroupIds(new Set());
    setError(null);
    setDetail(null);
    const controller = new AbortController();
    qrTemplatesApi
      .get(workspace.id, template.id, controller.signal)
      .then(setDetail)
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, template, workspace.id]);

  const usedBy = new Set(detail?.touchpointIds ?? []);
  const groupsUsing = new Set(detail?.groupIds ?? []);
  const count = touchpointIds.size + groupIds.size;

  async function apply() {
    if (!template || !count) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await qrTemplatesApi.apply(workspace.id, template.id, {
        touchpointIds: [...touchpointIds],
        groupIds: [...groupIds],
      });
      const parts = [
        result.touchpoints ? `${result.touchpoints} QR` : null,
        result.groups
          ? `${result.groups} ${result.groups === 1 ? "grupo" : "grupos"}`
          : null,
      ].filter(Boolean);
      notify(
        `«${template.name}» se aplicó a ${parts.join(" y ") || "0 QR"}.${result.skipped ? ` ${result.skipped} no eran QR activos y se omitieron.` : ""}`,
      );
      if (groupIds.size) void refreshGroups();
      onApplied();
      onClose();
    } catch (requestError) {
      setError(templateErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Dialog
      description="Los QR ya impresos siguen funcionando: solo cambia cómo se verán las próximas impresiones."
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isBusy || undefined}
            className="button button-primary"
            disabled={isBusy || !count}
            onClick={() => void apply()}
            type="button"
          >
            {isBusy ? "Aplicando…" : `Aplicar (${count})`}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title={template ? `Aplicar «${template.name}»` : "Aplicar diseño"}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="qrs-apply">
        <fieldset className="qrs-batch-list">
          <legend>Como diseño por defecto de grupos</legend>
          {(groups.data ?? []).length ? (
            <ul className="qrs-apply-groups">
              {flattenGroupTree(groups.data ?? []).map(({ group, depth }) => {
                const already = groupsUsing.has(group.id);
                return (
                  <li
                    key={group.id}
                    style={{ marginLeft: `${(depth - 1) * 1.1}rem` }}
                  >
                    <label className="qrs-batch-row">
                      <input
                        checked={already || groupIds.has(group.id)}
                        disabled={already}
                        onChange={(event) =>
                          setGroupIds((current) =>
                            toggleIds(
                              current,
                              [group.id],
                              event.target.checked,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      <span className="qrs-batch-name">
                        <span>{group.name}</span>
                        <small>
                          {already
                            ? "Ya lo usa por defecto"
                            : `${group.touchpointCount} QR; también los que agregues después${
                                (group.totalTouchpointCount ?? 0) >
                                group.touchpointCount
                                  ? " y los de sus subgrupos sin diseño propio"
                                  : ""
                              }`}
                        </small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="qrs-hint">Aún no hay grupos en este espacio.</p>
          )}
        </fieldset>
        <TouchpointChecklist
          describe={(item) =>
            usedBy.has(item.id) ? "Ya usa este diseño" : null
          }
          legend="Tus QR"
          onToggle={(ids, checked) =>
            setTouchpointIds((current) => toggleIds(current, ids, checked))
          }
          sections={sections}
          selected={touchpointIds}
        />
        <p className="qrs-hint qrs-apply-note">
          Los QR elegidos dejan el diseño que tengan (también uno propio) y usan
          este. En un grupo, lo heredan los QR que no tienen diseño propio ni de
          la biblioteca, incluidos los que agregues después.
        </p>
      </div>
    </Dialog>
  );
}
