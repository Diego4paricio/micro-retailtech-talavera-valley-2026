"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { navigation } from "@/content/landing";
import { panel } from "@/lib/site";
import { Logo } from "./Logo";

/** "Precios" goes right before "Preguntas", once the catalog is approved. */
export function withPricing<T extends { href: string; label: string }>(
  links: T[],
  pricing: boolean,
): { href: string; label: string }[] {
  if (!pricing) return links;
  const last = links.at(-1);
  return last
    ? [...links.slice(0, -1), { href: "/precios/", label: "Precios" }, last]
    : [{ href: "/precios/", label: "Precios" }];
}

/**
 * Crisp white, fixed, architectural header inspired by Square's clarity.
 * Primary action: "Crear mi cuenta" to panel.signUp (/registro).
 * Secondary action: "Entrar" to panel.signIn.
 */
export function Header({
  home = true,
  pricing = false,
  editorial = home,
}: {
  home?: boolean;
  pricing?: boolean;
  /** Pages in the editorial style (home, /precios/, /piezas/): the header
   * shares their 5vw edges. */
  editorial?: boolean;
}) {
  const links = withPricing(
    navigation.map((link) => ({
      ...link,
      // Anchors of the home need the home's path on other pages.
      href: link.href.startsWith("#") && !home ? `/${link.href}` : link.href,
    })),
    pricing,
  );
  const [open, setOpen] = useState(false);
  const [pastHero, setPastHero] = useState(!home);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!home) return;
    const hero = document.getElementById("inicio");
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setPastHero(!entry.isIntersecting);
      },
      { rootMargin: "-68px 0px 0px 0px" },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [home]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <header
        data-past-hero={pastHero}
        className={`fixed inset-x-0 top-0 z-50 border-b border-stone-200/80 bg-white/95 text-ink shadow-xs backdrop-blur-md ${editorial ? "editorial-header" : ""}`}
      >
        <div className="header-bar mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:h-[68px] sm:px-6 lg:px-8">
          <a
            aria-label="Kardo, inicio"
            className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-hidden"
            href={home ? "#inicio" : "/"}
          >
            <Logo className="h-7 w-auto" tone="light" />
          </a>

          <nav aria-label="Principal" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    className="rounded-md px-3.5 py-1.5 text-[15px] font-medium text-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-hidden"
                    href={link.href}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="hidden items-center gap-5 lg:flex">
            <a
              className="text-[15px] font-medium text-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-hidden"
              href={panel.signIn}
            >
              Entrar
            </a>
            <a
              className="inline-flex h-10 items-center justify-center rounded-md bg-teal px-5 text-[14px] font-medium text-white shadow-xs transition-colors hover:bg-teal-hover focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-hidden cursor-pointer"
              href={panel.signUp}
            >
              Crear mi cuenta
            </a>
          </div>

          <button
            aria-controls="menu-movil"
            aria-expanded={open}
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-ink focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-hidden lg:hidden cursor-pointer"
            onClick={() => {
              if (open) {
                handleClose();
              } else {
                setOpen(true);
              }
            }}
            ref={triggerRef}
            type="button"
          >
            {open ? (
              <X aria-hidden="true" className="size-6" />
            ) : (
              <Menu aria-hidden="true" className="size-6" />
            )}
            <span className="sr-only">
              {open ? "Cerrar menú" : "Abrir menú"}
            </span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div
        aria-label="Menú de navegación"
        aria-modal="true"
        className={`fixed inset-x-0 top-16 bottom-0 z-[60] overflow-y-auto bg-white px-5 pt-4 pb-8 sm:top-[68px] lg:hidden ${
          open ? "flex" : "hidden"
        } flex-col justify-between gap-8`}
        id="menu-movil"
        role="dialog"
      >
        <nav aria-label="Principal en celular">
          <ul className="divide-y divide-ink/10">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  className="flex min-h-14 items-center text-lg font-medium tracking-tight text-ink"
                  href={link.href}
                  onClick={handleClose}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-3 pt-6 border-t border-ink/10">
          <a
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-teal text-[15px] font-medium text-white shadow-xs hover:bg-teal-hover"
            href={panel.signUp}
            onClick={handleClose}
          >
            Crear mi cuenta
          </a>
          <a
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-ink/15 text-[15px] font-medium text-ink hover:bg-ink/[0.03]"
            href={panel.signIn}
            onClick={handleClose}
          >
            Entrar a mi panel
          </a>
        </div>
      </div>
    </>
  );
}
