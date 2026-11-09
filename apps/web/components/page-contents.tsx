import type { ReactNode } from "react";

/**
 * "On this page": the page's sections, sticky on the right from 1024px so they stay one click
 * away while you read. Below 1024px it is hidden; pages show their own short list instead.
 */
export function PageContents({
  sections,
  footer,
}: {
  sections: readonly { id: string; label: string }[];
  footer?: ReactNode;
}) {
  return (
    <nav aria-label="On this page" className="hidden lg:sticky lg:top-20 lg:block">
      <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">On this page</p>
      <ul className="flex flex-col border-l">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="-ml-px flex min-h-9 items-center border-transparent border-l-2 px-3 text-muted-foreground text-sm outline-none hover:border-foreground/30 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
      {footer}
    </nav>
  );
}
