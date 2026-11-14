import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { shortcuts } from "@/lib/site";

// The short addresses of config/redirects.mjs (/registro/, /entrar/,
// /activar/, /planes/, /kits/). On Netlify `out/_redirects` answers first;
// this page is the same redirect for any other host and for `next dev`.
// Only the listed addresses exist: anything else is the usual 404.

export const dynamicParams = false;

export function generateStaticParams() {
  return shortcuts.map(({ slug }) => ({ atajo: slug }));
}

type Props = { params: Promise<{ atajo: string }> };

function shortcutOf(slug: string) {
  return shortcuts.find((shortcut) => shortcut.slug === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shortcut = shortcutOf((await params).atajo);
  return {
    title: shortcut?.title ?? "Kardo",
    robots: { index: false, follow: false },
  };
}

/**
 * Goes on at once, carrying the query when the shortcut needs it
 * (`?plan=`, `?codigo=`). The target is fixed by the table, so nothing from
 * the address can choose where the visitor lands. The CSP hashes this
 * script at export time (scripts/harden-export.mjs).
 */
function forward(to: string, keepQuery: boolean): string {
  const target = JSON.stringify(to).replace(/</g, "\\u003c");
  return keepQuery
    ? `(function(){var t=new URL(${target},location.href);new URLSearchParams(location.search).forEach(function(v,k){t.searchParams.set(k,v)});location.replace(t.href)})();`
    : `location.replace(new URL(${target},location.href).href);`;
}

export default async function Shortcut({ params }: Props) {
  const shortcut = shortcutOf((await params).atajo);
  if (!shortcut) notFound();
  return (
    <main
      className="grid min-h-[100svh] place-items-center bg-cream px-5 text-ink"
      id="contenido"
    >
      {/* Without JavaScript: the same target, without the query. */}
      <meta content={`2;url=${shortcut.to}`} httpEquiv="refresh" />
      <div className="text-center">
        <Logo className="mx-auto h-8 w-auto" />
        <p className="mt-10 text-lg text-muted">Un momento, te llevamos.</p>
        <a
          className="mt-6 inline-flex min-h-12 items-center rounded-[3px] bg-teal px-6 font-medium text-white hover:bg-teal-hover"
          href={shortcut.to}
        >
          {shortcut.title}
        </a>
      </div>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed target from config/redirects.mjs, with "<" escaped.
        dangerouslySetInnerHTML={{
          __html: forward(shortcut.to, shortcut.keepQuery),
        }}
      />
    </main>
  );
}
