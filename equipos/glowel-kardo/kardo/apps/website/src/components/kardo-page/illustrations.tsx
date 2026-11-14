/*
  Drawn stand-ins for the photos a business uploads to its Catálogo or its
  Imagen. The landing has no customer photos, and a drawing never pretends
  to be one.
*/

export function CoffeeBag() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 200 200">
      <rect fill="#eee4d3" height="200" width="200" />
      <ellipse cx="100" cy="176" fill="#d9ccb6" rx="58" ry="8" />
      <path d="M60 58h80l8 118H52Z" fill="#c49a6c" />
      <path d="M60 58h80l8 118h-44Z" fill="#b5895b" opacity=".45" />
      <path d="M58 40h84l-2 22H60Z" fill="#a67b4f" />
      <rect fill="#8f6842" height="4" width="84" x="58" y="40" />
      <rect fill="#f7f1e6" height="54" rx="3" width="56" x="72" y="92" />
      <circle
        cx="100"
        cy="108"
        fill="none"
        r="8"
        stroke="#16232e"
        strokeWidth="3"
      />
      <circle cx="100" cy="108" fill="#0a6c78" r="2.5" />
      <rect fill="#16232e" height="3" rx="1.5" width="34" x="83" y="124" />
      <rect fill="#8a8f8c" height="2.5" rx="1.25" width="24" x="88" y="132" />
    </svg>
  );
}

export function Mug() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 200 200">
      <rect fill="#dde9e7" height="200" width="200" />
      <ellipse cx="96" cy="160" fill="#c5d6d3" rx="62" ry="10" />
      <ellipse cx="96" cy="152" fill="#f7f5f0" rx="56" ry="10" />
      <path
        d="M132 82h10a18 18 0 0 1 0 36h-10"
        fill="none"
        stroke="#085a64"
        strokeWidth="8"
      />
      <path
        d="M58 70h76v66a14 14 0 0 1-14 14H72a14 14 0 0 1-14-14Z"
        fill="#0a6c78"
      />
      <path d="M64 76h10v62a10 10 0 0 1-10-10Z" fill="#ffffff" opacity=".18" />
      <ellipse cx="96" cy="70" fill="#075b65" rx="38" ry="7" />
      <ellipse cx="96" cy="71" fill="#5b3a26" rx="33" ry="5" />
      <path
        d="M84 56c-6-8 6-12 0-20M100 56c-6-8 6-12 0-20M116 56c-6-8 6-12 0-20"
        fill="none"
        opacity=".55"
        stroke="#9fb8b5"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function Concha() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 200 200">
      <rect fill="#f4e6d6" height="200" width="200" />
      <ellipse cx="100" cy="150" fill="#e2cdb6" rx="70" ry="12" />
      <ellipse cx="100" cy="142" fill="#fffdf8" rx="66" ry="13" />
      <path d="M44 128c0-34 25-56 56-56s56 22 56 56Z" fill="#d9a066" />
      <path d="M50 124c0-29 22-47 50-47s50 18 50 47Z" fill="#f5e6d0" />
      <g fill="none" stroke="#e3c9a6" strokeLinecap="round" strokeWidth="3">
        <path d="M100 80v44" />
        <path d="M76 88c8 10 10 22 10 36" />
        <path d="M124 88c-8 10-10 22-10 36" />
        <path d="M58 104c10 6 14 12 16 20" />
        <path d="M142 104c-10 6-14 12-16 20" />
      </g>
    </svg>
  );
}

/* A flower shop's Catálogo, for the hero: Kardo is not only for cafés. */

