import { useLayoutEffect, useRef } from "react";
import { formatPhone, phoneDigits, phoneForProfile } from "./phone.js";

/**
 * The WhatsApp field: numbers only, «222 123 4567» as they come in, with
 * Mexico's +52 beside it (owner, 2026-10-03). `value` and `onChange` use
 * the text the profile keeps (`phoneForProfile`).
 *
 *   <PhoneInput id="fs-phone" value={phone} onChange={setPhone} />
 */
export function PhoneInput({
  id,
  value,
  onChange,
  country = "MX",
  required,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  country?: string | undefined;
  required?: boolean | undefined;
  /** The ids of the field's hint or error. */
  describedBy?: string | undefined;
}) {
  const isMexico = country === "MX";
  const shown = formatPhone(phoneDigits(value, country), country);
  const input = useRef<HTMLInputElement>(null);
  // The spaces move as digits come in: keep the cursor after the same digit.
  const caretDigits = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = input.current;
    const wanted = caretDigits.current;
    if (!element || wanted === null) return;
    caretDigits.current = null;
    let position = 0;
    let seen = 0;
    while (position < shown.length && seen < wanted) {
      if (/\d/.test(shown.charAt(position))) seen += 1;
      position += 1;
    }
    element.setSelectionRange(position, position);
  });

  return (
    <div className="phone-input">
      <span aria-hidden="true" className="phone-input-code">
        {isMexico ? "+52" : "+"}
      </span>
      <input
        aria-describedby={describedBy}
        autoComplete="tel-national"
        className="input"
        id={id}
        inputMode="numeric"
        onChange={(event) => {
          const typed = event.target.value;
          const caret = event.target.selectionStart ?? typed.length;
          caretDigits.current = typed.slice(0, caret).replace(/\D/g, "").length;
          onChange(phoneForProfile(phoneDigits(typed, country), country));
        }}
        placeholder={isMexico ? "222 123 4567" : "34 612 345 678"}
        ref={input}
        required={required}
        type="tel"
        value={shown}
      />
    </div>
  );
}
