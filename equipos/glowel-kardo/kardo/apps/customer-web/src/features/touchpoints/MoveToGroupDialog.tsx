import type { TouchpointGroup } from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { groupsApi } from "../../api/groups.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { errorMessage } from "../../lib/api.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  flattenGroupTree,
  groupIcon,
  groupPathLabel,
  indentedName,
  memberCount,
  nearestServedName,
  parentChoices,
  siblingNamed,
} from "./group-tree.js";

const NEW_GROUP = "new";

/** "5 touchpoints se movieron a «Terraza»", plus what the group sent them. */
export function movedMessage(
  moved: number,
  groupName: string,
  propagated: number,
): string {
  const what =
    moved === 1
      ? `1 QR o etiqueta se movió a «${groupName}».`
      : `${moved} QR y etiquetas se movieron a «${groupName}».`;
  if (!propagated) return what;
  return `${what} ${
    propagated === 1
      ? "1 recibe lo que el grupo tiene publicado."
      : `${propagated} reciben lo que el grupo tiene publicado.`
  }`;
}

/**
 * Moves the selected Touchpoints into one group: one that exists or a new one
 * named right here. The group's other members stay where they are.
 */
export function MoveToGroupDialog({
  open,
  touchpointIds,
  currentGroupId,
  onClose,
  onMoved,
}: {
  open: boolean;
  touchpointIds: readonly string[];
  /** When every selected Touchpoint is already in the same group. */
  currentGroupId: string | null;
  onClose: () => void;
  onMoved: (message: string) => void;
}) {
  const { workspace, groups, refreshGroups } = useWorkspace();
  const groupList = groups.data ?? [];
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const count = touchpointIds.length;

  // Each time it opens: the first group they are not all in already, or a
  // new group when there are none.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read at open time
  useEffect(() => {
    if (!open) return;
    const first = groupList.find((group) => group.id !== currentGroupId);
    setChoice(first?.id ?? NEW_GROUP);
    setNewName("");
    setNewParent("");
    setError(null);
  }, [open]);

  const reused =
    choice === NEW_GROUP
      ? (siblingNamed(groupList, newParent || null, newName) ?? null)
      : null;
  const target: TouchpointGroup | null =
    choice === NEW_GROUP
      ? (reused ?? null)
      : (groupList.find((group) => group.id === choice) ?? null);
  // What they receive on arrival: the nearest serving group of the chain.
  const serves = target
    ? nearestServedName(groupList, target.id)
    : choice === NEW_GROUP && newParent
      ? nearestServedName(groupList, newParent)
      : null;
  const canSubmit =
    count > 0 && (choice === NEW_GROUP ? newName.trim().length > 0 : !!target);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);
    try {
      if (target) {
        const result = await groupsApi.move(
          workspace.id,
          [...touchpointIds],
          target.id,
        );
        onMoved(
          movedMessage(
            result.moved,
            groupPathLabel(groupList, target.id),
            result.propagatedPublications,
          ),
        );
      } else {
        const created = await groupsApi.create(workspace.id, {
          name: newName.trim(),
          ...(newParent ? { parentId: newParent } : {}),
          kind: "group",
          touchpointIds: [...touchpointIds],
        });
        onMoved(movedMessage(count, created.name, 0));
      }
      await refreshGroups();
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      description="Los demás QR y etiquetas del grupo se quedan como están."
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
            className="button button-primary"
            disabled={isSaving || !canSubmit}
            form="move-to-group"
            type="submit"
          >
            {isSaving
              ? "Moviendo…"
              : count === 1
                ? "Mover 1 QR o etiqueta"
                : `Mover ${count} QR y etiquetas`}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={
        count === 1 ? "Mover 1 QR o etiqueta" : `Mover ${count} QR y etiquetas`
      }
    >
      <form className="tp-move" id="move-to-group" onSubmit={submit}>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <fieldset className="tp-move-options">
          <legend>¿A qué grupo?</legend>
          {flattenGroupTree(groupList).map(({ group, depth }) => (
            <label
              className={
                choice === group.id
                  ? "tp-move-option tp-move-option-selected"
                  : "tp-move-option"
              }
              key={group.id}
              style={{ marginLeft: `${(depth - 1) * 1.1}rem` }}
            >
              <input
                checked={choice === group.id}
                name="move-group"
                onChange={() => setChoice(group.id)}
                type="radio"
                value={group.id}
              />
              <Icon name={groupIcon(group)} size={16} />
              <span className="tp-move-name">{group.name}</span>
              <small>
                {group.id === currentGroupId
                  ? "Ya están aquí"
                  : memberCount(group) === 1
                    ? "1 QR o etiqueta"
                    : `${memberCount(group)} QR y etiquetas`}
              </small>
            </label>
          ))}
          <label
            className={
              choice === NEW_GROUP
                ? "tp-move-option tp-move-option-selected"
                : "tp-move-option"
            }
          >
            <input
              checked={choice === NEW_GROUP}
              name="move-group"
              onChange={() => setChoice(NEW_GROUP)}
              type="radio"
              value={NEW_GROUP}
            />
            <Icon name="plus" size={16} />
            <span className="tp-move-name">Grupo nuevo</span>
          </label>
        </fieldset>
        {choice === NEW_GROUP && groupList.length ? (
          <Field id="move-new-group-parent" label="Dentro de" optional>
            <select
              id="move-new-group-parent"
              onChange={(event) => setNewParent(event.target.value)}
              value={newParent}
            >
              <option value="">Ninguno (nivel principal)</option>
              {parentChoices(groupList, null).map(({ group, depth }) => (
                <option key={group.id} value={group.id}>
                  {indentedName(group.name, depth)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {choice === NEW_GROUP ? (
          <Field
            hint={
              reused
                ? `Ya tienes «${reused.name}» aquí: se agregan a ese grupo.`
                : "Por ejemplo, el local, la zona o el tipo de objeto."
            }
            id="move-new-group-name"
            label="Nombre del grupo nuevo"
          >
            <input
              autoFocus
              id="move-new-group-name"
              maxLength={120}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Ej. Sucursal Centro"
              value={newName}
            />
          </Field>
        ) : null}
        {serves ? (
          <Notice tone="info">
            El grupo tiene publicada «{serves}»: la mostrarán los que no tengan
            una página asignada directamente.
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}
