import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit, AlertCircle } from "lucide-react";
import {
  VariablesSchema,
  ContractVariable,
  extractVariablesFromContent,
} from "@/hooks/useContractTemplates";

interface ContractVariablesPanelProps {
  schema: VariablesSchema;
  content: string;
  onChange: (schema: VariablesSchema) => void;
  readOnly?: boolean;
}

const VARIABLE_TYPES = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "percentage", label: "Percentage" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Currency" },
];

const VARIABLE_SOURCES = [
  { value: "properties.name", label: "Property Name" },
  { value: "properties.address", label: "Property Address" },
  { value: "properties.city", label: "Property City" },
  { value: "properties.owner_email", label: "Owner Email" },
  { value: "properties.owner_name", label: "Owner Name" },
  { value: "signed_at", label: "Signing Date" },
  { value: "manual", label: "Manual Input" },
];

/** Variables filled automatically from billing config / billing defaults / sales-rep tiers. */
const AUTO_VARIABLE_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Commission",
    keys: [
      "billing_strategy_label",
      "commission_rate",
      "commission_percentage",
      "listing_commission_rate",
      "listing_commission_clause",
      "pms_commission_rate",
      "pms_commission_clause",
      "widget_flat_commission_rate",
      "widget_flat_commission_clause",
    ],
  },
  {
    label: "Subscription & tiers",
    keys: [
      "subscription_fee_monthly",
      "subscription_clause",
      "tier_monthly_fee",
      "tier_room_count",
      "tier_clause",
      "volume_tier_clause",
      "enterprise_fee",
      "enterprise_fee_clause",
    ],
  },
  {
    label: "Add-ons",
    keys: [
      "white_label_monthly_fee",
      "white_label_setup_fee",
      "white_label_billing_mode",
      "white_label_clause",
      "branding_addon_monthly_fee",
      "branding_addon_setup_fee",
      "branding_addon_clause",
      "pricelabs_monthly_fee",
      "pricelabs_setup_fee",
      "pricelabs_clause",
      "channel_manager_per_unit_fee",
      "channel_manager_clause",
    ],
  },
  {
    label: "Payments",
    keys: [
      "payment_model_label",
      "payment_facilitator_fee",
      "payment_facilitator_clause",
      "byo_gateway_fee",
      "byo_gateway_clause",
      "reservation_only_clause",
    ],
  },
  {
    label: "Gateway billing schedule",
    keys: [
      "billing_model",
      "billing_percentage",
      "billing_fixed_fee",
      "billing_monthly_fee",
      "billing_volume_tiers_summary",
      "billing_config_version",
      "billing_schedule_clause",
    ],
  },

  {
    label: "Sales rep / referral",
    keys: [
      "rep_name",
      "rep_email",
      "rep_code",
      "commission_tier_label",
      "first_year_rate",
      "residual_rate",
      "residual_duration",
      "clawback_period",
      "partner_entity_type",
      "partner_tax_reference",
      "partner_vat_status",

    ],
  },
];

