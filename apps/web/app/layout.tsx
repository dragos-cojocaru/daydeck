import "@daydeck/ui/globals.css";
import { cn } from "@daydeck/ui/lib/utils";
import type { Metadata, Viewport } from "next";
import { OfflineNotice } from "@/components/offline-notice";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site";
import { codeFont, displayFont, textFont } from "./fonts";

// The defaults every page starts from. Search results and link previews (Open Graph, X cards)
// need full URLs, built from metadataBase. The preview image is app/opengraph-image.tsx; pages
// with their own image (an invite, a recap) have an opengraph-image file next to them.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE.toLowerCase()}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_GB",
    title: `${SITE_NAME}: ${SITE_TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
};

// The brand green colors the browser bar on phones, and the edge of a link preview in Discord.
export const viewport: Viewport = { themeColor: "#206b38" };

// The document only. Public pages (app/(public)) add the simple header; signed-in pages
// (app/(app)) add the sidebar shell.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", displayFont.variable, textFont.variable, codeFont.variable)}
    >
      {/* Browser extensions such as Grammarly add attributes to <body> before React loads. */}
      <body className="min-h-dvh" suppressHydrationWarning>
        {/* The first stop for the Tab key: past the sidebar or header, straight to the page. */}
        <a
          href="#main"
          className="sr-only rounded-md bg-background px-4 py-2 font-medium text-sm shadow-lg outline-none ring-3 ring-ring/50 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          {children}
          <OfflineNotice />
        </ThemeProvider>
      </body>
    </html>
  );
}
