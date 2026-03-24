import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Plus, FolderOpen, Loader2, Trash2 } from "lucide-react";

interface PortfolioManagerProps {
  onSelect?: (portfolioId: string | null) => void;
  selectedPortfolioId?: string | null;
}

export function PortfolioManager({ onSelect, selectedPortfolioId }: PortfolioManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

  // Fetch portfolios
  const { data: portfolios = [], isLoading: portfoliosLoading } = useQuery({
    queryKey: ["portfolios"],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolios" as any)
        .select("*")
        .order("name");
      return (data || []) as any[];
    },
  });

  // Fetch portfolio members
  const { data: members = [] } = useQuery({
    queryKey: ["portfolio-members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolio_members" as any)
        .select("*");
      return (data || []) as any[];
    },
  });

  // Fetch all active properties for the create dialog
  const { data: properties = [] } = useQuery({
    queryKey: ["portfolio-properties-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const autoSlug = slug.trim() || name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");

      const { data: user } = await supabase.auth.getUser();

      const { data: portfolio, error } = await supabase
        .from("property_portfolios" as any)
        .insert({ name, slug: autoSlug, owner_id: user?.user?.id } as any)
        .select()
        .single();

      if (error) throw error;

      // Add members
      if (selectedProperties.length > 0 && portfolio) {
        const memberRows = selectedProperties.map((pid) => ({
          portfolio_id: (portfolio as any).id,
          property_id: pid,
        }));
        await supabase.from("property_portfolio_members" as any).insert(memberRows as any);
      }

      return portfolio;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-members"] });
      toast({ title: "Portfolio created", description: `"${name}" has been created` });
      setOpen(false);
      setName("");
      setSlug("");
      setSelectedProperties([]);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("property_portfolios" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-members"] });
      if (onSelect) onSelect(null);
      toast({ title: "Portfolio deleted" });
    },
  });

  const toggleProperty = (propertyId: string) => {
    setSelectedProperties((prev) =>
      prev.includes(propertyId) ? prev.filter((id) => id !== propertyId) : [...prev, propertyId]
    );
  };

  const getMemberCount = (portfolioId: string) =>
    members.filter((m: any) => m.portfolio_id === portfolioId).length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Portfolio filter chips */}
      <Button
        variant={!selectedPortfolioId ? "default" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onSelect?.(null)}
      >
        All Properties
      </Button>

      {portfoliosLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        portfolios.map((p: any) => (
          <div key={p.id} className="flex items-center gap-0.5">
            <Button
              variant={selectedPortfolioId === p.id ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => onSelect?.(p.id)}
            >
              <FolderOpen className="h-3 w-3 mr-1" />
              {p.name}
              <Badge variant="secondary" className="ml-1 text-[9px] h-4 px-1">
                {getMemberCount(p.id)}
              </Badge>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(p.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))
      )}

      {/* Create portfolio dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            New Portfolio
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Portfolio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Portfolio Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Western Cape Collection"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Select Properties</Label>
              <ScrollArea className="h-48 border border-border rounded-md p-2">
                {properties.map((prop) => (
                  <label
                    key={prop.id}
                    className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedProperties.includes(prop.id)}
                      onCheckedChange={() => toggleProperty(prop.id)}
                    />
                    <span className="text-xs">{prop.name}</span>
                  </label>
                ))}
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground">
                {selectedProperties.length} selected
              </p>
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
              className="w-full"
              size="sm"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Create Portfolio
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
