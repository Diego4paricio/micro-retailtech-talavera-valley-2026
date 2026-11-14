/*
  Marks of the made-up businesses in the hero, drawn for the landing (none
  is a real brand, none is Kardo's). Each one uses currentColor so the page
  and the panel's switcher can paint it in their own colors.
*/

type MarkProps = { className?: string };

/** Jacaranda, taller floral: five petals around a seed. */
export function JacarandaMark({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 40 40">
      <g fill="currentColor">
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse
            cx="20"
            cy="10.5"
            key={angle}
            opacity={angle === 0 ? 1 : 0.82}
            rx="5.6"
            ry="8.6"
            transform={`rotate(${angle} 20 20)`}
          />
        ))}
      </g>
      <circle cx="20" cy="20" fill="#f3d27a" r="3.6" />
    </svg>
  );
}

/** Nácar, estudio de uñas: a scallop shell. */
export function NacarMark({ className }: MarkProps) {
  const rays = [-62, -31, 0, 31, 62];
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 40 40">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      >
        <path d="M20 34 L6.2 17.4 A15.5 15.5 0 0 1 33.8 17.4 Z" />
        {rays.map((angle) => (
          <path
            d="M20 34 L20 8.4"
            key={angle}
            transform={`rotate(${angle} 20 34)`}
          />
        ))}
        <path d="M16 34 h8" />
      </g>
    </svg>
  );
}

/** Tamarindo, cocina de barrio: a tamarind pod with its stem. */
export function TamarindoMark({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 40 40">
      <path
        d="M8 21.5c0-5 4.4-7.3 7.6-4.9 1.8-3.4 6.9-3.5 8.8 0 3.2-2.6 8.2-.6 8.2 4.6 0 5.1-5 6.8-8.2 4.2-1.9 3.4-7 3.4-8.8 0C12.4 28 8 26.5 8 21.5Z"
        fill="currentColor"
      />
      <path
        d="M8.6 19.6C6.4 17.4 5.6 15 6 12.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M6.2 12.8c2.6-.4 4.6.8 5.4 3"
        fill="none"
        stroke="#7da35b"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/** Arista, bienes raíces: a roof line over a door. */
export function AristaMark({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 40 40">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M5 30 L20 9 L35 30" strokeWidth="3.4" />
        <path d="M16.5 30v-7.5h7V30" strokeWidth="2.6" />
      </g>
    </svg>
  );
}

/** Cifra, despacho contable: three bars that grow. */
export function CifraMark({ className }: MarkProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 40 40">
      <g fill="currentColor">
        <rect height="11" rx="2.2" width="6" x="8" y="21" />
        <rect height="17" rx="2.2" width="6" x="17" y="15" />
        <rect height="24" opacity="0.55" rx="2.2" width="6" x="26" y="8" />
      </g>
    </svg>
  );
}
