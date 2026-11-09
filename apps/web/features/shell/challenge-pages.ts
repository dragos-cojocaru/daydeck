import {
  AwardIcon,
  CalendarRangeIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  MessagesSquareIcon,
} from "lucide-react";

// A challenge's pages, in tab order. A plain module, so server placeholders can show the same
// tabs before the page's data arrives.
export const CHALLENGE_PAGES = [
  { label: "Overview", Icon: LayoutDashboardIcon, href: (slug: string) => `/challenges/${slug}` },
  { label: "Board", Icon: LayoutListIcon, href: (slug: string) => `/challenges/${slug}/board` },
  {
    label: "Schedule",
    Icon: CalendarRangeIcon,
    href: (slug: string) => `/challenges/${slug}/plan`,
  },
  {
    label: "Community",
    Icon: MessagesSquareIcon,
    href: (slug: string) => `/challenges/${slug}/community`,
  },
  { label: "Recap", Icon: AwardIcon, href: (slug: string) => `/recap/${slug}` },
] as const;
