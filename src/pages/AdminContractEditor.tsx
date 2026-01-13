import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Plus,
  FileText,
  Copy,
  Trash2,
  Play,
  Eye,
  History,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import {
  useContractTemplates,
  useContractTemplate,
  useContractTemplateMutations,
  extractVariablesFromContent,
  validateContractVariables,
  ContractTemplateVersion,
  VariablesSchema,
} from "@/hooks/useContractTemplates";
import { ContractVersionEditor } from "@/components/contract-editor/ContractVersionEditor";
import { ContractVariablesPanel } from "@/components/contract-editor/ContractVariablesPanel";
import { ContractPreviewPane } from "@/components/contract-editor/ContractPreviewPane";
import { ContractVersionHistory } from "@/components/contract-editor/ContractVersionHistory";

export default function AdminContractEditor() {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null
  );
  const [activeTab, setActiveTab] = useState("editor");
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: templates, isLoading: templatesLoading } =
    useContractTemplates();
  const { data: template, isLoading: templateLoading } =
    useContractTemplate(templateId);
  const {
    createTemplate,
    deleteTemplate,
    createVersion,
    updateVersion,
    activateVersion,
  } = useContractTemplateMutations();

  // Get current working version (selected or latest draft or current active)
  const workingVersion =
    template?.versions?.find((v) => v.id === selectedVersionId) ||
    template?.versions?.find((v) => v.status === "draft") ||
    template?.current_version ||
    template?.versions?.[0];

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;

    const result = await createTemplate.mutateAsync({
      name: newTemplateName,
      description: newTemplateDescription || undefined,
    });

    setCreateDialogOpen(false);
    setNewTemplateName("");
    setNewTemplateDescription("");
    navigate(`/admin/contract-editor/${result.id}`);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    await deleteTemplate.mutateAsync(templateToDelete);
    setDeleteDialogOpen(false);
    setTemplateToDelete(null);
    if (templateId === templateToDelete) {
      navigate("/admin/contract-editor");
    }
  };

  const handleDuplicateTemplate = async (sourceTemplateId: string) => {
    const sourceTemplate = templates?.find((t) => t.id === sourceTemplateId);
    if (!sourceTemplate) return;

    const result = await createTemplate.mutateAsync({
      name: `${sourceTemplate.name} (Copy)`,
      description: sourceTemplate.description || undefined,
    });

    navigate(`/admin/contract-editor/${result.id}`);
  };

  const handleCreateVersion = async (
    content: string,
    variables: VariablesSchema
  ) => {
    if (!templateId) return;
    await createVersion.mutateAsync({
      template_id: templateId,
      content_markdown: content,
      variables_schema: variables,
    });
  };

  const handleUpdateVersion = async (
    content: string,
    variables: VariablesSchema
  ) => {
    if (!templateId || !workingVersion || workingVersion.status !== "draft")
      return;
    await updateVersion.mutateAsync({
      id: workingVersion.id,
      template_id: templateId,
      content_markdown: content,
      variables_schema: variables,
    });
  };

  const handleActivateVersion = async (versionId: string) => {
    if (!templateId) return;
    await activateVersion.mutateAsync({
      version_id: versionId,
      template_id: templateId,
    });
  };

  // Template list view
  if (!templateId) {
    return (
      <AppLayout>
        <div className="container mx-auto py-6 space-y-6">
          <PageHeader
            title="Contract Templates"
            subtitle="Manage contract templates and versions"
          />

          <div className="flex justify-end">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>

          {templatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-5 bg-muted rounded w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : templates?.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No templates yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first contract template to get started.
                </p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates?.map((template) => (
                <Card
                  key={template.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() =>
                    navigate(`/admin/contract-editor/${template.id}`)
                  }
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        {template.name}
                      </CardTitle>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {template.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={template.is_active ? "default" : "secondary"}
                    >
                      {template.is_active ? "Active" : "Draft"}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        Created {format(new Date(template.created_at), "PP")}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateTemplate(template.id);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateToDelete(template.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Create Template Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Contract Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Template Name</Label>
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Standard Property Agreement"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  placeholder="Brief description of this template"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim() || createTemplate.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this template and all its versions.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTemplate}
                className="bg-destructive text-destructive-foreground"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    );
  }

  // Template editor view
  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/contract-editor")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <PageHeader
            title={template?.name || "Loading..."}
            subtitle={template?.description || "Edit contract template"}
          />
          <div className="ml-auto flex items-center gap-2">
            {workingVersion && (
              <Badge
                variant={
                  workingVersion.status === "active" ? "default" : "secondary"
                }
              >
                v{workingVersion.version_number} ({workingVersion.status})
              </Badge>
            )}
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
          </div>
        </div>

        {templateLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-[600px] bg-muted rounded-lg" />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="editor">
                <FileText className="h-4 w-4 mr-2" />
                Editor
              </TabsTrigger>
              <TabsTrigger value="variables">
                <AlertCircle className="h-4 w-4 mr-2" />
                Variables
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="editor" className="space-y-4">
              <ContractVersionEditor
                version={workingVersion}
                onSave={handleUpdateVersion}
                onCreateVersion={handleCreateVersion}
                onActivate={handleActivateVersion}
                isLoading={
                  updateVersion.isPending || createVersion.isPending
                }
              />
            </TabsContent>

            <TabsContent value="variables" className="space-y-4">
              <ContractVariablesPanel
                schema={workingVersion?.variables_schema || {}}
                content={workingVersion?.content_markdown || ""}
                onChange={(schema) => {
                  if (workingVersion?.status === "draft") {
                    handleUpdateVersion(
                      workingVersion.content_markdown,
                      schema
                    );
                  }
                }}
                readOnly={workingVersion?.status !== "draft"}
              />
            </TabsContent>

            <TabsContent value="preview" className="space-y-4">
              <ContractPreviewPane
                content={workingVersion?.content_markdown || ""}
                schema={workingVersion?.variables_schema || {}}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Version History Drawer */}
      <ContractVersionHistory
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        versions={template?.versions || []}
        currentVersionId={template?.current_version_id || null}
        onSelectVersion={(versionId) => {
          setSelectedVersionId(versionId);
          setHistoryOpen(false);
        }}
        onActivateVersion={handleActivateVersion}
      />
    </AppLayout>
  );
}
