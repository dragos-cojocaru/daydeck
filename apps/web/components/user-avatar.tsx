import { Avatar, AvatarFallback, AvatarImage } from "@daydeck/ui/components/avatar";

/** A round avatar that falls back to initials when there is no image or it fails to load. */
export function UserAvatar({
  name,
  src,
  size = "default",
  className,
}: {
  name: string;
  src: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {/* No referrer, so avatar hosts do not learn which page showed the image. */}
      {src ? <AvatarImage src={src} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback aria-hidden="true">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function initials(name: string): string {
  const words = name.replace(/^@/, "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];
  return (
    letters
      .map((word) => word?.[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}
