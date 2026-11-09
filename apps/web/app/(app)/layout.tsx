import { AppShell } from "@/features/shell/app-shell";

// Signed-in pages (and the guide): the sidebar shell. The session is read inside the sidebar's
// own Suspense boundary, so the page content never waits for it.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