export function Bouquet() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 200 200">
      <rect fill="#f3e3dc" height="200" width="200" />
      <ellipse cx="100" cy="182" fill="#e3cbc0" rx="46" ry="7" />
      <g fill="#5f8f5a">
        <path d="M58 86c-14-8-22-24-18-34 12 4 20 18 18 34Z" />
        <path d="M142 86c14-8 22-24 18-34-12 4-20 18-18 34Z" />
        <path d="M100 58c-6-14-2-28 6-34 6 10 4 24-6 34Z" />
      </g>
      <circle cx="78" cy="84" fill="#e76f6f" r="18" />
      <circle cx="78" cy="84" fill="#c9504f" r="8" />
      <circle cx="122" cy="82" fill="#f2a65a" r="17" />
      <circle cx="122" cy="82" fill="#d9823b" r="7" />
      <circle cx="100" cy="68" fill="#f7d6e0" r="16" />
      <circle cx="100" cy="68" fill="#e7a3b8" r="7" />
      <circle cx="98" cy="98" fill="#fffdf8" r="14" />
      <circle cx="98" cy="98" fill="#f2c94c" r="5" />
      <path d="M62 100h76l-26 80H88Z" fill="#c9a27a" />
      <path d="M100 100h38l-26 80h-12Z" fill="#b48a62" />
      <path d="M84 136h32" stroke="#8a6a4c" strokeWidth="4" />
    </svg>
  );
}

export function RoseBox() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 200 200">
      <rect fill="#e9e4ef" height="200" width="200" />
      <ellipse cx="100" cy="170" fill="#d6cfe0" rx="66" ry="9" />
      <path d="M44 102h112v58a8 8 0 0 1-8 8H52a8 8 0 0 1-8-8Z" fill="#16232e" />
      <ellipse cx="100" cy="102" fill="#233645" rx="56" ry="12" />
      <g fill="#c83f55">
        <circle cx="70" cy="94" r="15" />
        <circle cx="100" cy="88" r="16" />
        <circle cx="130" cy="94" r="15" />
        <circle cx="84" cy="104" r="13" />
        <circle cx="116" cy="104" r="13" />
      </g>
      <g fill="none" stroke="#9e2a3f" strokeLinecap="round" strokeWidth="2.5">
        <path d="M64 92a7 7 0 0 1 10 4" />
        <path d="M94 86a7 7 0 0 1 11 4" />
        <path d="M125 92a7 7 0 0 1 10 4" />
      </g>
      <rect fill="#f7f5f0" height="3" opacity=".5" width="112" x="44" y="130" />
    </svg>
  );
}

export function Succulent() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 200 200">
      <rect fill="#e4ece2" height="200" width="200" />
      <ellipse cx="100" cy="174" fill="#cfdccc" rx="50" ry="8" />
      <path
        d="M62 112h76l-10 58a8 8 0 0 1-8 6H80a8 8 0 0 1-8-6Z"
        fill="#c8704a"
      />
      <rect fill="#b35f3c" height="14" rx="4" width="84" x="58" y="104" />
      <g fill="#6f9f7a">
        <path d="M100 104c-10-14-10-34 0-46 10 12 10 32 0 46Z" />
        <path d="M100 104c-20-4-34-18-36-34 16 2 30 16 36 34Z" />
        <path d="M100 104c20-4 34-18 36-34-16 2-30 16-36 34Z" />
      </g>
      <g fill="#8dbb95">
        <path d="M100 104c-16 2-30-4-38-14 14-2 28 4 38 14Z" />
        <path d="M100 104c16 2 30-4 38-14-14-2-28 4-38 14Z" />
        <path d="M100 104c-4-10-2-20 4-26 4 8 2 18-4 26Z" />
      </g>
    </svg>
  );
}

/** A café's afternoon promotion, as the image it would upload. */
export function PromoPoster({ price = "2x1" }: { price?: string }) {
  return (
    <svg
      aria-hidden="true"
      className="block h-auto w-full"
      viewBox="0 0 300 375"
    >
      <rect fill="#0d4a52" height="375" width="300" />
      <circle cx="232" cy="92" fill="#4ec3ce" opacity=".18" r="120" />
      <circle cx="60" cy="330" fill="#f7f5f0" opacity=".06" r="90" />
      <text
        fill="#8fdce3"
        fontFamily="Georgia, serif"
        fontSize="17"
        fontStyle="italic"
        x="28"
        y="58"
      >
        Todas las tardes
      </text>
      <text
        fill="#f7f5f0"
        fontFamily="Georgia, serif"
        fontSize="92"
        fontWeight="700"
        x="24"
        y="160"
      >
        {price}
      </text>
      <text
        fill="#f7f5f0"
        fontFamily="Georgia, serif"
        fontSize="30"
        fontWeight="700"
        x="28"
        y="205"
      >
        en capuchinos
      </text>
      <rect fill="#4ec3ce" height="3" width="46" x="28" y="226" />
      <text
        fill="#dcecec"
        fontFamily="Georgia, serif"
        fontSize="17"
        x="28"
        y="262"
      >
        De 5 a 7 de la tarde
      </text>
      <text
        fill="#dcecec"
        fontFamily="Georgia, serif"
        fontSize="17"
        x="28"
        y="288"
      >
        en la terraza.
      </text>
      <text
        fill="#8fdce3"
        fontFamily="Georgia, serif"
        fontSize="15"
        letterSpacing="1"
        x="28"
        y="345"
      >
        Café Central
      </text>
    </svg>
  );
}

