import { linkSlugFormatError } from "@kardo/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { linksApi } from "../../api/links.js";
import { Field } from "../../components/Field.js";
import {
  linksBaseLabel,
  typedBusinessAddress,
} from "../../lib/business-address.js";
import { AddressStatus } from "./BusinessAddressField.js";
import "./business-address.css";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "mine" }
  | { kind: "taken"; suggestion: string | null }
  | { kind: "format"; message: string };

/**
 * The address of one link, kardo.com.mx/<negocio>/<link> (Links redesign,
 * phase 2). It opens with a free recommendation from what the link shows,
 * keeps following it until the owner types, and checks every change before
 * anything is created. Two businesses can both have /menu; inside one
 * business each address is unique.
 */
export function LinkAddressField({
  workspaceId,
  businessSlug,
  experience,
  value,
  onChange,
  linkId,
  savedSlug,
  error,
  disabled,
  onReadyChange,
  label = "Dirección del link",
  hint,
}: {
  workspaceId: string;
  /** The business's address; «tu-negocio» stands in until it has one. */
  businessSlug: string | null | undefined;
  /** What the link shows: the recommendation comes from it. */
  experience: { name: string; type: string } | null;
  value: string;
  onChange: (slug: string) => void;
  /** The link being renamed: its own address is never «taken». */
  linkId?: string | undefined;
  savedSlug?: string | null | undefined;
  error?: string | null | undefined;
  disabled?: boolean | undefined;
  onReadyChange?: ((ready: boolean) => void) | undefined;
  label?: string | undefined;
  /** One line under the field, when nothing is wrong. */
  hint?: string | undefined;
}) {
  const id = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const onReadyRef = useRef(onReadyChange);
  onReadyRef.current = onReadyChange;
  useEffect(() => {
    onReadyRef.current?.(status.kind === "free" || status.kind === "mine");
  }, [status.kind]);
  const touched = useRef(Boolean(value) && value !== savedSlug);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const name = experience?.name ?? "";
  const type = experience?.type;

  // The recommendation follows what the link shows until the owner types.
  useEffect(() => {
    if (touched.current || savedSlug || !name.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void linksApi
        .slugSuggestion(workspaceId, { name, type }, controller.signal)
        .then(({ slug }) => {
          if (!touched.current && slug) onChangeRef.current(slug);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [workspaceId, name, type, savedSlug]);

  useEffect(() => {
    if (!value) {
      setStatus({ kind: "idle" });
      return;
    }
    const formatError = linkSlugFormatError(value);
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
      void linksApi
        .slugAvailability(
          workspaceId,
          value,
          { name, type, touchpointId: linkId },
          controller.signal,
        )
        .then((answer) => {
          if (answer.available) setStatus({ kind: "free" });
          else if (answer.reason === "format")
            setStatus({
              kind: "format",
              message: linkSlugFormatError(value) ?? "Revisa la dirección.",
            });
          else
            setStatus({ kind: "taken", suggestion: answer.suggestion ?? null });
        })
        .catch(() => setStatus({ kind: "idle" }));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [workspaceId, value, savedSlug, name, type, linkId]);

  const problem =
    error ??
    (status.kind === "format"
      ? status.message
      : status.kind === "taken"
        ? "Ya usas esa dirección en otro de tus links."
        : null);
  const suggestion =
    !error && status.kind === "taken" ? status.suggestion : null;
  const prefix = `${linksBaseLabel}${businessSlug || "tu-negocio"}/`;

  return (
    <div className="business-address">
      <Field error={problem} hint={hint} id={id} label={label}>
        <div className="business-address-input">
          {/* A long business address is cut from the left: the end, where
              the link's own part starts, always shows. */}
          <span
            aria-hidden="true"
            className="address-prefix link-address-prefix"
          >
            <bdi>{prefix}</bdi>
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
            placeholder="menu"
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
          Usar {prefix}
          {suggestion}
        </button>
      ) : null}
    </div>
  );
}
