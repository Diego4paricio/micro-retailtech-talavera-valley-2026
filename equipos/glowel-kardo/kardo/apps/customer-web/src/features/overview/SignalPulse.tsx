/**
 * Kardo's loading mark: the tap point and its three waves, lighting up in
 * turn while data is on its way (the same gesture as the logo's "O)))").
 * At rest it shows the waves dimmed. Decorative: callers announce the state.
 */
export function SignalPulse({
  active,
  size = 18,
}: {
  active: boolean;
  size?: number | undefined;
}) {
  return (
    <svg
      aria-hidden="true"
      className={active ? "ov-signal ov-signal-active" : "ov-signal"}
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle className="ov-signal-dot" cx="6" cy="12" r="2.6" />
      <path
        className="ov-signal-wave ov-signal-wave-1"
        d="M11 8.2a5.4 5.4 0 0 1 0 7.6"
      />
      <path
        className="ov-signal-wave ov-signal-wave-2"
        d="M14.4 5.3a9.4 9.4 0 0 1 0 13.4"
      />
      <path
        className="ov-signal-wave ov-signal-wave-3"
        d="M17.8 2.4a13.4 13.4 0 0 1 0 19.2"
      />
    </svg>
  );
}
