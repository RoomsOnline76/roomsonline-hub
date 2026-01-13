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
  Sparkles,
  Copy,
  Trash2,
  Play,
  Eye,
  Settings,
  ArrowLeft,
  Layers,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import {
  useOnboardingWizards,
  useOnboardingWizard,
  useWizardMutations,
} from "@/hooks/useWizardConfig";
import { useSyncFieldRegistry } from "@/hooks/useFieldRegistry";
import { WizardStructureEditor } from "@/components/wizard-editor/WizardStructureEditor";
import { FieldRegistryBrowser } from "@/components/wizard-editor/FieldRegistryBrowser";
import { WizardPreviewPane } from "@/components/wizard-editor/WizardPreviewPane";

export default function AdminWizardEditor() {
  const { wizardId } = useParams<{ wizardId?: string }>();
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWizardName, setNewWizardName] = useState("");
  const [newWizardDescription, setNewWizardDescription] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [wizardToDelete, setWizardToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("structure");

  const { data: wizards, isLoading: wizardsLoading } = useOnboardingWizards();
  const { data: wizard, isLoading: wizardLoading } =
    useOnboardingWizard(wizardId);
  const { createWizard, deleteWizard, activateWizard } = useWizardMutations();
  const syncFieldRegistry = useSyncFieldRegistry();

  const handleCreateWizard = async () => {
    if (!newWizardName.trim()) return;

    const result = await createWizard.mutateAsync({
      name: newWizardName,
      description: newWizardDescription || undefined,
    });

    setCreateDialogOpen(false);
    setNewWizardName("");
    setNewWizardDescription("");
    navigate(`/admin/wizard-editor/${result.id}`);
  };

  const handleDeleteWizard = async () => {
    if (!wizardToDelete) return;
    await deleteWizard.mutateAsync(wizardToDelete);
    setDeleteDialogOpen(false);
    setWizardToDelete(null);
    if (wizardId === wizardToDelete) {
      navigate("/admin/wizard-editor");
    }
  };

  const handleDuplicateWizard = async (sourceWizardId: string) => {
    const sourceWizard = wizards?.find((w) => w.id === sourceWizardId);
    if (!sourceWizard) return;

    const result = await createWizard.mutateAsync({
      name: `${sourceWizard.name} (Copy)`,
      description: sourceWizard.description || undefined,
    });

    // TODO: Copy steps and fields from source wizard
    navigate(`/admin/wizard-editor/${result.id}`);
  };

  const handleActivateWizard = async (id: string) => {
    await activateWizard.mutateAsync(id);
  };

  // Wizard list view
  if (!wizardId) {
    return (
      <AppLayout>
        <div className="container mx-auto py-6 space-y-6">
          <PageHeader
            title="Onboarding Wizard Editor"
            subtitle="Configure wizard steps and fields"
          />

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => syncFieldRegistry.mutate()}
              disabled={syncFieldRegistry.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${
                  syncFieldRegistry.isPending ? "animate-spin" : ""
                }`}
              />
              Sync Field Registry
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Wizard
            </Button>
          </div>

          {wizardsLoading ? (
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
          ) : wizards?.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No wizards yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first onboarding wizard to get started.
                </p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Wizard
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {wizards?.map((wiz) => (
                <Card
                  key={wiz.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/admin/wizard-editor/${wiz.id}`)}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">{wiz.name}</CardTitle>
                      {wiz.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {wiz.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={wiz.is_active ? "default" : "secondary"}>
                      {wiz.is_active ? "Active" : "Draft"}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Created {format(new Date(wiz.created_at), "PP")}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      {!wiz.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActivateWizard(wiz.id);
                          }}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateWizard(wiz.id);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setWizardToDelete(wiz.id);
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

        {/* Create Wizard Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Onboarding Wizard</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Wizard Name</Label>
                <Input
                  value={newWizardName}
                  onChange={(e) => setNewWizardName(e.target.value)}
                  placeholder="e.g., Standard Property Setup"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea
                  value={newWizardDescription}
                  onChange={(e) => setNewWizardDescription(e.target.value)}
                  placeholder="Brief description of this wizard"
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
                onClick={handleCreateWizard}
                disabled={!newWizardName.trim() || createWizard.isPending}
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
              <AlertDialogTitle>Delete Wizard?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this wizard and all its steps and
                fields. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteWizard}
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

  // Wizard editor view
  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/wizard-editor")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <PageHeader
            title={wizard?.name || "Loading..."}
            subtitle={wizard?.description || "Edit wizard configuration"}
          />
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={wizard?.is_active ? "default" : "secondary"}>
              {wizard?.is_active ? "Active" : "Draft"}
            </Badge>
            {!wizard?.is_active && wizard?.id && (
              <Button
                variant="outline"
                onClick={() => handleActivateWizard(wizard.id)}
              >
                <Play className="h-4 w-4 mr-2" />
                Activate
              </Button>
            )}
          </div>
        </div>

        {wizardLoading ? (
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
              <TabsTrigger value="structure">
                <Layers className="h-4 w-4 mr-2" />
                Structure
              </TabsTrigger>
              <TabsTrigger value="fields">
                <Settings className="h-4 w-4 mr-2" />
                Field Registry
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="structure" className="space-y-4">
              {wizard && <WizardStructureEditor wizard={wizard} />}
            </TabsContent>

            <TabsContent value="fields" className="space-y-4">
              <FieldRegistryBrowser
                wizardId={wizardId}
                steps={wizard?.steps || []}
              />
            </TabsContent>

            <TabsContent value="preview" className="space-y-4">
              {wizard && <WizardPreviewPane wizard={wizard} />}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
