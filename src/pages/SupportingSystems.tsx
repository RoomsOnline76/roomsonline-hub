import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, ExternalLink, Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AddSupportingSystemModal } from "@/components/integrations/AddSupportingSystemModal";
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

interface SupportingSystem {
  id: string;
  system_name: string;
  system_url: string | null;
  login_username: string | null;
  login_password_encrypted: string | null;
  system_function: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  pms: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  payment: "bg-green-500/10 text-green-500 border-green-500/20",
  email: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  analytics: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  hosting: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  general: "bg-muted text-muted-foreground border-muted",
};

export default function SupportingSystems() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<SupportingSystem | null>(null);
  const [deletingSystem, setDeletingSystem] = useState<SupportingSystem | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: systems, isLoading } = useQuery({
    queryKey: ["supporting-systems"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supporting_systems")
        .select("*")
        .order("category", { ascending: true })
        .order("system_name", { ascending: true });

      if (error) throw error;
      return data as SupportingSystem[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("supporting_systems")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supporting-systems"] });
      toast.success("System deleted");
      setDeletingSystem(null);
    },
    onError: (error) => {
      toast.error("Failed to delete system: " + error.message);
    },
  });

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const groupedSystems = systems?.reduce((acc, system) => {
    const category = system.category || "general";
    if (!acc[category]) acc[category] = [];
    acc[category].push(system);
    return acc;
  }, {} as Record<string, SupportingSystem[]>);

  return (
    <AppLayout>
      <PageHeader
        title="Supporting Systems"
        subtitle="Manage external tools and integrations used by the team"
        actions={
          <Button onClick={() => setIsAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add System
          </Button>
        }
      />

      <div className="p-6 space-y-8">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-3/4 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !systems?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No supporting systems added yet</p>
              <Button onClick={() => setIsAddModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First System
              </Button>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedSystems || {}).map(([category, categorySystems]) => (
            <div key={category}>
              <h3 className="text-lg font-semibold capitalize mb-4">{category}</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categorySystems.map((system) => (
                  <Card key={system.id} className={!system.is_active ? "opacity-60" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            {system.system_name}
                            {!system.is_active && (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                          </CardTitle>
                          {system.system_function && (
                            <CardDescription className="text-sm">
                              {system.system_function}
                            </CardDescription>
                          )}
                        </div>
                        <Badge 
                          variant="outline" 
                          className={CATEGORY_COLORS[system.category || "general"]}
                        >
                          {system.category || "general"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {system.system_url && (
                        <div className="flex items-center gap-2">
                          <a
                            href={system.system_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
                          >
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{system.system_url}</span>
                          </a>
                        </div>
                      )}

                      {system.login_username && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Username:</span>
                          <div className="flex items-center gap-1">
                            <code className="bg-muted px-2 py-0.5 rounded text-xs">
                              {system.login_username}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(system.login_username!, "Username")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {system.login_password_encrypted && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Password:</span>
                          <div className="flex items-center gap-1">
                            <code className="bg-muted px-2 py-0.5 rounded text-xs">
                              {visiblePasswords.has(system.id) ? "••••••••" : "••••••••"}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => togglePasswordVisibility(system.id)}
                            >
                              {visiblePasswords.has(system.id) ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1"
                          onClick={() => setEditingSystem(system)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-destructive hover:text-destructive"
                          onClick={() => setDeletingSystem(system)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <AddSupportingSystemModal
        open={isAddModalOpen || !!editingSystem}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddModalOpen(false);
            setEditingSystem(null);
          }
        }}
        editingSystem={editingSystem}
      />

      <AlertDialog open={!!deletingSystem} onOpenChange={() => setDeletingSystem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingSystem?.system_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The system entry will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingSystem && deleteMutation.mutate(deletingSystem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
