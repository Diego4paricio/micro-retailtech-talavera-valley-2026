import type { NotificationBillingState } from "@kardo/contracts";
import { notificationBillingStates } from "@kardo/contracts";
import { useEffect, useId, useState } from "react";
import { notificationsApi } from "../../api/notifications.js";
import { plansApi } from "../../api/plans.js";
import { workspacesApi } from "../../api/workspaces.js";
import { Field } from "../../components/Field.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { useDebouncedValue } from "../../lib/use-debounced-value.js";
import type { AccountType, AudienceKind, NotificationForm } from "./form.js";
import {
  accountTypeLabels,
  billingStateLabels,
  roleLabelsSingular,
  roleOrder,
} from "./format.js";

type Choice<T> = { value: T; label: string };

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

const accountTypeChoices: Choice<AccountType>[] = [
  { value: "personal", label: accountTypeLabels.personal },
  { value: "business", label: accountTypeLabels.business },
];

export function AudienceBuilder({
  form,
  error,
  canBroadcast,
  canSend,
  onChange,
}: {
  form: NotificationForm;
  error: string | null | undefined;
  canBroadcast: boolean;
  canSend: boolean;
  onChange: (patch: Partial<NotificationForm>) => void;
}) {
  const name = useId();
  const kinds: { value: AudienceKind; label: string; hint: string }[] = [];
  if (canBroadcast) {
    kinds.push(
      {
        value: "all",
        label: "Todos los clientes",
        hint: "Llega a todas las organizaciones.",
      },
      {
        value: "segment",
        label: "Un segmento",
        hint: "Por plan, estado de cobro o tipo de cuenta.",
      },
    );
  }
  if (canSend) {
    kinds.push(
      {
        value: "workspace",
        label: "Una organización",
        hint: "Solo a las personas de esa organización.",
      },
      {
        value: "profile",
        label: "Una persona",
        hint: "Solo a una persona, por su correo.",
      },
    );
  }

  return (
    <fieldset className="ntf-group">
      <legend>A quién llega</legend>
      <div className="ntf-kinds">
        {kinds.map((kind) => (
          <label className="ntf-kind" key={kind.value}>
            <input
              checked={form.audienceKind === kind.value}
              name={`${name}-kind`}
              onChange={() => onChange({ audienceKind: kind.value })}
              type="radio"
            />
            <span>
              <strong>{kind.label}</strong>
              <small>{kind.hint}</small>
            </span>
          </label>
        ))}
      </div>

      {form.audienceKind === "segment" ? (
        <SegmentFilters form={form} onChange={onChange} />
      ) : null}
      {form.audienceKind === "workspace" ? (
        <WorkspacePicker form={form} onChange={onChange} />
      ) : null}
      {form.audienceKind === "profile" ? (
        <ProfilePicker form={form} onChange={onChange} />
      ) : null}

      {form.audienceKind !== "profile" ? (
        <fieldset className="ntf-subgroup">
          <legend>Solo para estos roles</legend>
          <p className="field-hint">
            Sin marcar ninguno, llega a todos los roles.
          </p>
          <div className="ntf-checks">
            {roleOrder.map((role) => (
              <label className="checkbox-row" key={role}>
                <input
                  checked={form.roles.includes(role)}
                  onChange={() => onChange({ roles: toggle(form.roles, role) })}
                  type="checkbox"
                />
                <span>{roleLabelsSingular[role]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function SegmentFilters({
  form,
  onChange,
}: {
  form: NotificationForm;
  onChange: (patch: Partial<NotificationForm>) => void;
}) {
  const [plans, setPlans] = useState<{ code: string; name: string }[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    plansApi
      .list(controller.signal)
      .then((list) =>
        setPlans(list.map((plan) => ({ code: plan.code, name: plan.name }))),
      )
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError))
          setPlansError(errorMessage(requestError));
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="ntf-segment">
      <fieldset className="ntf-subgroup">
        <legend>Plan</legend>
        {plansError ? (
          <p className="field-error">{plansError}</p>
        ) : plans.length === 0 ? (
          <p className="field-hint">Cargando planes…</p>
        ) : (
          <div className="ntf-checks">
            {plans.map((plan) => (
              <label className="checkbox-row" key={plan.code}>
                <input
                  checked={form.planCodes.includes(plan.code)}
                  onChange={() =>
                    onChange({ planCodes: toggle(form.planCodes, plan.code) })
                  }
                  type="checkbox"
                />
                <span>{plan.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset className="ntf-subgroup">
        <legend>Estado de cobro</legend>
        <div className="ntf-checks">
          {notificationBillingStates.map((state: NotificationBillingState) => (
            <label className="checkbox-row" key={state}>
              <input
                checked={form.billingStates.includes(state)}
                onChange={() =>
                  onChange({ billingStates: toggle(form.billingStates, state) })
                }
                type="checkbox"
              />
              <span>{billingStateLabels[state]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="ntf-subgroup">
        <legend>Tipo de cuenta</legend>
        <div className="ntf-checks">
          {accountTypeChoices.map((choice) => (
            <label className="checkbox-row" key={choice.value}>
              <input
                checked={form.accountTypes.includes(choice.value)}
                onChange={() =>
                  onChange({
                    accountTypes: toggle(form.accountTypes, choice.value),
                  })
                }
                type="checkbox"
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Generic "search, then pick one" control used for organizations and people. */
function Picker<T extends { id: string }>({
  label,
  hint,
  selected,
  selectedLabel,
  search,
  describe,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  selected: T | null;
  selectedLabel: (item: T) => string;
  search: (text: string, signal: AbortSignal) => Promise<T[]>;
  describe: (item: T) => { title: string; detail: string };
  onPick: (item: T) => void;
  onClear: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const debounced = useDebouncedValue(text.trim(), 300);
  const [results, setResults] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `search` is a stable closure per picker; only the text drives the request
  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const controller = new AbortController();
    setError(null);
    search(debounced, controller.signal)
      .then((items) => {
        setResults(items);
        setSearched(true);
      })
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) setError(errorMessage(requestError));
      });
    return () => controller.abort();
  }, [debounced]);

  if (selected) {
    return (
      <div className="ntf-picked">
        <span>{selectedLabel(selected)}</span>
        <button className="text-action" onClick={onClear} type="button">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="ntf-picker">
      <Field hint={hint} id={`${id}-search`} label={label}>
        <input
          autoComplete="off"
          id={`${id}-search`}
          onChange={(event) => setText(event.target.value)}
          type="search"
          value={text}
        />
      </Field>
      {error ? <p className="field-error">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="ntf-results">
          {results.map((item) => {
            const view = describe(item);
            return (
              <li key={item.id}>
                <button
                  className="ntf-result"
                  onClick={() => onPick(item)}
                  type="button"
                >
                  <strong>{view.title}</strong>
                  <small>{view.detail}</small>
                </button>
              </li>
            );
          })}
        </ul>
      ) : searched ? (
        <p className="field-hint">No encontramos coincidencias.</p>
      ) : null}
    </div>
  );
}

type WorkspaceHit = {
  id: string;
  name: string;
  ownerEmail: string | null;
  members: number;
};

function WorkspacePicker({
  form,
  onChange,
}: {
  form: NotificationForm;
  onChange: (patch: Partial<NotificationForm>) => void;
}) {
  return (
    <Picker<WorkspaceHit>
      describe={(item) => ({
        title: item.name,
        detail: `${item.ownerEmail ?? "Sin owner"} · ${item.members} ${item.members === 1 ? "persona" : "personas"}`,
      })}
      hint="Escribe al menos 2 letras del nombre."
      label="Buscar organización"
      onClear={() => onChange({ workspace: null })}
      onPick={(item) =>
        onChange({ workspace: { id: item.id, name: item.name } })
      }
      search={async (text, signal) =>
        (await workspacesApi.list({ query: text, limit: 8 }, signal)).items
      }
      selected={
        form.workspace
          ? {
              id: form.workspace.id,
              name: form.workspace.name,
              ownerEmail: null,
              members: 0,
            }
          : null
      }
      selectedLabel={(item) => `Organización: ${item.name}`}
    />
  );
}

type ProfileHit = {
  id: string;
  email: string;
  displayName: string | null;
  workspaces: number;
};

function ProfilePicker({
  form,
  onChange,
}: {
  form: NotificationForm;
  onChange: (patch: Partial<NotificationForm>) => void;
}) {
  return (
    <Picker<ProfileHit>
      describe={(item) => ({
        title: item.email,
        detail: `${item.displayName ?? "Sin nombre"} · ${item.workspaces} ${item.workspaces === 1 ? "organización" : "organizaciones"}`,
      })}
      hint="Escribe el inicio del correo, por ejemplo ana@."
      label="Buscar por correo"
      onClear={() => onChange({ profile: null })}
      onPick={(item) =>
        onChange({ profile: { id: item.id, email: item.email } })
      }
      search={async (text, signal) =>
        (await notificationsApi.lookupProfiles(text, signal)).items
      }
      selected={
        form.profile
          ? {
              id: form.profile.id,
              email: form.profile.email,
              displayName: null,
              workspaces: 0,
            }
          : null
      }
      selectedLabel={(item) => `Persona: ${item.email}`}
    />
  );
}
