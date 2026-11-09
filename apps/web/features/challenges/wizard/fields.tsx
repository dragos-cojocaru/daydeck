"use client";

import { buttonVariants } from "@daydeck/ui/components/button";
import { Calendar } from "@daydeck/ui/components/calendar";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@daydeck/ui/components/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@daydeck/ui/components/popover";
import { cn } from "@daydeck/ui/lib/utils";
import { CalendarIcon, CheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { NetworkIcon } from "@/features/settings/network-icon";
import { CHALLENGE_SERVICES, serviceName } from "@/features/settings/services";
import { zoneOffset } from "@/lib/time-zones";
import { formatLongDay } from "../format";

// The setup form's three special fields: a start date picker, a searchable time zone list and
// the networks a challenge counts.

/** A local date ("2026-11-09") as a Date at local midnight, for the calendar. */
function toDate(local: string): Date {
  const [year = 1970, month = 1, day = 1] = local.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A button that opens a calendar. Only a date is picked: each challenge day runs from midnight to
 * midnight, and people post at any time that day. Weekends are off for a weekday challenge.
 */
export function StartDateField({
  id,
  value,
  min,
  weekdaysOnly,
  describedBy,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  min: string;
  weekdaysOnly: boolean;
  describedBy: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-11 w-full max-w-sm justify-start gap-2 px-3 font-normal text-base aria-invalid:border-destructive",
        )}
      >
        <CalendarIcon aria-hidden="true" className="text-muted-foreground" />
        {value ? formatLongDay(value) : "Choose a date"}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={value ? toDate(value) : undefined}
          defaultMonth={toDate(value || min)}
          disabled={[{ before: toDate(min) }, ...(weekdaysOnly ? [{ dayOfWeek: [0, 6] }] : [])]}
          onSelect={(date) => {
            if (!date) return;
            onChange(toLocal(date));
            setOpen(false);
          }}
          // 40px days: easier to hit on a phone than the default 28px.
          className="[--cell-size:--spacing(10)]"
        />
      </PopoverContent>
    </Popover>
  );
}

interface ZoneItem {
  zone: string;
  city: string;
  region: string;
  offset: string;
}

interface ZoneGroup {
  label: string;
  items: ZoneItem[];
}

function zoneItem(zone: string, at: Date): ZoneItem {
  const parts = zone.replaceAll("_", " ").split("/");
  return {
    zone,
    city: parts.at(-1) ?? zone,
    region: parts.slice(0, -1).join(" / "),
    offset: zoneOffset(zone, at),
  };
}

const zoneLabel = (item: ZoneItem) =>
  `${item.city}${item.region ? `, ${item.region}` : ""} (${item.offset})`;

/** Lower case without accents, so "sao paulo" finds "São Paulo". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Every time zone, searchable by city, region or offset ("bucharest", "europe", "gmt+2"), with
 * the browser's own zone and UTC first. Buffer channels can use any of them, so none is left out.
 */
export function TimeZoneField({
  id,
  value,
  timeZones,
  suggested,
  describedBy,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  timeZones: string[];
  suggested: string;
  describedBy: string;
  invalid: boolean;
  onChange: (zone: string) => void;
}) {
  const { groups, byZone } = useMemo(() => {
    const now = new Date();
    const items = timeZones.map((zone) => zoneItem(zone, now));
    const first = [suggested, "UTC"];
    return {
      groups: [
        { label: "Suggested", items: items.filter((item) => first.includes(item.zone)) },
        { label: "All time zones", items: items.filter((item) => !first.includes(item.zone)) },
      ] satisfies ZoneGroup[],
      byZone: new Map(items.map((item) => [item.zone, item])),
    };
  }, [timeZones, suggested]);

  return (
    <Combobox<ZoneItem>
      items={groups}
      value={byZone.get(value) ?? null}
      onValueChange={(item) => {
        if (item) onChange(item.zone);
      }}
      itemToStringLabel={zoneLabel}
      isItemEqualToValue={(a, b) => a.zone === b.zone}
      filter={(item, query) =>
        fold(`${item.zone} ${item.city} ${item.region} ${item.offset}`).includes(fold(query.trim()))
      }
    >
      <ComboboxInput
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        placeholder="Search a city or GMT offset"
        className="h-11 w-full max-w-md [&_input]:text-base"
      />
      <ComboboxContent>
        <ComboboxEmpty>No time zone matches. Try a big city near you.</ComboboxEmpty>
        <ComboboxList>
          {(group: ZoneGroup) => (
            <ComboboxGroup key={group.label} items={group.items}>
              <ComboboxLabel>{group.label}</ComboboxLabel>
              <ComboboxCollection>
                {(item: ZoneItem) => (
                  <ComboboxItem key={item.zone} value={item} className="min-h-10">
                    <span className="min-w-0 flex-1 truncate">
                      {item.city}
                      {item.region ? (
                        <span className="text-muted-foreground"> {item.region}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                      {item.offset}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** Toggle chips, one per network, with its logo. */
export function NetworkChips({
  value,
  describedBy,
  onChange,
}: {
  value: string[];
  describedBy: string;
  onChange: (services: string[]) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-2" aria-describedby={describedBy}>
      {CHALLENGE_SERVICES.map((service) => (
        <li key={service}>
          <label
            className={cn(
              "group/chip flex h-11 cursor-pointer items-center gap-2 rounded-full border bg-card px-3.5 text-sm transition-colors",
              "hover:border-foreground/30 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              "has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={value.includes(service)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? CHALLENGE_SERVICES.filter((s) => s === service || value.includes(s))
                    : value.filter((s) => s !== service),
                )
              }
            />
            <NetworkIcon service={service} />
            {serviceName(service)}
            {/* A second cue besides the colour: a tick on chosen networks. */}
            <CheckIcon aria-hidden="true" className="hidden size-4 group-has-checked/chip:block" />
          </label>
        </li>
      ))}
    </ul>
  );
}
