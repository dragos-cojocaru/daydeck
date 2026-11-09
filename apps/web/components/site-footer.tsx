import Link from "next/link";
import { BufferLink } from "./buffer-link";
import { ThemeMenu } from "./theme-menu";

/**
 * Shown on every page: the app is built on Buffer's API, not made by Buffer, and the theme menu.
 * Its two controls stay 44px tall for fingers and shrink to 32px for a mouse from 768px.
 */
export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 px-4 py-2 text-center text-muted-foreground text-sm md:py-3">
      <span>
        {/* Plain spaces around the link, the same as between the other words. */}
        Built on the <BufferLink /> API. <span>Not affiliated with or endorsed by Buffer.</span>
      </span>
      <Link
        href="/privacy"
        className="inline-flex min-h-11 items-center underline underline-offset-3 hover:text-foreground md:pointer-fine:min-h-8"
      >
        Privacy
      </Link>
      <ThemeMenu />
    </footer>
  );
}
