import { useState } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { usePropertyRoomTypes, type RoomTypeInfo } from "@/hooks/usePropertyRoomTypes";
import { PUBLIC_DOMAIN } from "@/lib/config";
import { Globe, LayoutGrid, BedDouble, CreditCard } from "lucide-react";

export type EntryPoint = "showcase" | "rooms" | "specific_room" | "checkout";

export interface EntryPointOptions {
  entryPoint: EntryPoint;
  roomId?: string;
  roomName?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
}

interface EntryPointSelectorProps {
  propertyId: string;
  value: EntryPointOptions;
  onChange: (opts: EntryPointOptions) => void;
}

const ENTRY_POINTS: { value: EntryPoint; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "showcase", label: "Full Showcase", icon: <Globe className="h-4 w-4" />, desc: "Hero, gallery, all rooms, reviews, map" },
  { value: "rooms", label: "Rooms & Availability", icon: <LayoutGrid className="h-4 w-4" />, desc: "Calendar + room cards (default embed)" },
  { value: "specific_room", label: "Specific Room", icon: <BedDouble className="h-4 w-4" />, desc: "Single room with availability" },
  { value: "checkout", label: "Checkout Only", icon: <CreditCard className="h-4 w-4" />, desc: "Jump to guest details & payment" },
];

export interface WhiteLabelOptions {
  /** True when generated URLs should hide ROL chrome (adds `wl=1`). */
  enabled: boolean;
  /** Optional host override (e.g. `https://book.theirdomain.com`). Falls back to PUBLIC_DOMAIN. */
  host?: string;
}

export function buildEntryUrl(
  property: { id: string; slug: string },
  opts: EntryPointOptions,
  params: Record<string, string> = {},
  whitelabel?: WhiteLabelOptions,
): string {
  const base = whitelabel?.host || PUBLIC_DOMAIN;
  const shared = new URLSearchParams(params);
  if (whitelabel?.enabled) {
    shared.set("wl", "1");
    shared.set("hide_powered_by", "1");
  }

  switch (opts.entryPoint) {
    case "showcase":
      return `${base}/property/${property.slug}?${shared}`;

    case "rooms":
      shared.set("mode", "embedded");
      return `${base}/embed/property/${property.slug}?${shared}`;

    case "specific_room":
      shared.set("mode", "embedded");
      if (opts.roomId) shared.set("room", opts.roomId);
      return `${base}/embed/property/${property.slug}?${shared}`;

    case "checkout": {
      if (opts.roomId) shared.set("roomTypeId", opts.roomId);
      if (opts.defaultCheckIn) shared.set("checkIn", opts.defaultCheckIn);
      if (opts.defaultCheckOut) shared.set("checkOut", opts.defaultCheckOut);
      return `${base}/booking/${property.slug}?${shared}`;
    }

    default:
      shared.set("mode", "embedded");
      return `${base}/embed/property/${property.slug}?${shared}`;
  }
}

export function EntryPointSelector({ propertyId, value, onChange }: EntryPointSelectorProps) {
  const { data: roomTypesRaw = [] } = usePropertyRoomTypes(propertyId);
  // Dedupe by normalized name — multi-unit rooms are stored as separate active rows
  // (e.g. GALJOEN x3), but for an integration entry point we only need one selectable per room type.
  const roomTypes = (() => {
    const seen = new Map<string, RoomTypeInfo>();
    for (const rt of roomTypesRaw) {
      const key = (rt.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.set(key, rt);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();
  const needsRoom = value.entryPoint === "specific_room" || value.entryPoint === "checkout";
  const needsDates = value.entryPoint === "checkout";

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
      <Label className="text-xs font-medium">Booking Flow Entry Point</Label>
      <RadioGroup
        value={value.entryPoint}
        onValueChange={(v) => onChange({ ...value, entryPoint: v as EntryPoint })}
        className="grid grid-cols-2 gap-2"
      >
        {ENTRY_POINTS.map((ep) => (
          <label
            key={ep.value}
            className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-all text-left ${
              value.entryPoint === ep.value
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
            }`}
          >
            <RadioGroupItem value={ep.value} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={value.entryPoint === ep.value ? "text-primary" : "text-muted-foreground"}>{ep.icon}</span>
                <span className="text-xs font-medium">{ep.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{ep.desc}</p>
            </div>
          </label>
        ))}
      </RadioGroup>

      {needsRoom && roomTypes.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Room Type</Label>
          <Select value={value.roomId || ""} onValueChange={(v) => onChange({ ...value, roomId: v, roomName: roomTypes.find(r => r.id === v)?.name })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a room type…" /></SelectTrigger>
            <SelectContent>
              {roomTypes.map((rt) => (
                <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {needsRoom && roomTypes.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No room types configured for this property yet.</p>
      )}

      {needsDates && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Default Check-in</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={value.defaultCheckIn || ""}
              onChange={(e) => onChange({ ...value, defaultCheckIn: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default Check-out</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={value.defaultCheckOut || ""}
              onChange={(e) => onChange({ ...value, defaultCheckOut: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