/* Dishes for the Menú's 64 px photos (ADR 017). */

export function Espresso() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 64 64">
      <rect fill="#efe4d4" height="64" width="64" />
      <ellipse cx="32" cy="44" fill="#fffdf8" rx="20" ry="6" />
      <path d="M20 26h22v10a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8Z" fill="#fffdf8" />
      <path
        d="M42 29h3a4 4 0 0 1 0 8h-3"
        fill="none"
        stroke="#fffdf8"
        strokeWidth="3"
      />
      <ellipse cx="31" cy="26" fill="#6b3f22" rx="11" ry="3" />
      <ellipse cx="29" cy="25.5" fill="#a0673d" rx="4" ry="1" />
    </svg>
  );
}

export function Cappuccino() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 64 64">
      <rect fill="#e7ded0" height="64" width="64" />
      <ellipse cx="32" cy="34" fill="#fffdf8" rx="24" ry="22" />
      <ellipse cx="32" cy="33" fill="#c89a6d" rx="18" ry="16.5" />
      <path
        d="M32 43c-6-4-9-7-9-10.5a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1C41 36 38 39 32 43Z"
        fill="#fbf3e6"
      />
    </svg>
  );
}

export function CafeDeOlla() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 64 64">
      <rect fill="#f1e2cf" height="64" width="64" />
      <ellipse cx="30" cy="50" fill="#e2cbb0" rx="18" ry="4" />
      <path
        d="M17 22h26l-3 22a6 6 0 0 1-6 5h-8a6 6 0 0 1-6-5Z"
        fill="#b9653a"
      />
      <path
        d="M43 26c7 0 7 12-1 12"
        fill="none"
        stroke="#9c5230"
        strokeWidth="3.5"
      />
      <ellipse cx="30" cy="22" fill="#5a3320" rx="13" ry="3" />
      <path
        d="M20 31h20"
        stroke="#e7a36f"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <rect
        fill="#8a5a3c"
        height="3"
        rx="1.5"
        transform="rotate(-35 44 17)"
        width="16"
        x="36"
        y="15"
      />
    </svg>
  );
}

export function ConchaSmall() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 64 64">
      <rect fill="#f4e6d6" height="64" width="64" />
      <ellipse cx="32" cy="46" fill="#fffdf8" rx="24" ry="6" />
      <path d="M11 42c0-13 9.5-21 21-21s21 8 21 21Z" fill="#d9a066" />
      <path d="M14 40c0-11 8-18 18-18s18 7 18 18Z" fill="#f5e6d0" />
      <g fill="none" stroke="#e3c9a6" strokeLinecap="round" strokeWidth="1.6">
        <path d="M32 23v17" />
        <path d="M23 26c3 4 4 8 4 14" />
        <path d="M41 26c-3 4-4 8-4 14" />
      </g>
    </svg>
  );
}

export function Chilaquiles() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 64 64">
      <rect fill="#e6ecde" height="64" width="64" />
      <circle cx="32" cy="33" fill="#fffdf8" r="24" />
      <circle cx="32" cy="33" fill="#5f8f37" r="17" />
      <g fill="#e8b85a">
        <path d="m20 30 9-6 1 10Z" />
        <path d="m33 22 10 4-7 7Z" />
        <path d="m26 38 10-3-2 10Z" />
        <path d="m38 34 7 5-9 3Z" />
      </g>
      <path
        d="M22 36c4-3 8 2 12-1s7-1 9 1"
        fill="none"
        stroke="#fffdf8"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="28" cy="29" fill="#f2f2f2" r="2" />
      <circle cx="37" cy="40" fill="#f2f2f2" r="1.6" />
    </svg>
  );
}
