import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  OnboardingWizardWithSteps,
  OnboardingStepWithFields,
} from "@/hooks/useWizardConfig";
import { useFieldRegistry } from "@/hooks/useFieldRegistry";

interface WizardPreviewPaneProps {
  wizard: OnboardingWizardWithSteps;
}

export function WizardPreviewPane({ wizard }: WizardPreviewPaneProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [previewAsPMS, setPreviewAsPMS] = useState(false);
  const { data: fieldRegistry } = useFieldRegistry();

  const activeSteps = wizard.steps.filter((s) => s.is_active);
  const currentStep = activeSteps[currentStepIndex];
  const progress = activeSteps.length > 0 
    ? ((currentStepIndex + 1) / activeSteps.length) * 100 
    : 0;

  const goToNextStep = () => {
    if (currentStepIndex < activeSteps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const goToPrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const getFieldLabel = (fieldKey: string, labelOverride: string | null) => {
    const registryField = fieldRegistry?.find((f) => f.field_key === fieldKey);
    return labelOverride || registryField?.ui_label || fieldKey;
  };

  const getFieldType = (fieldKey: string) => {
    const registryField = fieldRegistry?.find((f) => f.field_key === fieldKey);
    return registryField?.data_type || "text";
  };

  const renderFieldPreview = (field: typeof currentStep.fields[0]) => {
    const label = getFieldLabel(field.field_key, field.label_override);
    const type = getFieldType(field.field_key);
    const isLocked = previewAsPMS && field.is_pms_lockable;

    return (
      <div key={field.id} className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className={isLocked ? "text-muted-foreground" : ""}>
            {label}
            {field.is_required && (
              <span className="text-destructive ml-1">*</span>
            )}
          </Label>
          {isLocked && (
            <Badge
              variant="outline"
              className="text-xs flex items-center gap-1"
            >
              <Lock className="h-3 w-3" />
              PMS Managed
            </Badge>
          )}
        </div>

        {type === "text" || type === "string" ? (
          <Input
            placeholder={`Enter ${label.toLowerCase()}`}
            disabled={isLocked}
            className={isLocked ? "bg-muted" : ""}
          />
        ) : type === "textarea" || type === "rich_text" ? (
          <Textarea
            placeholder={`Enter ${label.toLowerCase()}`}
            disabled={isLocked}
            className={isLocked ? "bg-muted" : ""}
          />
        ) : type === "boolean" ? (
          <Switch disabled={isLocked} />
        ) : type === "number" || type === "integer" ? (
          <Input
            type="number"
            placeholder="0"
            disabled={isLocked}
            className={isLocked ? "bg-muted" : ""}
          />
        ) : (
          <Input
            placeholder={`Enter ${label.toLowerCase()}`}
            disabled={isLocked}
            className={isLocked ? "bg-muted" : ""}
          />
        )}

        {field.help_text && (
          <p className="text-xs text-muted-foreground">{field.help_text}</p>
        )}
      </div>
    );
  };

  if (activeSteps.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">
            No active steps to preview. Enable some steps in the Structure tab.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Preview Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Label>Preview Mode:</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={previewAsPMS}
                  onCheckedChange={setPreviewAsPMS}
                />
                <span className="text-sm">
                  {previewAsPMS ? "With PMS Connected" : "No PMS"}
                </span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Simulates how the wizard appears to property owners
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wizard Preview */}
      <Card className="border-2">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{wizard.name}</CardTitle>
              {wizard.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {wizard.description}
                </p>
              )}
            </div>
            <Badge variant="outline">Preview Mode</Badge>
          </div>
        </CardHeader>

        {/* Progress Bar */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Step {currentStepIndex + 1} of {activeSteps.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          
          {/* Step Indicators */}
          <div className="flex items-center gap-2 mt-4 overflow-x-auto">
            {activeSteps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStepIndex(index)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  index === currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : index < currentStepIndex
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="font-medium">{index + 1}</span>
                <span className="hidden sm:inline">{step.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <CardContent className="py-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">{currentStep.title}</h2>
            {currentStep.description && (
              <p className="text-muted-foreground mt-1">
                {currentStep.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <span>~{currentStep.estimated_minutes} min</span>
              {currentStep.is_required && (
                <Badge variant="secondary">Required</Badge>
              )}
            </div>
          </div>

          {currentStep.fields.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground">
              <p>No fields configured for this step.</p>
              <p className="text-sm">
                Add fields in the Structure tab to see them here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {currentStep.fields
                .filter((f) => f.is_active)
                .map(renderFieldPreview)}
            </div>
          )}
        </CardContent>

        {/* Navigation */}
        <div className="border-t px-6 py-4 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={goToPrevStep}
            disabled={currentStepIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <div className="text-sm text-muted-foreground">
            {currentStep.fields.filter((f) => f.is_active).length} fields
          </div>

          <Button
            onClick={goToNextStep}
            disabled={currentStepIndex === activeSteps.length - 1}
          >
            {currentStepIndex === activeSteps.length - 1 ? "Complete" : "Next"}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
