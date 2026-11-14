import { businessSlugFormatError } from "@kardo/contracts";
import { useEffect, useId, useRef, useState } from "react";
import {
  type BusinessAddressContext,
  workspaceSlugApi,
} from "../../api/workspace-slug.js";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import {
  linksBaseLabel,
  typedBusinessAddress,
} from "../../lib/business-address.js";
import "./business-address.css";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "mine" }
  | { kind: "taken" | "reserved"; suggestion: string | null }
  | { kind: "format"; message: string };

/**
 * «Tu link en Kardo»: kardo.com.mx/<negocio> (Links redesign, owner,
 * 2026-10-04). It is not the business's name (names may repeat); it is
 * unique and never gets a number. The field opens with Kardo's free
 * recommendation, keeps following the name, city and giro until the owner
 * types, and checks every change. It only shapes and checks the value:
 * saving is the caller's (`saveBusinessAddress`), which passes a refusal
 * back through `error`.
 */
export function BusinessAddressField({
  workspaceId,
  name,
  city,
  industry,
  value,
  onChange,
  savedSlug,
  error,
  disabled,
  onReadyChange,
  label = "Tu link en Kardo",
}: BusinessAddressContext & {
  workspaceId: string;
  value: string;
  onChange: (slug: string) => void;
  /** The organization's current address: shown as its own, never as taken. */
  savedSlug?: string | null | undefined;
  /** What saving answered (taken, too soon…). */
  error?: string | null | undefined;
  disabled?: boolean | undefined;
  /** True only while the value is free (or already this organization's):
   * the caller enables saving with it. */
  onReadyChange?: ((ready: boolean) => void) | undefined;
  label?: string | undefined;
}) {
  const id = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // The name gave no free address (it never adds numbers): ask for one.
  const [noSuggestion, setNoSuggestion] = useState(false);
  const onReadyRef = useRef(onReadyChange);
  onReadyRef.current = onReadyChange;
  useEffect(() => {
    onReadyRef.current?.(status.kind === "free" || status.kind === "mine");
  }, [status.kind]);
  // Once the owner types, Kardo stops replacing the address.
  const touched = useRef(Boolean(value) && value !== savedSlug);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // The recommendation, while the owner has not typed one.
  useEffect(() => {
    if (touched.current || savedSlug || !name.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void workspaceSlugApi
        .suggestion(workspaceId, { name, city, industry }, controller.signal)
        .then(({ slug }) => {
          if (touched.current) return;
          setNoSuggestion(!slug);
          if (slug) onChangeRef.current(slug);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [workspaceId, name, city, industry, savedSlug]);

  // Is it free? Checked on every change, a moment after typing stops.
  useEffect(() => {
    if (!value) {
      setStatus({ kind: "idle" });
      return;
    }
    const formatError = businessSlugFormatError(value);
    if (formatError) {
      setStatus({ kind: "format", message: formatError });
      return;
    }
    if (value === savedSlug) {
      setStatus({ kind: "mine" });
      return;
    }
    setStatus({ kind: "checking" });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void workspaceSlugApi
        .availability(
          workspaceId,
          value,
          { name, city, industry },
          controller.signal,
        )
        .then((answer) => {
          if (answer.available) setStatus({ kind: "free" });
          else if (answer.reason === "format")
            setStatus({
              kind: "format",
              message: businessSlugFormatError(value) ?? "Revisa la dirección.",
            });
          else
            setStatus({
              kind: answer.reason === "reserved" ? "reserved" : "taken",
              suggestion: answer.suggestion ?? null,
            });
        })
        .catch(() => setStatus({ kind: "idle" }));
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [workspaceId, value, savedSlug, name, city, industry]);

  const problem =
    error ??
    (status.kind === "format"
      ? status.message
      : status.kind === "taken"
        ? "Esa dirección ya la usa otro negocio."
        : status.kind === "reserved"
          ? "Esa dirección está reservada."
          : null);
  const suggestion =
    !error && (status.kind === "taken" || status.kind === "reserved")
      ? status.suggestion
      : null;

  return (
    <div className="business-address">
      <Field
        error={problem}
        hint={
          problem
            ? undefined
            : noSuggestion && !value
              ? "Ese nombre ya lo usa otro negocio. Prueba con tu ciudad o tu colonia."
              : // «dirección» se leía como domicilio: Diego escribió su calle
                // (round 4). Aclara que es la dirección web, no el domicilio.
                "La dirección web de tu negocio en Kardo. No es tu domicilio."
        }
        id={id}
        label={label}
      >
        <div className="business-address-input">
          {/* `link-address-prefix` lets a long prefix shrink and ellipsize
              from its start instead of pushing the editable box off a phone
              screen — e.g. the dev Resolver host, or any long custom domain
              (round 4, Javier in «Tu negocio»). */}
          <span
            aria-hidden="true"
            className="address-prefix link-address-prefix"
          >
            {linksBaseLabel}
          </span>
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            className="business-address-control"
            disabled={disabled}
            id={id}
            inputMode="url"
            maxLength={30}
            onChange={(event) => {
              touched.current = true;
              onChange(typedBusinessAddress(event.target.value));
            }}
            placeholder="tu-negocio"
            spellCheck={false}
            value={value}
          />
          <AddressStatus kind={problem ? "problem" : status.kind} />
        </div>
      </Field>
      {suggestion ? (
        <button
          className="link-button business-address-suggestion"
          onClick={() => {
            touched.current = true;
            onChange(suggestion);
          }}
          type="button"
        >
          Usar {linksBaseLabel}
          {suggestion}
        </button>
      ) : null}
    </div>
  );
}

/** «Libre» (or «Revisando…») inside the field, at its right edge. */
export function AddressStatus({ kind }: { kind: string }) {
  if (kind === "free")
    return (
      <span aria-live="polite" className="address-status address-status-free">
        <Icon name="check" size={15} /> Libre
      </span>
    );
  if (kind === "checking")
    return (
      <span aria-live="polite" className="address-status">
        Revisando…
      </span>
    );
  return <span aria-live="polite" className="visually-hidden" />;
}

/** Whether the field's value can be saved as it is. */
export function businessAddressReady(value: string): boolean {
  return Boolean(value) && !businessSlugFormatError(value);
}
