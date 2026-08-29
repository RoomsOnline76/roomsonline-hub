import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NbProfile, NbRouteToken } from "@/lib/nbProfile";

interface PropertyOption {
  id: string;
  name: string;
}

interface Props {
  propertyId: string | undefined;
  profile: NbProfile;
  onChange: (next: NbProfile) => void;
  properties: PropertyOption[];
}

/** "Magari, Palala" -> ["Magari", "Palala"] */
const split = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Exclusion, routing and comparison quirks for one NightsBridge property.
 *
 * A single NightsBridge export can carry history for sibling properties that
 * used to share a BBID. Routing sends those rows to the property they belong to
 * and keeps them out of this property's figures, while the Excluded rows card
 * still shows every filtered row with the token that matched it.
 */
export function NbProfileCard({ propertyId, profile, onChange, properties }: Props) {
  const siblings = useMemo(
    () => properties.filter((option) => option.id !== propertyId),
    [properties, propertyId],
  );

  const patch = (next: Partial<NbProfile>) => onChange({ ...profile, ...next });

  const setToken = (index: number, next: Partial<NbRouteToken>) => {
    const tokens = profile.route_tokens.map((token, i) =>
      i === index ? { ...token, ...next } : token,
    );
    patch({ route_tokens: tokens });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Exclusion &amp; routing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs text-muted-foreground">
          Applies to NightsBridge exports only. Leave everything empty for a normal
          single-BBID property — the parse is then unchanged.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nb-exclude">Never include rows matching</Label>
            <Input
              id="nb-exclude"
              value={profile.exclude_patterns.join(", ")}
              onChange={(e) => patch({ exclude_patterns: split(e.target.value) })}
              placeholder="Magari, Palala"
            />
            <p className="text-xs text-muted-foreground">
              Matched against room, guest, company and source. Every match is listed on the
              run's Excluded rows card.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nb-keep">Keep zero-revenue rows matching</Label>
            <Input
              id="nb-keep"
              value={profile.keep_patterns.join(", ")}
              onChange={(e) => patch({ keep_patterns: split(e.target.value) })}
              placeholder="TOURVEST"
            />
            <p className="text-xs text-muted-foreground">
              Added to this property's keep-list: rows exported at 0.00 that are still real
              occupied nights.
            </p>
          </div>
        </div>

        {/* Routing tokens */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Route rows to another property</Label>
            <p className="text-xs text-muted-foreground">
              For exports that still carry a sibling's bookings. A row claimed by another
              property leaves this snapshot and is recorded as excluded.
            </p>
          </div>
          <div className="space-y-2">
            {profile.route_tokens.map((token, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-full sm:w-56"
                  value={token.match}
                  onChange={(e) => setToken(index, { match: e.target.value })}
                  placeholder="Room / guest / company text"
                  aria-label="Match text"
                />
                <Select
                  value={token.property_id}
                  onValueChange={(next) => setToken(index, { property_id: next })}
                >
                  <SelectTrigger className="w-full sm:w-64" aria-label="Destination property">
                    <SelectValue placeholder="Belongs to…" />
                  </SelectTrigger>
                  <SelectContent>
                    {siblings.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove routing rule"
                  onClick={() =>
                    patch({ route_tokens: profile.route_tokens.filter((_, i) => i !== index) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({ route_tokens: [...profile.route_tokens, { match: "", property_id: "" }] })
              }
            >
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add routing rule
            </Button>
          </div>
        </div>

        {/* Sheet map */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Sheet belongs to property</Label>
            <p className="text-xs text-muted-foreground">
              For one workbook holding a sheet per property. Sheet names are matched exactly
              (case-insensitive) and win over routing text.
            </p>
          </div>
          <div className="space-y-2">
            {Object.entries(profile.sheet_map).map(([sheet, target], index) => (
              <div key={`${sheet}-${index}`} className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-full sm:w-56"
                  value={sheet}
                  onChange={(e) => {
                    const entries = Object.entries(profile.sheet_map);
                    entries[index] = [e.target.value, target];
                    patch({ sheet_map: Object.fromEntries(entries) });
                  }}
                  placeholder="Sheet name"
                  aria-label="Sheet name"
                />
                <Select
                  value={target}
                  onValueChange={(next) =>
                    patch({ sheet_map: { ...profile.sheet_map, [sheet]: next } })
                  }
                >
                  <SelectTrigger className="w-full sm:w-64" aria-label="Sheet property">
                    <SelectValue placeholder="Belongs to…" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove sheet mapping"
                  onClick={() => {
                    const next = { ...profile.sheet_map };
                    delete next[sheet];
                    patch({ sheet_map: next });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ sheet_map: { ...profile.sheet_map, "": "" } })}
            >
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add sheet mapping
            </Button>
          </div>
        </div>

        {/* Comparison behaviour */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="nb-historical">Last year comes from this export</Label>
              <p className="text-xs text-muted-foreground">
                NightsBridge never moved the history when the BBID split, so prior-year
                arrivals in the uploaded ledger are the last-year actuals.
              </p>
            </div>
            <Switch
              id="nb-historical"
              checked={profile.historical_from_current_ledger}
              onCheckedChange={(checked) =>
                patch({ historical_from_current_ledger: checked })
              }
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="nb-stly">Compare against same-time-last-year workbook</Label>
              <p className="text-xs text-muted-foreground">
                The prior owner report becomes a required upload and supplies the
                same-time-last-year on-the-books comparison.
              </p>
            </div>
            <Switch
              id="nb-stly"
              checked={profile.stly_from_prior_workbook}
              onCheckedChange={(checked) => patch({ stly_from_prior_workbook: checked })}
            />
          </div>
        </div>

        {/* Group / combined report */}
        <div className="space-y-2">
          <Label htmlFor="nb-group-label">Combined report label</Label>
          <Input
            id="nb-group-label"
            value={profile.group_label ?? ""}
            onChange={(e) => patch({ group_label: e.target.value.trim() || null })}
            placeholder="Explorers Club — Franschhoek"
          />
          <p className="text-xs text-muted-foreground">
            Used as the header of the combined workbook when this property has group members.
          </p>
          <div className="space-y-2 pt-2">
            <Label>Group members</Label>
            <div className="flex flex-wrap gap-2">
              {siblings.map((option) => {
                const on = profile.group_property_ids.includes(option.id);
                return (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() =>
                      patch({
                        group_property_ids: on
                          ? profile.group_property_ids.filter((id) => id !== option.id)
                          : [...profile.group_property_ids, option.id],
                      })
                    }
                  >
                    {option.name}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
