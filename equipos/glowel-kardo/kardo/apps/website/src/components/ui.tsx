import type { ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8 ${className}`}
    >
      {children}
    </div>
  );
}

type Tone = "cream" | "paper" | "ink";

const tones: Record<Tone, string> = {
  cream: "bg-cream text-ink",
  paper: "bg-paper text-ink",
  ink: "bg-ink text-white",
};

export function Section({
  id,
  tone = "cream",
  children,
  className = "",
  labelledBy,
}: {
  id?: string;
  tone?: Tone;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={`${tones[tone]} py-20 sm:py-24 lg:py-28 ${className}`}
      id={id}
    >
      {children}
    </section>
  );
}

const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full px-6 text-[15px] font-semibold tracking-[-0.01em] transition-colors duration-200 cursor-pointer";

const variants = {
  whatsapp: "bg-whatsapp text-ink hover:bg-whatsapp-hover",
  aqua: "bg-aqua text-ink hover:bg-aqua-soft",
  teal: "bg-teal text-white hover:bg-teal-hover",
  ghostDark:
    "border border-white/20 text-white hover:border-white/50 hover:bg-white/5",
  ghostLight:
    "border border-ink/15 text-ink hover:border-ink/40 hover:bg-ink/[0.03]",
} as const;

export type ButtonVariant = keyof typeof variants;

export function ButtonLink({
  href,
  children,
  variant = "teal",
  className = "",
  external = false,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  external?: boolean;
}) {
  return (
    <a
      className={`${buttonBase} ${variants[variant]} ${className}`}
      href={href}
      {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}
    >
      {children}
    </a>
  );
}

/** The WhatsApp glyph: the one icon people recognize before reading. */
export function WhatsAppIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35ZM12.05 21.8h-.01a9.85 9.85 0 0 1-5.02-1.37l-.36-.21-3.73.98 1-3.64-.24-.37a9.86 9.86 0 0 1-1.51-5.24C2.18 6.5 6.61 2.08 12.06 2.08c2.64 0 5.12 1.03 6.98 2.9a9.8 9.8 0 0 1 2.89 6.98c0 5.45-4.43 9.84-9.88 9.84Zm8.41-18.25A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.9 11.9 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.17-3.49-8.42Z" />
    </svg>
  );
}

/** Heading block shared by the sections: title, optional lead. */
export function SectionTitle({
  id,
  title,
  lead,
  tone = "light",
  align = "left",
}: {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  tone?: "light" | "dark";
  align?: "left" | "center";
}) {
  return (
    <div
      className={`max-w-3xl ${align === "center" ? "mx-auto text-center" : ""}`}
    >
      <h2
        className={`text-[2.1rem] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl ${tone === "dark" ? "text-white" : "text-ink"}`}
        id={id}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={`mt-5 text-lg leading-relaxed sm:text-xl ${tone === "dark" ? "text-ink-text" : "text-muted"}`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
