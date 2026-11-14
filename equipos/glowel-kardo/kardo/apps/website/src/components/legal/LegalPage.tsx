import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { Container } from "@/components/ui";
import {
  isLegalPageVisible,
  type LegalSlug,
  legalDocuments,
  loadLegalDocument,
  visibleLegalSlugs,
} from "@/lib/legal";
import type { Block, Inline } from "@/lib/legal-markdown";

export function legalMetadata(slug: LegalSlug): Metadata {
  const document = loadLegalDocument(slug);
  return {
    title: document.title,
    description: document.description,
    alternates: { canonical: `/${slug}/` },
    // A draft (titular data still missing) is never indexed.
    robots:
      document.missing.length > 0 ? { index: false, follow: false } : undefined,
  };
}

function renderInline(parts: Inline[], keyPrefix: string): ReactNode[] {
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (part.kind) {
      case "text":
        return part.value;
      case "strong":
        return (
          <strong className="font-semibold text-ink" key={key}>
            {renderInline(part.children, key)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(part.children, key)}</em>;
      case "code":
        return (
          <code
            className="rounded bg-line/60 px-1 py-0.5 text-[0.92em]"
            key={key}
          >
            {renderInline(part.children, key)}
          </code>
        );
      case "link": {
        const external = part.href.startsWith("https://");
        return (
          <a
            className="font-medium text-ink underline decoration-aqua decoration-2 underline-offset-2 hover:decoration-ink"
            href={part.href}
            key={key}
            {...(external
              ? { rel: "noopener noreferrer", target: "_blank" }
              : {})}
          >
            {renderInline(part.children, key)}
          </a>
        );
      }
      case "placeholder":
        return (
          <mark className="rounded bg-amber-100 px-1 text-amber-900" key={key}>
            [{part.value}]
          </mark>
        );
    }
    return null;
  });
}

function renderBlock(block: Block, index: number): ReactNode {
  const key = `b${index}`;
  switch (block.kind) {
    case "heading": {
      const content = renderInline(block.inline, key);
      if (block.level <= 2) {
        return (
          <h2
            className="mt-12 scroll-mt-24 text-2xl font-semibold tracking-[-0.02em] text-ink"
            id={block.id}
            key={key}
          >
            {content}
          </h2>
        );
      }
      return (
        <h3
          className="mt-8 scroll-mt-24 text-lg font-semibold text-ink"
          id={block.id}
          key={key}
        >
          {content}
        </h3>
      );
    }
    case "paragraph":
      return (
        <p className="mt-4 leading-relaxed" key={key}>
          {renderInline(block.inline, key)}
        </p>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          className={`mt-4 grid gap-2 pl-5 leading-relaxed ${block.ordered ? "list-decimal" : "list-disc"} marker:text-ink-soft`}
          key={key}
        >
          {block.items.map((item, itemIndex) => (
            <li
              className={item.level === 1 ? "ml-5" : undefined}
              // biome-ignore lint/suspicious/noArrayIndexKey: static text, never reordered
              key={`${key}-${itemIndex}`}
            >
              {renderInline(item.inline, `${key}-${itemIndex}`)}
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div
          className="mt-6 overflow-x-auto rounded-xl border border-line"
          key={key}
        >
          <table className="w-full min-w-[36rem] border-collapse text-left text-[15px]">
            <thead className="bg-line/40">
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th
                    className="px-4 py-3 font-semibold text-ink"
                    // biome-ignore lint/suspicious/noArrayIndexKey: static text, never reordered
                    key={`${key}-h${cellIndex}`}
                    scope="col"
                  >
                    {renderInline(cell, `${key}-h${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  className="border-t border-line align-top"
                  // biome-ignore lint/suspicious/noArrayIndexKey: static text, never reordered
                  key={`${key}-r${rowIndex}`}
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      className="px-4 py-3"
                      // biome-ignore lint/suspicious/noArrayIndexKey: static text, never reordered
                      key={`${key}-r${rowIndex}-${cellIndex}`}
                    >
                      {renderInline(cell, `${key}-r${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return (
        <blockquote
          className="mt-4 border-l-4 border-aqua bg-white/60 px-4 py-3 leading-relaxed"
          key={key}
        >
          {renderInline(block.inline, key)}
        </blockquote>
      );
    case "rule":
      return <hr className="my-10 border-line" key={key} />;
  }
}

export function LegalPage({ slug }: { slug: LegalSlug }) {
  if (!isLegalPageVisible(slug)) notFound();
  const document = loadLegalDocument(slug);
  return (
    <>
      <header className="border-b border-line bg-paper">
        <Container className="flex min-h-16 items-center justify-between gap-6">
          <a aria-label="Kardo, ir al inicio" href="/">
            <Logo className="h-7 w-auto" tone="light" />
          </a>
          <nav aria-label="Documentos legales">
            <ul className="flex flex-wrap justify-end gap-x-5 gap-y-1 text-sm">
              {visibleLegalSlugs().map((other) => (
                <li key={other}>
                  <a
                    aria-current={other === slug ? "page" : undefined}
                    className={
                      other === slug
                        ? "font-semibold text-ink"
                        : "text-ink/70 hover:text-ink"
                    }
                    href={`/${other}/`}
                  >
                    {legalDocuments[other].title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </header>
      <main className="bg-paper pb-24 text-[16px] text-ink/85" id="contenido">
        <Container>
          <article className="mx-auto max-w-3xl pt-14">
            {document.missing.length > 0 ? (
              <div
                className="mb-10 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950"
                role="note"
              >
                <p className="font-semibold">
                  Borrador: este documento aún no está vigente.
                </p>
                <p className="mt-1 text-sm">
                  Faltan datos del titular ({document.missing.length}). En
                  producción no se publica hasta completarlos.
                </p>
              </div>
            ) : null}
            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
              {document.title}
            </h1>
            {document.blocks.map(renderBlock)}
          </article>
        </Container>
      </main>
      <Footer />
    </>
  );
}
