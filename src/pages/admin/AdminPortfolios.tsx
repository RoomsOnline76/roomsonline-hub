import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Copy, ChevronDown, ChevronRight, FolderOpen, Loader2, Building2, ExternalLink, Upload, X } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";
import { format } from "date-fns";
import { GoogleFontPicker } from "@/components/property/GoogleFontPicker";

interface PortfolioBranding {
  primary_color?: string;
  secondary_color?: string;
  font_color?: string;
  logo_url?: string;
  heading_font?: string;
  body_font?: string;
}

interface Portfolio {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  created_at: string;
  metadata?: { branding?: PortfolioBranding } | null;
}

interface PortfolioMember {
  portfolio_id: string;
  property_id: string;
}

interface Property {
  id: string;
  name: string;
  owner_email: string | null;
  city: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_font_color: string | null;
  brand_logo_url: string | null;
  brand_heading_font: string | null;
  brand_body_font: string | null;
}

export default function AdminPortfolios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPortfolio, setEditPortfolio] = useState<Portfolio | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [selectedProps, setSelectedProps] = useState<string[]>([]);
  const [propertySearch, setPropertySearch] = useState("");
  const [brandPrimary, setBrandPrimary] = useState("#2563eb");
  const [brandSecondary, setBrandSecondary] = useState("#1e40af");
  const [brandFontColor, setBrandFontColor] = useState("#333333");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandHeadingFont, setBrandHeadingFont] = useState("");
  const [brandBodyFont, setBrandBodyFont] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ["admin-portfolios"],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolios" as any)
        .select("*")
        .order("name");
      return (data || []) as unknown as Portfolio[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["admin-portfolio-members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolio_members" as any)
        .select("*");
      return (data || []) as unknown as PortfolioMember[];
    },
  });

  const { data: properties = [] } = useQuery({
    queryKey: ["admin-portfolios-properties"],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, owner_email, city")
        .eq("is_active", true)
        .order("name");
      return (data || []) as Property[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-portfolios"] });
    queryClient.invalidateQueries({ queryKey: ["admin-portfolio-members"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const autoSlug = formSlug.trim() || formName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
      const branding: PortfolioBranding = {
        primary_color: brandPrimary, secondary_color: brandSecondary, font_color: brandFontColor,
        logo_url: brandLogoUrl || undefined, heading_font: brandHeadingFont || undefined, body_font: brandBodyFont || undefined,
      };
      const { data: user } = await supabase.auth.getUser();
      const { data: portfolio, error } = await supabase
        .from("property_portfolios" as any)
        .insert({ name: formName, slug: autoSlug, owner_id: user?.user?.id, metadata: { branding } } as any)
        .select()
        .single();
      if (error) throw error;
      if (selectedProps.length > 0 && portfolio) {
        const rows = selectedProps.map((pid) => ({ portfolio_id: (portfolio as any).id, property_id: pid }));
        await supabase.from("property_portfolio_members" as any).insert(rows as any);
      }
      return portfolio;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Portfolio created" });
      resetForm();
      setCreateOpen(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editPortfolio) return;
      const autoSlug = formSlug.trim() || formName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
      const branding: PortfolioBranding = {
        primary_color: brandPrimary, secondary_color: brandSecondary, font_color: brandFontColor,
        logo_url: brandLogoUrl || undefined, heading_font: brandHeadingFont || undefined, body_font: brandBodyFont || undefined,
      };
      const existingMeta = editPortfolio.metadata || {};
      const { error } = await supabase
        .from("property_portfolios" as any)
        .update({ name: formName, slug: autoSlug, metadata: { ...existingMeta, branding } } as any)
        .eq("id", editPortfolio.id);
      if (error) throw error;
      // Sync members: delete all then re-insert
      await supabase.from("property_portfolio_members" as any).delete().eq("portfolio_id", editPortfolio.id);
      if (selectedProps.length > 0) {
        const rows = selectedProps.map((pid) => ({ portfolio_id: editPortfolio.id, property_id: pid }));
        await supabase.from("property_portfolio_members" as any).insert(rows as any);
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Portfolio updated" });
      resetForm();
      setEditPortfolio(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("property_portfolios" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Portfolio deleted" });
      setDeleteId(null);
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormSlug("");
    setSelectedProps([]);
    setPropertySearch("");
    setBrandPrimary("#2563eb");
    setBrandSecondary("#1e40af");
    setBrandFontColor("#333333");
    setBrandLogoUrl("");
    setBrandHeadingFont("");
    setBrandBodyFont("");
  };

  const openEdit = (p: Portfolio) => {
    setFormName(p.name);
    setFormSlug(p.slug || "");
    setSelectedProps(members.filter((m) => m.portfolio_id === p.id).map((m) => m.property_id));
    const b = p.metadata?.branding;
    setBrandPrimary(b?.primary_color || "#2563eb");
    setBrandSecondary(b?.secondary_color || "#1e40af");
    setBrandFontColor(b?.font_color || "#333333");
    setBrandLogoUrl(b?.logo_url || "");
    setBrandHeadingFont(b?.heading_font || "");
    setBrandBodyFont(b?.body_font || "");
    setEditPortfolio(p);
  };

  const toggleProp = (id: string) => {
    setSelectedProps((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const getMemberCount = (pid: string) => members.filter((m) => m.portfolio_id === pid).length;
  const getMemberProperties = (pid: string) => {
    const memberPropIds = members.filter((m) => m.portfolio_id === pid).map((m) => m.property_id);
    return properties.filter((p) => memberPropIds.includes(p.id));
  };

  const filteredProperties = properties.filter(
    (p) =>
      p.name.toLowerCase().includes(propertySearch.toLowerCase()) ||
      (p.owner_email || "").toLowerCase().includes(propertySearch.toLowerCase()) ||
      (p.city || "").toLowerCase().includes(propertySearch.toLowerCase())
  );

  const copySnippet = (slug: string) => {
    const snippet = `<div data-rolos-portfolio="${slug}"></div>\n<script src="${window.location.origin}/rol-embed.js" async></script>`;
    navigator.clipboard.writeText(snippet);
    toast({ title: "Snippet copied to clipboard" });
  };
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `portfolio-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("portfolio-logos").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("portfolio-logos").getPublicUrl(fileName);
      setBrandLogoUrl(urlData.publicUrl);
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const renderPropertyPicker = () => (
    <div className="space-y-2">
      <Label className="text-xs">Properties</Label>
      <Input
        placeholder="Search by name, owner, or city…"
        value={propertySearch}
        onChange={(e) => setPropertySearch(e.target.value)}
        className="text-sm"
      />
      <ScrollArea className="h-56 border border-border rounded-md p-2">
        {filteredProperties.map((prop) => (
          <label
            key={prop.id}
            className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer"
          >
            <Checkbox
              checked={selectedProps.includes(prop.id)}
              onCheckedChange={() => toggleProp(prop.id)}
            />
            <div className="flex flex-col">
              <span className="text-xs font-medium">{prop.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {prop.owner_email || "No owner"} {prop.city ? `· ${prop.city}` : ""}
              </span>
            </div>
          </label>
        ))}
        {filteredProperties.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">No properties found</p>
        )}
      </ScrollArea>
      <p className="text-[10px] text-muted-foreground">{selectedProps.length} selected</p>
    </div>
  );

  const renderFormFields = () => (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs">Portfolio Name</Label>
        <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Western Cape Collection" className="text-sm" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Slug (for embed URL)</Label>
        <Input
          value={formSlug}
          onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="auto-generated from name"
          className="text-sm font-mono"
        />
        <p className="text-[10px] text-muted-foreground">Used in embed URLs: /embed/portfolio/{formSlug || "auto"}</p>
      </div>

      {/* Branding Section */}
      <div className="space-y-2 border-t border-border pt-3">
        <Label className="text-xs font-semibold">Branding</Label>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Logo</Label>
          <div className="flex gap-2 items-center">
            <Input value={brandLogoUrl} onChange={(e) => setBrandLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" className="text-sm flex-1" />
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} />
            <Button type="button" variant="outline" size="sm" className="h-9 text-xs shrink-0" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}>
              {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Upload
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Primary</Label>
            <div className="flex gap-1.5 items-center">
              <input type="color" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} className="h-7 w-7 rounded border border-border cursor-pointer" />
              <Input value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} className="text-xs font-mono h-7 flex-1" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Secondary</Label>
            <div className="flex gap-1.5 items-center">
              <input type="color" value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} className="h-7 w-7 rounded border border-border cursor-pointer" />
              <Input value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} className="text-xs font-mono h-7 flex-1" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Font Color</Label>
            <div className="flex gap-1.5 items-center">
              <input type="color" value={brandFontColor} onChange={(e) => setBrandFontColor(e.target.value)} className="h-7 w-7 rounded border border-border cursor-pointer" />
              <Input value={brandFontColor} onChange={(e) => setBrandFontColor(e.target.value)} className="text-xs font-mono h-7 flex-1" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Heading Font</Label>
            <Input value={brandHeadingFont} onChange={(e) => setBrandHeadingFont(e.target.value)} placeholder="e.g. Playfair Display" className="text-xs h-7" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Body Font</Label>
            <Input value={brandBodyFont} onChange={(e) => setBrandBodyFont(e.target.value)} placeholder="e.g. Lato" className="text-xs h-7" />
          </div>
        </div>
        {brandLogoUrl && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border">
            <img src={brandLogoUrl} alt="Logo preview" className="h-8 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <span className="text-[10px] text-muted-foreground flex-1">Logo preview</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setBrandLogoUrl("")}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {renderPropertyPicker()}
    </div>
  );

  return (
    <AppLayout>
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Portfolio Management"
        subtitle="Cross-owner property groupings"
        actions={
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Portfolio
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Portfolio</DialogTitle>
              </DialogHeader>
              {renderFormFields()}
              <DialogFooter>
                <Button onClick={() => createMutation.mutate()} disabled={!formName.trim() || createMutation.isPending} size="sm">
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No portfolios yet. Create one to group properties across owners.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-center">Properties</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolios.map((p) => {
                const expanded = expandedId === p.id;
                const memberProps = getMemberProperties(p.id);
                return (
                  <>
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => setExpandedId(expanded ? null : p.id)}>
                      <TableCell className="w-8">
                        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">{p.slug}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{getMemberCount(p.id)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`${PUBLIC_DOMAIN}/embed/portfolio/${p.slug}`, '_blank')}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copySnippet(p.slug)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow key={`${p.id}-details`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          {memberProps.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No properties in this portfolio</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {memberProps.map((prop) => (
                                <div key={prop.id} className="flex items-center gap-2 p-2 rounded-md bg-background border border-border">
                                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate">{prop.name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {prop.owner_email || "No owner"} {prop.city ? `· ${prop.city}` : ""}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editPortfolio} onOpenChange={(o) => { if (!o) { setEditPortfolio(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Portfolio</DialogTitle>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button onClick={() => updateMutation.mutate()} disabled={!formName.trim() || updateMutation.isPending} size="sm">
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Portfolio?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the portfolio and all member associations. Properties themselves won't be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </AppLayout>
  );
}
