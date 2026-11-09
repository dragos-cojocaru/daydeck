"use client";

import { Button } from "@daydeck/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@daydeck/ui/components/dropdown-menu";
import { cn } from "@daydeck/ui/lib/utils";
import { ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const THEMES = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

const subscribe = () => () => {};

/**
 * Light, dark or the device's setting. The saved choice is only known in the browser, so the
 * server renders the button with no label showing, at its final width.
 */
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  // Until it has mounted, render "System" exactly as the server did; then the saved choice.
  const current = (mounted && THEMES.find((item) => item.value === theme)) || THEMES[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-11 gap-1.5 px-3 font-normal text-muted-foreground hover:text-foreground aria-expanded:bg-muted md:pointer-fine:h-8"
          />
        }
      >
        <span className="sr-only">Theme: </span>
        {/* All three labels share one cell, so the button is always as wide as the widest
            and nothing moves when the saved choice appears. Only the current one shows. */}
        <span className="grid">
          {THEMES.map((item) => {
            const shown = mounted && item === current;
            return (
              <span
                key={item.value}
                aria-hidden={shown ? undefined : true}
                className={cn(
                  "col-start-1 row-start-1 flex items-center gap-1.5",
                  shown ? "visible" : "invisible",
                )}
              >
                <item.Icon aria-hidden="true" />
                {item.label}
              </span>
            );
          })}
        </span>
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" className="w-auto min-w-36">
        <DropdownMenuRadioGroup
          value={mounted ? (theme ?? "system") : undefined}
          onValueChange={setTheme}
        >
          {THEMES.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              closeOnClick
              className="min-h-11 gap-2 md:min-h-9"
            >
              <Icon aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
