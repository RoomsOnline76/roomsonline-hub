import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit,
  FileText,
  CheckSquare,
  Code,
} from "lucide-react";
import {
  OnboardingWizardWithSteps,
  OnboardingStepWithFields,
  useStepMutations,
} from "@/hooks/useWizardConfig";
import { StepFieldsList } from "./StepFieldsList";

interface WizardStructureEditorProps {
  wizard: OnboardingWizardWithSteps;
}

const COMPONENT_TYPES = [
  { value: "form", label: "Form", icon: FileText },
  { value: "confirmation", label: "Confirmation", icon: CheckSquare },
  { value: "custom", label: "Custom Component", icon: Code },
];

const ICONS = [
  "FileText",
  "Building",
  "MapPin",
  "Bed",
  "Users",
  "Image",
  "Settings",
  "CheckSquare",
  "DollarSign",
  "Star",
];

export function WizardStructureEditor({ wizard }: WizardStructureEditorProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<OnboardingStepWithFields | null>(
    null
  );
  const [stepForm, setStepForm] = useState({
    step_key: "",
    title: "",
    description: "",
    is_required: true,
    component_type: "form" as "form" | "confirmation" | "custom",
    custom_component_path: "",
    icon: "FileText",
    estimated_minutes: 5,
    weight: 10,
  });

  const { createStep, updateStep, deleteStep, reorderSteps } = useStepMutations();

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const handleAddStep = async () => {
    if (!stepForm.step_key.trim() || !stepForm.title.trim()) return;

    await createStep.mutateAsync({
      wizard_id: wizard.id,
      step_key: stepForm.step_key,
      title: stepForm.title,
      description: stepForm.description || undefined,
      order_index: wizard.steps.length,
      is_required: stepForm.is_required,
      component_type: stepForm.component_type,
      custom_component_path:
        stepForm.component_type === "custom"
          ? stepForm.custom_component_path
          : undefined,
      icon: stepForm.icon,
      estimated_minutes: stepForm.estimated_minutes,
      weight: stepForm.weight,
    });

    setAddStepDialogOpen(false);
    resetStepForm();
  };

  const handleUpdateStep = async () => {
    if (!editingStep || !stepForm.title.trim()) return;

    await updateStep.mutateAsync({
      id: editingStep.id,
      wizard_id: wizard.id,
      title: stepForm.title,
      description: stepForm.description || undefined,
      is_required: stepForm.is_required,
      component_type: stepForm.component_type,
      custom_component_path:
        stepForm.component_type === "custom"
          ? stepForm.custom_component_path
          : undefined,
      icon: stepForm.icon,
      estimated_minutes: stepForm.estimated_minutes,
      weight: stepForm.weight,
    });

    setEditingStep(null);
    resetStepForm();
  };

  const handleDeleteStep = async (step: OnboardingStepWithFields) => {
    if (
      !confirm(
        `Delete step "${step.title}"? This will also remove all fields in this step.`
      )
    )
      return;
    await deleteStep.mutateAsync({ id: step.id, wizard_id: wizard.id });
  };

  const handleToggleStepActive = async (step: OnboardingStepWithFields) => {
    await updateStep.mutateAsync({
      id: step.id,
      wizard_id: wizard.id,
      is_active: !step.is_active,
    });
  };

  const handleEditStep = (step: OnboardingStepWithFields) => {
    setStepForm({
      step_key: step.step_key,
      title: step.title,
      description: step.description || "",
      is_required: step.is_required,
      component_type: step.component_type,
      custom_component_path: step.custom_component_path || "",
      icon: step.icon,
      estimated_minutes: step.estimated_minutes,
      weight: step.weight,
    });
    setEditingStep(step);
  };

  const resetStepForm = () => {
    setStepForm({
      step_key: "",
      title: "",
      description: "",
      is_required: true,
      component_type: "form",
      custom_component_path: "",
      icon: "FileText",
      estimated_minutes: 5,
      weight: 10,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Wizard Steps</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Configure the steps and fields in your onboarding wizard
            </p>
          </div>
          <Button onClick={() => setAddStepDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Step
          </Button>
        </CardHeader>
        <CardContent>
          {wizard.steps.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No steps configured yet.</p>
              <p className="text-sm">Add your first step to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {wizard.steps.map((step, index) => {
                const isExpanded = expandedSteps.has(step.id);
                const TypeIcon =
                  COMPONENT_TYPES.find((t) => t.value === step.component_type)
                    ?.icon || FileText;

                return (
                  <Collapsible
                    key={step.id}
                    open={isExpanded}
                    onOpenChange={() => toggleStep(step.id)}
                  >
                    <div
                      className={`border rounded-lg ${
                        step.is_active
                          ? "bg-background"
                          : "bg-muted/50 opacity-60"
                      }`}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30">
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary">
                              <span className="text-sm font-medium">
                                {index + 1}
                              </span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{step.title}</span>
                                <Badge variant="outline" className="text-xs">
                                  <TypeIcon className="h-3 w-3 mr-1" />
                                  {step.component_type}
                                </Badge>
                                {step.is_required && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Required
                                  </Badge>
                                )}
                                {!step.is_active && (
                                  <Badge variant="destructive" className="text-xs">
                                    Disabled
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {step.fields.length} fields · {step.estimated_minutes}{" "}
                                min
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={step.is_active}
                              onCheckedChange={() => handleToggleStepActive(step)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditStep(step);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStep(step);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t p-4">
                          <StepFieldsList step={step} wizardId={wizard.id} />
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Step Dialog */}
      <Dialog
        open={addStepDialogOpen || !!editingStep}
        onOpenChange={(open) => {
          if (!open) {
            setAddStepDialogOpen(false);
            setEditingStep(null);
            resetStepForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingStep ? "Edit Step" : "Add Step"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingStep && (
              <div>
                <Label>Step Key</Label>
                <Input
                  value={stepForm.step_key}
                  onChange={(e) =>
                    setStepForm({
                      ...stepForm,
                      step_key: e.target.value.replace(/[^a-z0-9_]/g, "_"),
                    })
                  }
                  placeholder="e.g., property_identity"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Unique identifier (snake_case)
                </p>
              </div>
            )}

            <div>
              <Label>Title</Label>
              <Input
                value={stepForm.title}
                onChange={(e) =>
                  setStepForm({ ...stepForm, title: e.target.value })
                }
                placeholder="e.g., Property Identity"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={stepForm.description}
                onChange={(e) =>
                  setStepForm({ ...stepForm, description: e.target.value })
                }
                placeholder="Brief description shown to users"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Component Type</Label>
                <Select
                  value={stepForm.component_type}
                  onValueChange={(value: "form" | "confirmation" | "custom") =>
                    setStepForm({ ...stepForm, component_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPONENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Icon</Label>
                <Select
                  value={stepForm.icon}
                  onValueChange={(value) =>
                    setStepForm({ ...stepForm, icon: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>
                        {icon}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {stepForm.component_type === "custom" && (
              <div>
                <Label>Custom Component Path</Label>
                <Input
                  value={stepForm.custom_component_path}
                  onChange={(e) =>
                    setStepForm({
                      ...stepForm,
                      custom_component_path: e.target.value,
                    })
                  }
                  placeholder="e.g., StepCustomPolicies"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Component name in @/components/onboarding/steps/
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estimated Minutes</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={stepForm.estimated_minutes}
                  onChange={(e) =>
                    setStepForm({
                      ...stepForm,
                      estimated_minutes: parseInt(e.target.value) || 5,
                    })
                  }
                />
              </div>
              <div>
                <Label>Weight (scoring)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={stepForm.weight}
                  onChange={(e) =>
                    setStepForm({
                      ...stepForm,
                      weight: parseInt(e.target.value) || 10,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Required Step</Label>
              <Switch
                checked={stepForm.is_required}
                onCheckedChange={(checked) =>
                  setStepForm({ ...stepForm, is_required: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddStepDialogOpen(false);
                setEditingStep(null);
                resetStepForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingStep ? handleUpdateStep : handleAddStep}
              disabled={
                !stepForm.title.trim() ||
                (!editingStep && !stepForm.step_key.trim()) ||
                createStep.isPending ||
                updateStep.isPending
              }
            >
              {editingStep ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
