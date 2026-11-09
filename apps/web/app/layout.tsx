import "@daydeck/ui/globals.css";
import { cn } from "@daydeck/ui/lib/utils";
import type { Metadata } from "next";
import { OfflineNotice } from "@/components/offline-notice";
import { ThemeProvider } from "@/components/theme-provider";
import { codeFont, displayFont, textFont } from "./fonts";

export const metadata: Metadata = {
  title: {
    default: "Daydeck",
    template: "%s · Daydeck",
  },
  description:
    "Run a posting challenge on top of Buffer: daily prompts, drafts in Buffer, automatic check-off.",
};

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