export function ContractVariablesPanel({
  schema,
  content,
  onChange,
  readOnly = false,
}: ContractVariablesPanelProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    key: string;
    type: ContractVariable["type"];
    required: boolean;
    source?: string;
    default?: string;
    description?: string;
  }>({
    key: "",
    type: "string",
    required: false,
  });

  const usedVariables = extractVariablesFromContent(content);
  const declaredVariables = Object.keys(schema);
  const undeclaredVariables = usedVariables.filter(
    (v) => !declaredVariables.includes(v)
  );

  const handleAddVariable = () => {
    if (!formData.key.trim()) return;

    const newSchema = {
      ...schema,
      [formData.key]: {
        type: formData.type,
        required: formData.required,
        source: formData.source || undefined,
        default: formData.default || undefined,
        description: formData.description || undefined,
      },
    };

    onChange(newSchema);
    setAddDialogOpen(false);
    setFormData({ key: "", type: "string", required: false });
  };

  const handleEditVariable = (key: string) => {
    const variable = schema[key];
    setFormData({
      key,
      type: variable.type,
      required: variable.required,
      source: variable.source,
      default: variable.default,
      description: variable.description,
    });
    setEditingKey(key);
    setAddDialogOpen(true);
  };

  const handleUpdateVariable = () => {
    if (!editingKey || !formData.key.trim()) return;

    const newSchema = { ...schema };
    
    // If key changed, delete old and add new
    if (editingKey !== formData.key) {
      delete newSchema[editingKey];
    }

    newSchema[formData.key] = {
      type: formData.type,
      required: formData.required,
      source: formData.source || undefined,
      default: formData.default || undefined,
      description: formData.description || undefined,
    };

    onChange(newSchema);
    setAddDialogOpen(false);
    setEditingKey(null);
    setFormData({ key: "", type: "string", required: false });
  };

  const handleDeleteVariable = (key: string) => {
    const newSchema = { ...schema };
    delete newSchema[key];
    onChange(newSchema);
  };

  const handleAddUndeclared = (key: string) => {
    setFormData({
      key,
      type: "string",
      required: false,
    });
    setAddDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Auto-filled variables reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Auto-filled Variables</CardTitle>
          <p className="text-xs text-muted-foreground">
            These are resolved at send/sign time from the property or portfolio billing config, falling back to
            Admin → Billing Defaults. You don't need to declare them — just use the placeholder in the contract body.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {AUTO_VARIABLE_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="text-xs font-medium">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.keys.map((key) => (
                  <Badge key={key} variant="secondary" className="font-mono text-[10px]">
                    {`{{${key}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Undeclared Variables Warning */}
      {undeclaredVariables.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              Undeclared Variables Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-600 dark:text-amber-300 mb-3">
              These variables are used in the contract but not declared in the
              schema:
            </p>
            <div className="flex flex-wrap gap-2">
              {undeclaredVariables.map((key) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddUndeclared(key)}
                  className="text-amber-700 border-amber-500/50"
                  disabled={readOnly}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {`{{${key}}}`}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Declared Variables */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Variable Schema</CardTitle>
          {!readOnly && (
            <Button
              size="sm"
              onClick={() => {
                setEditingKey(null);
                setFormData({ key: "", type: "string", required: false });
                setAddDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Variable
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {Object.keys(schema).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No variables defined yet.</p>
              <p className="text-sm">
                Add variables to make your contract dynamic.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(schema).map(([key, config]) => {
                const isUsed = usedVariables.includes(key);
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isUsed
                        ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                        : "bg-muted/50"
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
                          {`{{${key}}}`}
                        </code>
                        <Badge variant="outline" className="text-xs">
                          {config.type}
                        </Badge>
                        {config.required && (
                          <Badge
                            variant="destructive"
                            className="text-xs"
                          >
                            Required
                          </Badge>
                        )}
                        {!isUsed && (
                          <Badge
                            variant="secondary"
                            className="text-xs"
                          >
                            Unused
                          </Badge>
                        )}
                      </div>
                      {config.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {config.description}
                        </p>
                      )}
                      {config.source && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Source: {config.source}
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditVariable(key)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteVariable(key)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Variable Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingKey ? "Edit Variable" : "Add Variable"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Variable Name</Label>
              <Input
                value={formData.key}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"),
                  })
                }
                placeholder="e.g., property_name"
                disabled={!!editingKey}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use in contract as: {`{{${formData.key || "variable_name"}}}`}
              </p>
            </div>

            <div>
              <Label>Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: ContractVariable["type"]) =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VARIABLE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Data Source</Label>
              <Select
                value={formData.source || "manual"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    source: value === "manual" ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VARIABLE_SOURCES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Required</Label>
              <Switch
                checked={formData.required}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, required: checked })
                }
              />
            </div>

            <div>
              <Label>Default Value (optional)</Label>
              <Input
                value={formData.default || ""}
                onChange={(e) =>
                  setFormData({ ...formData, default: e.target.value })
                }
                placeholder="Default if not provided"
              />
            </div>

            <div>
              <Label>Description (optional)</Label>
              <Input
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="What this variable represents"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={editingKey ? handleUpdateVariable : handleAddVariable}
              disabled={!formData.key.trim()}
            >
              {editingKey ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
