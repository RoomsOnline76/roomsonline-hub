import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, ChevronDown, Trash2, Layers, Palette } from "lucide-react";

export interface Collection {
  collection_id: string;
  name: string;
  slug: string;
  branding: {
    primary_color: string;
    logo_url: string;
  };
  pricing_rules: {
    markup_percent: number;
    markup_flat: number;
  };
  availability_rules: {
    stop_sell: boolean;
    min_stay: number;
    max_stay: number;
  };
  navigation_tags: string[];
  is_active: boolean;
}

interface CollectionsManagerProps {
  collections: Collection[];
  onChange: (collections: Collection[]) => void;
  onDirty: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

const emptyCollection: Collection = {
  collection_id: "",
  name: "",
  slug: "",
  branding: { primary_color: "#1a1a2e", logo_url: "" },
  pricing_rules: { markup_percent: 0, markup_flat: 0 },
  availability_rules: { stop_sell: false, min_stay: 1, max_stay: 30 },
  navigation_tags: [],
  is_active: true,
};

export function CollectionsManager({ collections, onChange, onDirty }: CollectionsManagerProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const addCollection = () => {
    if (!newName.trim()) return;
    const slug = slugify(newName);
    const newCol: Collection = {
      ...emptyCollection,
      collection_id: slug,
      name: newName.trim(),
      slug,
    };
    onChange([...collections, newCol]);
    onDirty();
    setNewName("");
    setShowAdd(false);
  };

  const updateCollection = (index: number, updates: Partial<Collection>) => {
    const updated = collections.map((c, i) => (i === index ? { ...c, ...updates } : c));
    onChange(updated);
    onDirty();
  };

  const removeCollection = (index: number) => {
    onChange(collections.filter((_, i) => i !== index));
    onDirty();
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Collections (Multi-Brand)
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {collections.length} collection{collections.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Create branded website collections with custom pricing and availability rules. Each collection can power a unique branded booking experience.
        </p>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-3">
        {collections.map((col, idx) => (
          <Collapsible key={col.collection_id || idx}>
            <div className="border border-border rounded-lg">
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full border border-border"
                    style={{ backgroundColor: col.branding.primary_color || "#1a1a2e" }}
                  />
                  <span className="text-sm font-medium">{col.name}</span>
                  <Badge variant={col.is_active ? "default" : "secondary"} className="text-[10px]">
                    {col.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={col.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          const slug = slugify(name);
                          updateCollection(idx, { name, slug, collection_id: slug });
                        }}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Slug</Label>
                      <Input value={col.slug} disabled className="text-xs h-8 bg-muted" />
                    </div>
                  </div>

                  {/* Branding */}
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Palette className="h-3 w-3" /> Branding
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Primary Color</Label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={col.branding.primary_color || "#1a1a2e"}
                            onChange={(e) =>
                              updateCollection(idx, {
                                branding: { ...col.branding, primary_color: e.target.value },
                              })
                            }
                            className="w-8 h-8 rounded border border-border cursor-pointer"
                          />
                          <Input
                            value={col.branding.primary_color || ""}
                            onChange={(e) =>
                              updateCollection(idx, {
                                branding: { ...col.branding, primary_color: e.target.value },
                              })
                            }
                            className="text-xs h-8 flex-1"
                            placeholder="#1a1a2e"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Logo URL</Label>
                        <Input
                          value={col.branding.logo_url || ""}
                          onChange={(e) =>
                            updateCollection(idx, {
                              branding: { ...col.branding, logo_url: e.target.value },
                            })
                          }
                          className="text-xs h-8"
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pricing Rules */}
                  <div className="space-y-1">
                    <Label className="text-xs">Pricing Overrides</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Markup %</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={col.pricing_rules.markup_percent}
                          onChange={(e) =>
                            updateCollection(idx, {
                              pricing_rules: {
                                ...col.pricing_rules,
                                markup_percent: Number(e.target.value),
                              },
                            })
                          }
                          className="text-xs h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Flat Markup (R)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={col.pricing_rules.markup_flat}
                          onChange={(e) =>
                            updateCollection(idx, {
                              pricing_rules: {
                                ...col.pricing_rules,
                                markup_flat: Number(e.target.value),
                              },
                            })
                          }
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Availability Rules */}
                  <div className="space-y-1">
                    <Label className="text-xs">Availability Rules</Label>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Min Stay</Label>
                        <Input
                          type="number"
                          min={1}
                          value={col.availability_rules.min_stay}
                          onChange={(e) =>
                            updateCollection(idx, {
                              availability_rules: {
                                ...col.availability_rules,
                                min_stay: Number(e.target.value),
                              },
                            })
                          }
                          className="text-xs h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Max Stay</Label>
                        <Input
                          type="number"
                          min={1}
                          value={col.availability_rules.max_stay}
                          onChange={(e) =>
                            updateCollection(idx, {
                              availability_rules: {
                                ...col.availability_rules,
                                max_stay: Number(e.target.value),
                              },
                            })
                          }
                          className="text-xs h-8"
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={col.availability_rules.stop_sell}
                            onCheckedChange={(v) =>
                              updateCollection(idx, {
                                availability_rules: { ...col.availability_rules, stop_sell: v },
                              })
                            }
                          />
                          <Label className="text-[10px] text-muted-foreground">Stop Sell</Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Active toggle + Delete */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={col.is_active}
                        onCheckedChange={(v) => updateCollection(idx, { is_active: v })}
                      />
                      <Label className="text-xs">Active</Label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7"
                      onClick={() => removeCollection(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}

        {/* Add new collection */}
        {showAdd ? (
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Collection name (e.g. Luxury Escapes)"
              className="text-xs h-8"
              onKeyDown={(e) => e.key === "Enter" && addCollection()}
              autoFocus
            />
            <Button type="button" size="sm" className="h-8" onClick={addCollection}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setShowAdd(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Collection
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
