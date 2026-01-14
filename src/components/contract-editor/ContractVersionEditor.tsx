import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, Plus, Play, AlertCircle, CheckCircle } from "lucide-react";
import {
  ContractTemplateVersion,
  VariablesSchema,
  extractVariablesFromContent,
  validateContractVariables,
} from "@/hooks/useContractTemplates";

interface ContractVersionEditorProps {
  version: ContractTemplateVersion | undefined;
  onSave: (content: string, variables: VariablesSchema) => Promise<void>;
  onCreateVersion: (content: string, variables: VariablesSchema) => Promise<void>;
  onActivate: (versionId: string) => Promise<void>;
  isLoading: boolean;
}

export function ContractVersionEditor({
  version,
  onSave,
  onCreateVersion,
  onActivate,
  isLoading,
}: ContractVersionEditorProps) {
  const [content, setContent] = useState(version?.content_markdown || "");
  const [hasChanges, setHasChanges] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);

  useEffect(() => {
    if (version) {
      setContent(version.content_markdown);
      setHasChanges(false);
    }
  }, [version?.id]);

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(value !== version?.content_markdown);
  };

  const validation = validateContractVariables(
    content,
    version?.variables_schema || {}
  );

  const usedVariables = extractVariablesFromContent(content);

  const handleSave = async () => {
    await onSave(content, version?.variables_schema || {});
    setHasChanges(false);
  };

  const handleCreateNewVersion = async () => {
    // Use current version's content as the base for the new version
    const baseContent = version?.content_markdown || content;
    const baseSchema = version?.variables_schema || {};
    await onCreateVersion(baseContent, baseSchema);
    setHasChanges(false);
  };

  const handleActivate = async () => {
    if (!version) return;
    await onActivate(version.id);
    setActivateDialogOpen(false);
  };

  const isDraft = version?.status === "draft";
  const canEdit = isDraft;
  const canActivate = isDraft && validation.valid;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Contract Content</CardTitle>
            {version && (
              <Badge
                variant={
                  version.status === "active"
                    ? "default"
                    : version.status === "draft"
                    ? "secondary"
                    : "outline"
                }
              >
                v{version.version_number} - {version.status}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={isLoading}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
            )}
            {!isDraft && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateNewVersion}
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Version
              </Button>
            )}
            {canActivate && (
              <Button
                size="sm"
                onClick={() => setActivateDialogOpen(true)}
                disabled={isLoading}
              >
                <Play className="h-4 w-4 mr-2" />
                Activate
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Validation Status */}
          <div className="flex items-center gap-4 text-sm">
            {validation.valid ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>All variables valid</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-4 w-4" />
                <span>
                  {validation.undeclared.length > 0 &&
                    `Undeclared: ${validation.undeclared.join(", ")}. `}
                  {validation.missing.length > 0 &&
                    `Missing required: ${validation.missing.join(", ")}`}
                </span>
              </div>
            )}
            <div className="text-muted-foreground">
              Variables used: {usedVariables.length}
            </div>
          </div>

          {/* Editor */}
          <Textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder={`Enter contract content using Markdown...

Use {{variable_name}} syntax for dynamic variables.

Example:
# Property Agreement

This agreement is between RoomsOnline and **{{property_name}}**.

Commission Rate: {{commission_rate}}
Effective Date: {{effective_date}}`}
            className="min-h-[500px] font-mono text-sm"
            readOnly={!canEdit}
          />

          {/* Variable Quick Reference */}
          {Object.keys(version?.variables_schema || {}).length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="text-sm font-medium mb-2">
                Declared Variables (click to insert)
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(version?.variables_schema || {}).map(
                  ([key, config]) => (
                    <button
                      key={key}
                      className={`text-xs px-2 py-1 rounded border ${
                        config.required
                          ? "bg-primary/10 border-primary/30"
                          : "bg-muted border-border"
                      } hover:bg-accent cursor-pointer`}
                      onClick={() => {
                        if (!canEdit) return;
                        // Insert at cursor position or append
                        setContent((prev) => prev + `{{${key}}}`);
                        setHasChanges(true);
                      }}
                      disabled={!canEdit}
                    >
                      {`{{${key}}}`}
                      {config.required && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {!canEdit && version && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              This version is {version.status}. To make changes, create a new
              draft version.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activate Confirmation */}
      <AlertDialog
        open={activateDialogOpen}
        onOpenChange={setActivateDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate This Version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make version {version?.version_number} the active
              contract template. Any previously active version will be
              deprecated. New contracts will use this version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate}>
              Activate Version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
