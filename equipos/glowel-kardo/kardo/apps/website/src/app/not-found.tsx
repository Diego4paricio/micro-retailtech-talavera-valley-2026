import type { Metadata } from "next";
import { LogoSymbol } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main
      className="flex min-h-[100svh] items-center bg-ink-deep text-white"
      id="contenido"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">
        <LogoSymbol className="h-12 w-auto" decorative tone="dark" />
        <h1 className="mt-8 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
          Esta página no existe.
        </h1>
        <p className="mt-5 max-w-lg text-lg text-ink-text">
          La dirección que buscas no existe o cambió.
        </p>
        <a
          className="mt-10 inline-flex min-h-12 items-center rounded-full bg-aqua px-6 font-semibold text-ink hover:bg-aqua-soft"
          href="/"
        >
          Ir al inicio
        </a>
      </div>
    </main>
  );
}
