import { PublicFrame } from "@/components/public-frame";

// Pages for people who may not have connected Buffer yet: the landing page, connect and
// invites. A simple header keeps them focused on one next step.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <PublicFrame>{children}</PublicFrame>;
}
