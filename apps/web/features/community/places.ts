import {
  HashIcon,
  type LucideIcon,
  MegaphoneIcon,
  MessageSquareTextIcon,
  Share2Icon,
} from "lucide-react";
import type { Place } from "@/server/community/service";

// The community's places, in order. A plain module, so server pages and client parts share it.
export const PLACES: { place: Place; label: string; Icon: LucideIcon; about: string }[] = [
  {
    place: "updates",
    label: "Updates",
    Icon: MegaphoneIcon,
    about: "News from the host, and each day's prompt.",
  },
  {
    place: "chat",
    label: "Chat",
    Icon: HashIcon,
    about: "Questions, wins and anything about the challenge.",
  },
  {
    place: "posts",
    label: "Posts",
    Icon: Share2Icon,
    about: "Share your published post of the day. Others react and reply.",
  },
  {
    place: "feedback",
    label: "Feedback",
    Icon: MessageSquareTextIcon,
    about: "Drafts people want a second pair of eyes on, before they post.",
  },
];
