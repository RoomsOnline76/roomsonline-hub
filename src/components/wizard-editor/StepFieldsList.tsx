import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, GripVertical, Edit, Trash2, Lock } from "lucide-react";
import {
  OnboardingStepWithFields,
  OnboardingField,
  useFieldMutations,
} from "@/hooks/useWizardConfig";
import { useFieldRegistry } from "@/hooks/useFieldRegistry";

interface StepFieldsListProps {
  step: OnboardingStepWithFields;
  wizardId: string;
}

export function StepFieldsList({ step, wizardId }: StepFieldsListProps) {
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<OnboardingField | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const [fieldForm, setFieldForm] = useState({
    label_override: "",
    help_text: "",
    is_required: false,
    is_pms_lockable: false,
    score_weight: 0,
  });

  const { data: fieldRegistry } = useFieldRegistry();
  const { createField, updateField, deleteField } = useFieldMutations();

  // Get available fields (not already in this step)
  const usedFieldKeys = step.fields.map((f) => f.field_key);
  const availableFields =
    fieldRegistry?.filter((f) => !usedFieldKeys.includes(f.field_key)) || [];

  const handleAddField = async () => {
    if (!selectedFieldKey) return;

    const registryField = fieldRegistry?.find(
      (f) => f.field_key === selectedFieldKey
    );

    await createField.mutateAsync({
      step_id: step.id,
      wizard_id: wizardId,
      field_key: selectedFieldKey,
      label_override: fieldForm.label_override || undefined,
      help_text: fieldForm.help_text || undefined,
      is_required: fieldForm.is_required,
      is_pms_lockable: registryField?.pms_lockable || false,
      score_weight: fieldForm.score_weight,
      order_index: step.fields.length,
    });

    setAddFieldDialogOpen(false);
    resetFieldForm();
  };

  const handleUpdateField = async () => {
    if (!editingField) return;

    await updateField.mutateAsync({
      id: editingField.id,
      wizard_id: wizardId,
      label_override: fieldForm.label_override || undefined,
      help_text: fieldForm.help_text || undefined,
      is_required: fieldForm.is_required,
      score_weight: fieldForm.score_weight,
    });

    setEditingField(null);
    resetFieldForm();
  };

  const handleDeleteField = async (field: OnboardingField) => {
    if (!confirm(`Remove field "${field.field_key}" from this step?`)) return;
    await deleteField.mutateAsync({ id: field.id, wizard_id: wizardId });
  };

  const handleEditField = (field: OnboardingField) => {
    setFieldForm({
      label_override: field.label_override || "",
      help_text: field.help_text || "",
      is_required: field.is_required,
      is_pms_lockable: field.is_pms_lockable,
      score_weight: field.score_weight,
    });
    setEditingField(field);
  };

  const resetFieldForm = () => {
    setSelectedFieldKey("");
    setFieldForm({
      label_override: "",
      help_text: "",
      is_required: false,
      is_pms_lockable: false,
      score_weight: 0,
    });
  };

  const getFieldLabel = (field: OnboardingField) => {
    const registryField = fieldRegistry?.find(
      (f) => f.field_key === field.field_key
    );
    return field.label_override || registryField?.ui_label || field.field_key;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Fields in this step</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddFieldDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Field
        </Button>
      </div>

      {step.fields.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
          No fields configured. Add fields from the registry.
        </div>
      ) : (
        <div className="space-y-2">
          {step.fields.map((field) => (
            <div
              key={field.id}
              className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {getFieldLabel(field)}
                  </span>
                  {field.is_pms_lockable && (
                    <Badge
                      variant="outline"
                      className="text-xs flex items-center gap-1"
                    >
                      <Lock className="h-3 w-3" />
                      PMS
                    </Badge>
                  )}
                  {field.is_required && (
                    <Badge variant="secondary" className="text-xs">
                      Required
                    </Badge>
                  )}
                  {field.score_weight > 0 && (
                    <Badge variant="outline" className="text-xs">
                      +{field.score_weight} pts
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{field.field_key}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditField(field)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteField(field)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Field Dialog */}
      <Dialog open={addFieldDialogOpen} onOpenChange={setAddFieldDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Field to Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Field</Label>
              <select
                className="w-full mt-1 p-2 border rounded-md bg-background"
                value={selectedFieldKey}
                onChange={(e) => {
                  setSelectedFieldKey(e.target.value);
                  const field = fieldRegistry?.find(
                    (f) => f.field_key === e.target.value
                  );
                  if (field) {
                    setFieldForm((prev) => ({
                      ...prev,
                      is_pms_lockable: field.pms_lockable,
                      is_required: field.is_required,
                    }));
                  }
                }}
              >
                <option value="">Choose a field...</option>
                {Object.entries(
                  availableFields.reduce((acc, field) => {
                    const section = field.section || "Other";
                    if (!acc[section]) acc[section] = [];
                    acc[section].push(field);
                    return acc;
                  }, {} as Record<string, typeof availableFields>)
                ).map(([section, fields]) => (
                  <optgroup key={section} label={section}>
                    {fields.map((field) => (
                      <option key={field.field_key} value={field.field_key}>
                        {field.ui_label} ({field.field_key})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <Label>Label Override (optional)</Label>
              <Input
                value={fieldForm.label_override}
                onChange={(e) =>
                  setFieldForm({ ...fieldForm, label_override: e.target.value })
                }
                placeholder="Custom label for this context"
              />
            </div>

            <div>
              <Label>Help Text (optional)</Label>
              <Input
                value={fieldForm.help_text}
                onChange={(e) =>
                  setFieldForm({ ...fieldForm, help_text: e.target.value })
                }
                placeholder="Additional guidance for users"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Required in this step</Label>
              <Switch
                checked={fieldForm.is_required}
                onCheckedChange={(checked) =>
                  setFieldForm({ ...fieldForm, is_required: checked })
                }
              />
            </div>

            <div>
              <Label>Score Weight: {fieldForm.score_weight} pts</Label>
              <Slider
                value={[fieldForm.score_weight]}
                onValueChange={([value]) =>
                  setFieldForm({ ...fieldForm, score_weight: value })
                }
                max={100}
                step={5}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Points contributed to onboarding completion score
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddFieldDialogOpen(false);
                resetFieldForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddField}
              disabled={!selectedFieldKey || createField.isPending}
            >
              Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Field Dialog */}
      <Dialog open={!!editingField} onOpenChange={() => setEditingField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Field Key</Label>
              <Input value={editingField?.field_key || ""} disabled />
            </div>

            <div>
              <Label>Label Override</Label>
              <Input
                value={fieldForm.label_override}
                onChange={(e) =>
                  setFieldForm({ ...fieldForm, label_override: e.target.value })
                }
                placeholder="Custom label for this context"
              />
            </div>

            <div>
              <Label>Help Text</Label>
              <Input
                value={fieldForm.help_text}
                onChange={(e) =>
                  setFieldForm({ ...fieldForm, help_text: e.target.value })
                }
                placeholder="Additional guidance for users"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Required</Label>
              <Switch
                checked={fieldForm.is_required}
                onCheckedChange={(checked) =>
                  setFieldForm({ ...fieldForm, is_required: checked })
                }
              />
            </div>

            <div>
              <Label>Score Weight: {fieldForm.score_weight} pts</Label>
              <Slider
                value={[fieldForm.score_weight]}
                onValueChange={([value]) =>
                  setFieldForm({ ...fieldForm, score_weight: value })
                }
                max={100}
                step={5}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingField(null);
                resetFieldForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateField} disabled={updateField.isPending}>
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
