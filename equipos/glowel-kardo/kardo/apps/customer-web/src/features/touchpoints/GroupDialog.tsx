import type { TouchpointGroup, TouchpointGroupKind } from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { groupsApi } from "../../api/groups.js";
import { groupQrDesignApi, qrTemplatesApi } from "../../api/qr-designs.js";
import { ConfirmDialog, Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  groupDeleteTargetingNotice,
  groupKindDescriptions,
  groupNameSuggestions,
  groupTargetingExperienceNames,
  memberSections,
} from "./group-form-model.js";
import {
  GROUP_MAX_DEPTH,
  groupChain,
  groupKindLabels,
  groupPathLabel,
  indentedName,
  nearestServedName,
  parentChoices,
  siblingNamed,
} from "./group-tree.js";
import { KindBadge } from "./KindBadge.js";
import { effectiveKind, isPhysicalTouchpoint } from "./kind.js";
import { movedMessage } from "./MoveToGroupDialog.js";

const FORM_ID = "group-form";

/** Create or edit a group of Touchpoints (a location, a zone, a set of
 * tables). Groups nest (ADR 021): it can live inside another group. */
export function GroupDialog({
  open,
  group,
  defaultParentId = null,
  onClose,
}: {
  open: boolean;
  /** `null` creates a new group. */
  group: TouchpointGroup | null;
  /** For a new group: create it inside this one. */
  defaultParentId?: string | null;
  onClose: () => void;
}) {
  const { workspace, touchpoints, groups, experiences, refreshGroups } =
    useWorkspace();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [qrTemplateId, setQrTemplateId] = useState("");
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState<TouchpointGroupKind>("group");
  const [query, setQuery] = useState("");
  const qrTemplates = useResource(
    open ? `qr-templates:${workspace.id}` : null,
    (signal) => qrTemplatesApi.list(workspace.id, signal),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const items = touchpoints.data ?? [];
  // Retired Touchpoints are permanently withdrawn, and Links are a separate
  // product: neither is ever offered as a new group member (existing
  // memberships, if any, are preserved silently).
  const assignableItems = items.filter(
    (item) => item.status !== "retired" && isPhysicalTouchpoint(item),
  );
  const allGroups = groups.data ?? [];
  const groupNames = new Map(allGroups.map((item) => [item.id, item.name]));
  // Not inside itself or its subgroups, and never past the level limit.
  const parentOptions = parentChoices(allGroups, group?.id ?? null);
  // Without its own design, it uses the nearest group above that has one.
  const inheritedTemplateId = parentId
    ? (groupChain(allGroups, parentId)
        .reverse()
        .find((item) => item.qrTemplateId)?.qrTemplateId ?? null)
    : null;
  const inheritedTemplateName = inheritedTemplateId
    ? (qrTemplates.data?.find((item) => item.id === inheritedTemplateId)
        ?.name ?? "diseño de la biblioteca")
    : null;
  // A sibling with this exact name, in the same place. Creating with that
  // name merges into it instead of blocking (A9-12, decision 5): the same
  // behavior «Nuevo QR o etiqueta» and «Mover a grupo» already have.
  // Renaming an existing group to a taken name still blocks below: merging
  // two already-existing groups is not supported.
  const sibling = siblingNamed(allGroups, parentId || null, name);
  const mergeTarget = group ? null : (sibling ?? null);
  const taken = Boolean(group && sibling && sibling.id !== group.id);
  // What a Touchpoint joining it receives: the nearest serving group of its
  // chain (itself first, then the groups above) — or, when merging, what
  // the existing group itself already serves.
  const groupHint = group
    ? nearestServedName(allGroups, group.id)
    : mergeTarget
      ? nearestServedName(allGroups, mergeTarget.id)
      : parentId
        ? nearestServedName(allGroups, parentId)
        : null;
  const sections = memberSections({
    touchpoints: assignableItems,
    groups: allGroups,
    selfId: group?.id ?? null,
    query,
  });
  const moving = members.filter((id) => {
    const touchpoint = items.find((item) => item.id === id);
    return touchpoint?.groupId && touchpoint.groupId !== group?.id;
  }).length;
  // Joining an existing group needs something to move into it: an empty
  // move would only be refused by the server.
  const mergeIsEmpty = Boolean(!group && mergeTarget && members.length === 0);
  const canSave = Boolean(name.trim()) && !taken && !mergeIsEmpty && !isSaving;

  // Reset only when the dialog opens for a (possibly different) group; the
  // current Touchpoints are read at that moment on purpose.
  // biome-ignore lint/correctness/useExhaustiveDependencies: items are read at open time
  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setDescription(group?.description ?? "");
    setQrTemplateId(group?.qrTemplateId ?? "");
    setParentId(group ? (group.parentId ?? "") : (defaultParentId ?? ""));
    // A top-level group is usually a location; inside one, a zone or tables.
    setKind(
      group ? (group.kind ?? "group") : defaultParentId ? "group" : "location",
    );
    setMembers(
      group
        ? items
            .filter((item) => item.groupId === group.id)
            .map((item) => item.id)
        : [],
    );
    setQuery("");
    setError(null);
  }, [open, group, defaultParentId]);

  function toggle(ids: readonly string[], on: boolean) {
    setMembers((current) =>
      on
        ? [...new Set([...current, ...ids])]
        : current.filter((item) => !ids.includes(item)),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      const trimmedDescription = description.trim();
      if (!group && mergeTarget) {
        // A sibling with this name already exists: join it instead of
        // creating a new one, with the same endpoint «Mover a grupo» uses.
        const result = await groupsApi.move(
          workspace.id,
          members,
          mergeTarget.id,
        );
        notify(
          movedMessage(
            result.moved,
            mergeTarget.name,
            result.propagatedPublications,
          ),
        );
      } else if (!group) {
        const created = await groupsApi.create(workspace.id, {
          name: name.trim(),
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
          ...(parentId ? { parentId } : {}),
          kind,
          touchpointIds: members,
        });
        if (qrTemplateId)
          await groupQrDesignApi.setTemplate(
            workspace.id,
            created.id,
            qrTemplateId,
          );
        notify(
          `${kind === "location" ? "Local" : "Grupo"} «${created.name}» creado.`,
        );
      } else {
        await groupsApi.update(workspace.id, group.id, {
          name: name.trim(),
          description: trimmedDescription || null,
          parentId: parentId || null,
          kind,
        });
        await groupsApi.setTouchpoints(workspace.id, group.id, members);
        if ((group.qrTemplateId ?? "") !== qrTemplateId)
          await groupQrDesignApi.setTemplate(
            workspace.id,
            group.id,
            qrTemplateId || null,
          );
        notify("Cambios guardados.");
      }
      await refreshGroups();
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!group) return;
    setIsSaving(true);
    try {
      await groupsApi.remove(workspace.id, group.id);
      await refreshGroups();
      notify(
        group.parentId
          ? `«${group.name}» se eliminó; sus QR y etiquetas pasaron a «${groupNames.get(group.parentId) ?? "el grupo de arriba"}».`
          : `«${group.name}» se eliminó; sus QR y etiquetas siguen activos, sin grupo.`,
      );
      setIsConfirmingDelete(false);
      onClose();
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsSaving(false);
    }
  }

  const kindWord = kind === "location" ? "local" : "grupo";
  // A9-13: a page that targets this group directly loses that destination
  // silently when it is deleted. Name it instead of the generic warning.
  const targetingNames = group
    ? groupTargetingExperienceNames(experiences.data ?? [], group.id)
    : [];
  const deleteTargetingNotice = groupDeleteTargetingNotice(targetingNames);
  const deleteParentPhrase = group?.parentId
    ? `Los QR y etiquetas no se borran ni dejan de funcionar: pasan, con sus subgrupos, a «${groupNames.get(group.parentId) ?? "el grupo de arriba"}».`
    : "Los QR y etiquetas no se borran ni dejan de funcionar: quedan sin grupo, y sus subgrupos pasan al nivel principal.";
  // The «hasta la próxima publicación…» caveat only made sense when a page
  // targeting the group could lose it unnoticed; once one is named above,
  // the server keeps its destinations current right away (A9-13).
  const deleteDescription = deleteTargetingNotice
    ? `${deleteTargetingNotice} ${deleteParentPhrase}`
    : `${deleteParentPhrase} Lo que muestran no cambia hasta la próxima publicación de las páginas que apuntaban a este grupo, que ya no lo incluirán.`;
  const footer = (
    <>
      {group ? (
        <button
          className="button button-ghost group-form-delete"
          onClick={() => setIsConfirmingDelete(true)}
          type="button"
        >
          <Icon name="trash" size={16} /> Eliminar
        </button>
      ) : null}
      <button
        className="button button-secondary"
        onClick={onClose}
        type="button"
      >
        Cancelar
      </button>
      <button
        className="button button-primary"
        disabled={!canSave}
        form={FORM_ID}
        type="submit"
      >
        {isSaving
          ? mergeTarget
            ? "Agregando…"
            : "Guardando…"
          : group
            ? "Guardar cambios"
            : mergeTarget
              ? `Agregar a «${mergeTarget.name}»`
              : members.length
                ? `Crear ${kindWord} con ${members.length} ${members.length === 1 ? "QR o etiqueta" : "QR y etiquetas"}`
                : `Crear ${kindWord}`}
      </button>
    </>
  );

  return (
    <>
      <Dialog
        description={
          group
            ? group.parentId
              ? `En «${groupPathLabel(allGroups, group.parentId)}».`
              : undefined
            : "Junta QR y etiquetas de un local, una zona o un tipo de objeto: lo que publiques en el grupo llega a todos, también a sus subgrupos y a los que agregues después."
        }
        footer={footer}
        onClose={onClose}
        open={open && !isConfirmingDelete}
        size="large"
        title={group ? `Editar «${group.name}»` : "Nuevo grupo"}
      >
        <form className="group-form" id={FORM_ID} onSubmit={submit}>
          {error ? <Notice tone="danger">{error}</Notice> : null}

          <fieldset className="tp-new-order-options group-form-kinds">
            <legend>¿Qué es?</legend>
            {(["location", "group"] as const).map((value) => (
              <button
                aria-pressed={kind === value}
                className={
                  kind === value
                    ? "tp-new-order-option tp-new-order-option-selected"
                    : "tp-new-order-option"
                }
                key={value}
                onClick={() => setKind(value)}
                type="button"
              >
                <span aria-hidden="true" className="tp-new-order-icon">
                  <Icon
                    name={value === "location" ? "location" : "group"}
                    size={18}
                  />
                </span>
                <span className="tp-new-order-text">
                  <strong>{groupKindLabels[value]}</strong>
                  <small>{groupKindDescriptions[value]}</small>
                </span>
              </button>
            ))}
          </fieldset>

          <div className="group-form-row">
            <Field
              counter={{ value: name.length, max: 120 }}
              error={
                taken
                  ? `Ya hay un grupo «${name.trim()}» en ese lugar. Usa otro nombre o elige otro «Dentro de».`
                  : undefined
              }
              id="group-name"
              label="Nombre"
            >
              <input
                autoFocus
                id="group-name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder={`Ej. ${groupNameSuggestions[kind][0]}`}
                required
                value={name}
              />
            </Field>
            {parentOptions.length || parentId ? (
              <Field id="group-parent" label="Dentro de" optional>
                <select
                  id="group-parent"
                  onChange={(event) => setParentId(event.target.value)}
                  value={parentId}
                >
                  <option value="">Ninguno (nivel principal)</option>
                  {parentOptions.map(({ group: option, depth }) => (
                    <option key={option.id} value={option.id}>
                      {indentedName(option.name, depth)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
          {mergeTarget ? (
            <Notice tone="info">
              {mergeIsEmpty
                ? `Ya tienes «${mergeTarget.name}» aquí. Elige los QR y etiquetas que quieres agregarle, o usa otro nombre.`
                : `Ya tienes «${mergeTarget.name}» aquí: los QR y etiquetas que elegiste se agregan a ese grupo.`}
            </Notice>
          ) : null}
          {!group && !name ? (
            <fieldset className="tp-new-suggestions">
              <legend className="visually-hidden">Sugerencias</legend>
              {groupNameSuggestions[kind].map((suggestion) => (
                <button
                  className="tp-new-chip"
                  key={suggestion}
                  onClick={() => setName(suggestion)}
                  type="button"
                >
                  {suggestion}
                </button>
              ))}
            </fieldset>
          ) : null}
          <p className="field-hint group-form-place">
            {parentId
              ? `Quedará en «${groupPathLabel(allGroups, parentId)}». Lo que publiques ahí también le llega, salvo que este ${kindWord} tenga lo suyo.`
              : `Puedes anidar hasta ${GROUP_MAX_DEPTH} niveles, por ejemplo Local › Zona › Mesa.`}
          </p>
          {groupHint ? (
            <Notice tone="info">
              Sus QR y etiquetas recibirán automáticamente «{groupHint}».
            </Notice>
          ) : null}

          <fieldset className="group-form-members">
            <legend>
              QR y etiquetas{" "}
              <span className="optional-label">
                {members.length
                  ? `(${members.length} ${members.length === 1 ? "elegido" : "elegidos"}${
                      moving
                        ? `; ${moving} se ${moving === 1 ? "mueve" : "mueven"} de su grupo`
                        : ""
                    })`
                  : "(opcional)"}
              </span>
            </legend>
            {assignableItems.length > 8 ? (
              <label className="search-field group-form-search">
                <span className="visually-hidden">Buscar QR y etiquetas</span>
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar QR o etiqueta"
                  type="search"
                  value={query}
                />
              </label>
            ) : null}
            {sections.length ? (
              <div className="group-form-sections">
                {sections.map((section) => {
                  const ids = section.items.map((item) => item.id);
                  const marked = ids.filter((id) =>
                    members.includes(id),
                  ).length;
                  return (
                    <section className="group-form-section" key={section.id}>
                      <label className="group-form-section-head">
                        <input
                          checked={marked === ids.length}
                          onChange={(event) =>
                            toggle(ids, event.target.checked)
                          }
                          ref={(input) => {
                            if (input)
                              input.indeterminate =
                                marked > 0 && marked < ids.length;
                          }}
                          type="checkbox"
                        />
                        <span>{section.title}</span>
                        <small>{ids.length}</small>
                      </label>
                      <ul>
                        {section.items.map((touchpoint) => {
                          const checked = members.includes(touchpoint.id);
                          return (
                            <li key={touchpoint.id}>
                              <label
                                className={
                                  checked
                                    ? "group-form-member group-form-member-checked"
                                    : "group-form-member"
                                }
                              >
                                <input
                                  checked={checked}
                                  onChange={(event) =>
                                    toggle(
                                      [touchpoint.id],
                                      event.target.checked,
                                    )
                                  }
                                  type="checkbox"
                                />
                                <span className="group-form-member-name">
                                  {touchpoint.operationalName}
                                </span>
                                <KindBadge
                                  kind={effectiveKind(touchpoint.kind)}
                                />
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            ) : assignableItems.length ? (
              <p className="muted">
                Ningún QR o etiqueta coincide con la búsqueda.
              </p>
            ) : (
              <p className="muted">
                Aún no hay QR ni etiquetas. Podrás agregarlos después.
              </p>
            )}
            <p className="field-hint">
              Un QR o etiqueta está en un solo grupo: si ya tiene uno, se mueve
              a este.
            </p>
          </fieldset>

          <details
            className="group-form-more"
            open={Boolean(group?.description || group?.qrTemplateId)}
          >
            <summary>Más opciones: descripción y diseño QR</summary>
            <div className="group-form-more-body">
              <Field id="group-description" label="Descripción" optional>
                <input
                  id="group-description"
                  maxLength={300}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ej. Sucursal de Av. Juárez"
                  value={description}
                />
              </Field>
              <Field
                hint={
                  <>
                    Lo heredan sus QR sin diseño propio, también los que
                    agregues después. Los QR impresos siguen funcionando.{" "}
                    <Link to={{ name: "qr" }}>Ver la biblioteca</Link>
                  </>
                }
                id="group-qr-design"
                label="Diseño QR"
                optional
              >
                <select
                  id="group-qr-design"
                  onChange={(event) => setQrTemplateId(event.target.value)}
                  value={qrTemplateId}
                >
                  <option value="">
                    {inheritedTemplateName
                      ? `El del grupo de arriba («${inheritedTemplateName}»)`
                      : "Diseño Kardo por defecto"}
                  </option>
                  {(qrTemplates.data ?? []).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </details>
        </form>
      </Dialog>
      <ConfirmDialog
        confirmLabel="Eliminar grupo"
        description={deleteDescription}
        isBusy={isSaving}
        onClose={() => setIsConfirmingDelete(false)}
        onConfirm={() => void remove()}
        open={isConfirmingDelete}
        title={`¿Eliminar «${group?.name ?? ""}»?`}
        tone="danger"
      />
    </>
  );
}
