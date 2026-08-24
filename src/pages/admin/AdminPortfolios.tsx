import React from "react";
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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Pencil,
  Copy,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Loader2,
  Building2,
  ExternalLink,
  Upload,
  X,
  Star,
  MapPin,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { GooglePlaceSearchDialog } from "@/components/integrations/GooglePlaceSearchDialog";
import { contrastRatio } from "@/lib/brandOverride";
import { PUBLIC_DOMAIN } from "@/lib/config";
import { format } from "date-fns";
import { GoogleFontPicker } from "@/components/property/GoogleFontPicker";
import { RevenueShareSection } from "@/components/portfolio/RevenueShareSection";
import { PortfolioPaymentProviderCard } from "@/components/portfolio/PortfolioPaymentProviderCard";
import { BrandReadabilityPanel } from "@/components/branding/BrandReadabilityPanel";

interface PortfolioBranding {
  primary_color?: string;
  secondary_color?: string;
  font_color?: string;
  logo_url?: string;
  heading_font?: string;
  body_font?: string;
  heading_text_color?: string;
  body_text_color?: string;
  muted_text_color?: string;
  light_bg_color?: string;
  dark_bg_color?: string;
  hero_video_url?: string;
  pinned_featured_ids?: string[];
  allow_property_brand_override?: boolean;
}

interface Portfolio {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  owner_email?: string | null;
  created_at: string;
  metadata?: { branding?: PortfolioBranding } | null;
  aggregator_billing_mode?: "none" | "monthly" | "once_off" | null;
  aggregator_monthly_fee?: number | null;
  aggregator_setup_fee?: number | null;
  aggregator_activated_at?: string | null;
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
  amenities: any;
  payment_provider_override?: boolean | null;
}

// Review platform IDs per property: { propertyId: { google_place_id, tripadvisor_id } }
type ReviewIds = Record<string, { google_place_id: string; tripadvisor_id: string }>;

export default function AdminPortfolios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPortfolio, setEditPortfolio] = useState<Portfolio | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formOwnerEmail, setFormOwnerEmail] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [selectedProps, setSelectedProps] = useState<string[]>([]);
  const [propertySearch, setPropertySearch] = useState("");
  const [placeSearchFor, setPlaceSearchFor] = useState<{ pid: string; query: string } | null>(null);
  const [brandPrimary, setBrandPrimary] = useState("#2563eb");
  const [brandSecondary, setBrandSecondary] = useState("#1e40af");
  const [brandFontColor, setBrandFontColor] = useState("#333333");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandHeadingFont, setBrandHeadingFont] = useState("");
  const [brandBodyFont, setBrandBodyFont] = useState("");
  const [brandHeadingTextColor, setBrandHeadingTextColor] = useState("");
  const [brandBodyTextColor, setBrandBodyTextColor] = useState("");
  const [brandMutedTextColor, setBrandMutedTextColor] = useState("");
  const [brandLightBgColor, setBrandLightBgColor] = useState("");
  const [brandDarkBgColor, setBrandDarkBgColor] = useState("");
  const [brandHeroVideoUrl, setBrandHeroVideoUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [heroVideoUploading, setHeroVideoUploading] = useState(false);
  const [pinnedFeaturedIds, setPinnedFeaturedIds] = useState<string[]>([]);
  const [allowPropertyBrandOverride, setAllowPropertyBrandOverride] = useState(false);
  const [reviewIds, setReviewIds] = useState<ReviewIds>({});
  const [aggMode, setAggMode] = useState<"none" | "monthly" | "once_off">("none");
  const [aggMonthly, setAggMonthly] = useState<string>("");
  const [aggSetup, setAggSetup] = useState<string>("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroVideoInputRef = useRef<HTMLInputElement>(null);

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
      const { data } = await supabase.from("property_portfolio_members" as any).select("*");
      return (data || []) as unknown as PortfolioMember[];
    },
  });

  const { data: properties = [] } = useQuery({
    queryKey: ["admin-portfolios-properties"],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select(
          "id, name, owner_email, city, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url, brand_heading_font, brand_body_font, amenities, payment_provider_override",
        )
        .eq("is_active", true)
        .order("name");
      return (data || []) as Property[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-portfolios"] });
    queryClient.invalidateQueries({ queryKey: ["admin-portfolio-members"] });
    queryClient.invalidateQueries({ queryKey: ["admin-portfolios-properties"] });
  };

  // Save review platform IDs to each property's amenities.external_ids
  const saveReviewIds = async () => {
    const updates = Object.entries(reviewIds).filter(([pid]) => selectedProps.includes(pid));
    for (const [pid, ids] of updates) {
      const prop = properties.find((p) => p.id === pid);
      const existingAmenities = prop?.amenities || {};
      const existingExtIds = existingAmenities.external_ids || {};
      const newExtIds = {
        ...existingExtIds,
        google_place_id: ids.google_place_id || existingExtIds.google_place_id || null,
        tripadvisor_id: ids.tripadvisor_id || existingExtIds.tripadvisor_id || null,
      };
      await supabase
        .from("properties")
        .update({
          amenities: { ...existingAmenities, external_ids: newExtIds },
        })
        .eq("id", pid);
    }
  };
  const createMutation = useMutation({
    mutationFn: async () => {
      const autoSlug =
        formSlug.trim() ||
        formName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-");
      const branding: PortfolioBranding = {
        primary_color: brandPrimary,
        secondary_color: brandSecondary,
        font_color: brandFontColor,
        logo_url: brandLogoUrl || undefined,
        heading_font: brandHeadingFont || undefined,
        body_font: brandBodyFont || undefined,
        heading_text_color: brandHeadingTextColor || undefined,
        body_text_color: brandBodyTextColor || undefined,
        muted_text_color: brandMutedTextColor || undefined,
        light_bg_color: brandLightBgColor || undefined,
        dark_bg_color: brandDarkBgColor || undefined,
        hero_video_url: brandHeroVideoUrl || undefined,
        pinned_featured_ids: pinnedFeaturedIds.length > 0 ? pinnedFeaturedIds : undefined,
        allow_property_brand_override: allowPropertyBrandOverride || undefined,
      };
      const { data: user } = await supabase.auth.getUser();
      const aggPayload = {
        aggregator_billing_mode: aggMode,
        aggregator_monthly_fee: aggMode === "monthly" ? (aggMonthly === "" ? null : Number(aggMonthly)) : null,
        aggregator_setup_fee: aggMode === "once_off" ? (aggSetup === "" ? null : Number(aggSetup)) : null,
      };
      const { data: portfolio, error } = await supabase
        .from("property_portfolios" as any)
        .insert({
          name: formName,
          owner_email: formOwnerEmail.trim() || null,
          slug: autoSlug,
          owner_id: user?.user?.id,
          metadata: { branding },
          ...aggPayload,
        } as any)
        .select()
        .single();
      if (error) throw error;
      if (selectedProps.length > 0 && portfolio) {
        const rows = selectedProps.map((pid) => ({ portfolio_id: (portfolio as any).id, property_id: pid }));
        await supabase.from("property_portfolio_members" as any).insert(rows as any);
      }
      await saveReviewIds();
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
      const autoSlug =
        formSlug.trim() ||
        formName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-");
      const branding: PortfolioBranding = {
        primary_color: brandPrimary,
        secondary_color: brandSecondary,
        font_color: brandFontColor,
        logo_url: brandLogoUrl || undefined,
        heading_font: brandHeadingFont || undefined,
        body_font: brandBodyFont || undefined,
        heading_text_color: brandHeadingTextColor || undefined,
        body_text_color: brandBodyTextColor || undefined,
        muted_text_color: brandMutedTextColor || undefined,
        light_bg_color: brandLightBgColor || undefined,
        dark_bg_color: brandDarkBgColor || undefined,
        hero_video_url: brandHeroVideoUrl || undefined,
        pinned_featured_ids: pinnedFeaturedIds.length > 0 ? pinnedFeaturedIds : undefined,
        allow_property_brand_override: allowPropertyBrandOverride || undefined,
      };
      const existingMeta = editPortfolio.metadata || {};
      const aggPayload = {
        aggregator_billing_mode: aggMode,
        aggregator_monthly_fee: aggMode === "monthly" ? (aggMonthly === "" ? null : Number(aggMonthly)) : null,
        aggregator_setup_fee: aggMode === "once_off" ? (aggSetup === "" ? null : Number(aggSetup)) : null,
      };
      const { error } = await supabase
        .from("property_portfolios" as any)
        .update({ name: formName, owner_email: formOwnerEmail.trim() || null, slug: autoSlug, metadata: { ...existingMeta, branding }, ...aggPayload } as any)
        .eq("id", editPortfolio.id);
      if (error) throw error;
      // Sync members: delete all then re-insert
      await supabase
        .from("property_portfolio_members" as any)
        .delete()
        .eq("portfolio_id", editPortfolio.id);
      if (selectedProps.length > 0) {
        const rows = selectedProps.map((pid) => ({ portfolio_id: editPortfolio.id, property_id: pid }));
        await supabase.from("property_portfolio_members" as any).insert(rows as any);
      }
      await saveReviewIds();
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
      const { error } = await supabase
        .from("property_portfolios" as any)
        .delete()
        .eq("id", id);
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
    setFormOwnerEmail("");
    setFormSlug("");
    setSelectedProps([]);
    setPropertySearch("");
    setBrandPrimary("#2563eb");
    setBrandSecondary("#1e40af");
    setBrandFontColor("#333333");
    setBrandLogoUrl("");
    setBrandHeadingFont("");
    setBrandBodyFont("");
    setBrandHeadingTextColor("");
    setBrandBodyTextColor("");
    setBrandMutedTextColor("");
    setBrandLightBgColor("");
    setBrandDarkBgColor("");
    setBrandHeroVideoUrl("");
    setPinnedFeaturedIds([]);
    setAllowPropertyBrandOverride(false);
    setReviewIds({});
    setAggMode("none");
    setAggMonthly("");
    setAggSetup("");
  };

  const openEdit = (p: Portfolio) => {
    setFormName(p.name);
    setFormOwnerEmail(p.owner_email || "");
    setFormSlug(p.slug || "");
    const memberPropIds = members.filter((m) => m.portfolio_id === p.id).map((m) => m.property_id);
    setSelectedProps(memberPropIds);
    const b = p.metadata?.branding;
    setBrandPrimary(b?.primary_color || "#2563eb");
    setBrandSecondary(b?.secondary_color || "#1e40af");
    setBrandFontColor(b?.font_color || "#333333");
    setBrandLogoUrl(b?.logo_url || "");
    setBrandHeadingFont(b?.heading_font || "");
    setBrandBodyFont(b?.body_font || "");
    setBrandHeadingTextColor(b?.heading_text_color || "");
    setBrandBodyTextColor(b?.body_text_color || "");
    setBrandMutedTextColor(b?.muted_text_color || "");
    setBrandLightBgColor(b?.light_bg_color || "");
    setBrandDarkBgColor(b?.dark_bg_color || "");
    setBrandHeroVideoUrl(b?.hero_video_url || "");
    setPinnedFeaturedIds(b?.pinned_featured_ids || []);
    setAllowPropertyBrandOverride(b?.allow_property_brand_override || false);
    setAggMode((p.aggregator_billing_mode as any) || "none");
    setAggMonthly(p.aggregator_monthly_fee != null ? String(p.aggregator_monthly_fee) : "");
    setAggSetup(p.aggregator_setup_fee != null ? String(p.aggregator_setup_fee) : "");
    // Populate review IDs from property amenities
    const ids: ReviewIds = {};
    memberPropIds.forEach((pid) => {
      const prop = properties.find((pr) => pr.id === pid);
      const ext = prop?.amenities?.external_ids || {};
      ids[pid] = { google_place_id: ext.google_place_id || "", tripadvisor_id: ext.tripadvisor_id || "" };
    });
    setReviewIds(ids);
    setEditPortfolio(p);
  };

  // Auto-populate branding from first selected property if portfolio branding fields are at defaults
  const maybeInheritBranding = (newSelectedProps: string[]) => {
    if (newSelectedProps.length === 0) return;
    const firstProp = properties.find((p) => p.id === newSelectedProps[0]);
    if (!firstProp) return;
    // Only inherit if field is still at default (empty or default hex)
    if (brandPrimary === "#2563eb" && firstProp.brand_primary_color) setBrandPrimary(firstProp.brand_primary_color);
    if (brandSecondary === "#1e40af" && firstProp.brand_secondary_color)
      setBrandSecondary(firstProp.brand_secondary_color);
    if (brandFontColor === "#333333" && firstProp.brand_font_color) setBrandFontColor(firstProp.brand_font_color);
    if (!brandLogoUrl && firstProp.brand_logo_url) setBrandLogoUrl(firstProp.brand_logo_url);
    if (!brandHeadingFont && firstProp.brand_heading_font) setBrandHeadingFont(firstProp.brand_heading_font);
    if (!brandBodyFont && firstProp.brand_body_font) setBrandBodyFont(firstProp.brand_body_font);
  };

  const toggleProp = (id: string) => {
    setSelectedProps((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!prev.includes(id)) {
        maybeInheritBranding(next);
        // Initialize review IDs from property data
        const prop = properties.find((p) => p.id === id);
        const ext = prop?.amenities?.external_ids || {};
        setReviewIds((r) => ({
          ...r,
          [id]: { google_place_id: ext.google_place_id || "", tripadvisor_id: ext.tripadvisor_id || "" },
        }));
      }
      return next;
    });
  };

  const getMemberCount = (pid: string) => {
    const memberPropIds = members.filter((m) => m.portfolio_id === pid).map((m) => m.property_id);
    const activePropertyIds = new Set(properties.map((p) => p.id));
    return memberPropIds.filter((id) => activePropertyIds.has(id)).length;
  };
  const getMemberProperties = (pid: string) => {
    const memberPropIds = members.filter((m) => m.portfolio_id === pid).map((m) => m.property_id);
    return properties.filter((p) => memberPropIds.includes(p.id));
  };

  // Owner emails present on the currently selected member properties — a portfolio can span
  // several different owners, so the admin picks which one represents the portfolio.
  const ownerEmailCandidates = Array.from(
    new Set(
      selectedProps
        .map((pid) => properties.find((p) => p.id === pid)?.owner_email)
        .filter((e): e is string => !!e && e.trim().length > 0),
    ),
  );

  const filteredProperties = properties.filter(
    (p) =>
      p.name.toLowerCase().includes(propertySearch.toLowerCase()) ||
      (p.owner_email || "").toLowerCase().includes(propertySearch.toLowerCase()) ||
      (p.city || "").toLowerCase().includes(propertySearch.toLowerCase()),
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

  const handleHeroVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeroVideoUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const fileName = `portfolio-hero-${Date.now()}-${safeName}`;
      const { data: uploadData, error } = await supabase.storage
        .from("property-images")
        .upload(fileName, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("property-images").getPublicUrl(uploadData.path);
      setBrandHeroVideoUrl(urlData.publicUrl);
      toast({ title: "Hero video uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setHeroVideoUploading(false);
      if (heroVideoInputRef.current) heroVideoInputRef.current.value = "";
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
          <label key={prop.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer">
            <Checkbox checked={selectedProps.includes(prop.id)} onCheckedChange={() => toggleProp(prop.id)} />
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
        <Input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Western Cape Collection"
          className="text-sm"
        />
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

      <div className="space-y-1">
        <Label className="text-xs">Portfolio owner email</Label>
        <Input
          value={formOwnerEmail}
          onChange={(e) => setFormOwnerEmail(e.target.value)}
          placeholder="owner@example.com"
          className="text-sm"
          type="email"
        />
        <p className="text-[10px] text-muted-foreground">
          Used as the portfolio contact and by the Rentals United sub-user (Step A). Properties in a
          portfolio may have different owners — copy the one that should represent the portfolio.
        </p>
        {ownerEmailCandidates.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {ownerEmailCandidates.map((email) => (
              <Button
                key={email}
                type="button"
                size="sm"
                variant={formOwnerEmail === email ? "secondary" : "outline"}
                className="h-6 text-[10px]"
                onClick={() => setFormOwnerEmail(email)}
              >
                {email}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Branding Section */}
      <div className="space-y-2 border-t border-border pt-3">
        <Label className="text-xs font-semibold">Branding</Label>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Logo</Label>
          <div className="flex gap-2 items-center">
            <Input
              value={brandLogoUrl}
              onChange={(e) => setBrandLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="text-sm flex-1"
            />
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs shrink-0"
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
            >
              {logoUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              Upload
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Primary</Label>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={brandPrimary}
                onChange={(e) => setBrandPrimary(e.target.value)}
                className="h-7 w-7 rounded border border-border cursor-pointer"
              />
              <Input
                value={brandPrimary}
                onChange={(e) => setBrandPrimary(e.target.value)}
                className="text-xs font-mono h-7 flex-1"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Secondary</Label>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={brandSecondary}
                onChange={(e) => setBrandSecondary(e.target.value)}
                className="h-7 w-7 rounded border border-border cursor-pointer"
              />
              <Input
                value={brandSecondary}
                onChange={(e) => setBrandSecondary(e.target.value)}
                className="text-xs font-mono h-7 flex-1"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Font Color</Label>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={brandFontColor}
                onChange={(e) => setBrandFontColor(e.target.value)}
                className="h-7 w-7 rounded border border-border cursor-pointer"
              />
              <Input
                value={brandFontColor}
                onChange={(e) => setBrandFontColor(e.target.value)}
                className="text-xs font-mono h-7 flex-1"
              />
            </div>
          </div>
        </div>
        <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider pt-1">
          Text Colours
        </Label>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Heading Text</Label>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={brandHeadingTextColor || "#000000"}
                onChange={(e) => setBrandHeadingTextColor(e.target.value)}
                className="h-7 w-7 rounded border border-border cursor-pointer"
              />
              <Input
                value={brandHeadingTextColor}
                onChange={(e) => setBrandHeadingTextColor(e.target.value)}
                placeholder="#"
                className="text-xs font-mono h-7 flex-1"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Body Text</Label>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={brandBodyTextColor || "#000000"}
                onChange={(e) => setBrandBodyTextColor(e.target.value)}
                className="h-7 w-7 rounded border border-border cursor-pointer"
              />
              <Input
                value={brandBodyTextColor}
                onChange={(e) => setBrandBodyTextColor(e.target.value)}
                placeholder="#"
                className="text-xs font-mono h-7 flex-1"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Muted / Links</Label>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={brandMutedTextColor || "#000000"}
                onChange={(e) => setBrandMutedTextColor(e.target.value)}
                className="h-7 w-7 rounded border border-border cursor-pointer"
              />
              <Input
                value={brandMutedTextColor}
                onChange={(e) => setBrandMutedTextColor(e.target.value)}
                placeholder="#"
                className="text-xs font-mono h-7 flex-1"
              />
            </div>
          </div>
        </div>
        <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider pt-1">
          Background Colours
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Light BG / Cards</Label>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={brandLightBgColor || "#ffffff"}
                onChange={(e) => setBrandLightBgColor(e.target.value)}
                className="h-7 w-7 rounded border border-border cursor-pointer"
              />
              <Input
                value={brandLightBgColor}
                onChange={(e) => setBrandLightBgColor(e.target.value)}
                placeholder="#"
                className="text-xs font-mono h-7 flex-1"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Dark BG Accent</Label>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={brandDarkBgColor || "#000000"}
                onChange={(e) => setBrandDarkBgColor(e.target.value)}
                className="h-7 w-7 rounded border border-border cursor-pointer"
              />
              <Input
                value={brandDarkBgColor}
                onChange={(e) => setBrandDarkBgColor(e.target.value)}
                placeholder="#"
                className="text-xs font-mono h-7 flex-1"
              />
            </div>
          </div>
        </div>
        <div className="space-y-1 pt-1">
          <Label className="text-[10px] text-muted-foreground">Hero Video</Label>
          <div className="flex gap-2 items-center">
            <Input
              value={brandHeroVideoUrl}
              onChange={(e) => setBrandHeroVideoUrl(e.target.value)}
              placeholder="YouTube or direct video URL"
              className="text-xs flex-1"
            />
            <input
              ref={heroVideoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleHeroVideoUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs shrink-0"
              disabled={heroVideoUploading}
              onClick={() => heroVideoInputRef.current?.click()}
            >
              {heroVideoUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              Upload
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Upload a video file or paste a YouTube/direct video URL.</p>
        </div>

        {/* Readability examples + auto-correct */}
        {brandPrimary && (
          <BrandReadabilityPanel
            entityLabel="portfolio"
            palette={{
              brand_primary_color: brandPrimary,
              brand_secondary_color: brandSecondary,
              brand_font_color: brandFontColor,
              brand_heading_text_color: brandHeadingTextColor,
              brand_body_text_color: brandBodyTextColor,
              brand_muted_text_color: brandMutedTextColor,
              brand_light_bg_color: brandLightBgColor,
              brand_dark_bg_color: brandDarkBgColor,
            }}
            onApply={(patch) => {
              if (patch.brand_primary_color) setBrandPrimary(patch.brand_primary_color);
              if (patch.brand_secondary_color) setBrandSecondary(patch.brand_secondary_color);
              if (patch.brand_font_color) setBrandFontColor(patch.brand_font_color);
              if (patch.brand_heading_text_color) setBrandHeadingTextColor(patch.brand_heading_text_color);
              if (patch.brand_body_text_color) setBrandBodyTextColor(patch.brand_body_text_color);
              if (patch.brand_muted_text_color) setBrandMutedTextColor(patch.brand_muted_text_color);
              if (patch.brand_light_bg_color) setBrandLightBgColor(patch.brand_light_bg_color);
              if (patch.brand_dark_bg_color) setBrandDarkBgColor(patch.brand_dark_bg_color);
            }}
          />
        )}

        {/* Property Brand Override Toggle */}
        <div className="flex items-center justify-between gap-3 pt-2 pb-1 px-1 rounded-lg border border-border bg-muted/20 p-3">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">Allow property branding override</Label>
            <p className="text-[10px] text-muted-foreground leading-snug">
              When enabled, each property's own brand colours replace the portfolio brand once selected. When off
              (default), portfolio branding carries through to checkout.
            </p>
          </div>
          <Switch checked={allowPropertyBrandOverride} onCheckedChange={setAllowPropertyBrandOverride} />
        </div>

        {/* Featured Pick Pinning */}
        {selectedProps.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              Featured Pick
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Pin one or more properties as "Featured Pick" on the portfolio page. If multiple are pinned, one is
              randomly shown. Leave empty for TOBI-selected.
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-border p-2 bg-muted/20">
              {selectedProps.map((pid) => {
                const prop = properties.find((p) => p.id === pid);
                if (!prop) return null;
                const isPinned = pinnedFeaturedIds.includes(pid);
                return (
                  <div key={pid} className="flex items-center gap-2 py-0.5">
                    <Checkbox
                      checked={isPinned}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPinnedFeaturedIds((prev) => [...prev, pid]);
                        } else {
                          setPinnedFeaturedIds((prev) => prev.filter((id) => id !== pid));
                        }
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs">{prop.name}</span>
                    {isPinned && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                  </div>
                );
              })}
            </div>
            {pinnedFeaturedIds.length > 0 && (
              <p className="text-[10px] text-amber-600">
                {pinnedFeaturedIds.length} pinned —{" "}
                {pinnedFeaturedIds.length > 1 ? "one will be randomly shown" : "this property will always be featured"}
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <GoogleFontPicker
            label=""
            description="Heading Font"
            value={brandHeadingFont || null}
            onChange={(f) => setBrandHeadingFont(f || "")}
          />
          <GoogleFontPicker
            label=""
            description="Body Font"
            value={brandBodyFont || null}
            onChange={(f) => setBrandBodyFont(f || "")}
          />
        </div>
        {brandLogoUrl && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border">
            <img
              src={brandLogoUrl}
              alt="Logo preview"
              className="h-8 object-contain"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <span className="text-[10px] text-muted-foreground flex-1">Logo preview</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setBrandLogoUrl("")}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Portfolio Aggregator billing (admin add-on) */}
      <div className="space-y-2 border-t border-border pt-3">
        <Label className="text-xs font-semibold">Portfolio Aggregator Billing</Label>
        <p className="text-[10px] text-muted-foreground">
          Charged at the portfolio level in addition to each member property's own billing strategy. Choose{" "}
          <strong>Monthly</strong> for a recurring listing fee or <strong>Once-off</strong> for a one-time setup fee.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Mode</Label>
            <select
              value={aggMode}
              onChange={(e) => setAggMode(e.target.value as any)}
              className="h-8 w-full text-xs rounded-md border border-input bg-background px-2"
            >
              <option value="none">Disabled</option>
              <option value="monthly">Monthly fee</option>
              <option value="once_off">Once-off listing fee</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Monthly (ZAR)</Label>
            <Input
              type="number"
              min="0"
              step="50"
              value={aggMonthly}
              onChange={(e) => setAggMonthly(e.target.value)}
              disabled={aggMode !== "monthly"}
              className="h-8 text-xs"
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Once-off (ZAR)</Label>
            <Input
              type="number"
              min="0"
              step="50"
              value={aggSetup}
              onChange={(e) => setAggSetup(e.target.value)}
              disabled={aggMode !== "once_off"}
              className="h-8 text-xs"
              placeholder="0"
            />
          </div>
        </div>
        {editPortfolio?.aggregator_activated_at && aggMode === "once_off" && (
          <p className="text-[10px] text-amber-600">
            Once-off fee already billed on {new Date(editPortfolio.aggregator_activated_at).toLocaleDateString()} — no
            further charges.
          </p>
        )}
      </div>

      {renderPropertyPicker()}

      {/* Review Platforms — per property */}
      {selectedProps.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" /> Review Platforms
          </Label>
          <p className="text-[10px] text-muted-foreground">
            Set Google & TripAdvisor IDs for each property to display ratings on the portfolio.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {selectedProps.map((pid) => {
              const prop = properties.find((p) => p.id === pid);
              if (!prop) return null;
              const ids = reviewIds[pid] || { google_place_id: "", tripadvisor_id: "" };
              return (
                <div key={pid} className="rounded-md border border-border p-3 bg-muted/20 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {prop.name}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Google Place ID
                      </Label>
                      <div className="flex gap-1">
                        <Input
                          value={ids.google_place_id}
                          onChange={(e) =>
                            setReviewIds((r) => ({ ...r, [pid]: { ...ids, google_place_id: e.target.value } }))
                          }
                          placeholder="e.g. ChIJ..."
                          className="text-xs font-mono h-7"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 shrink-0"
                          onClick={() => setPlaceSearchFor({ pid, query: prop.name })}
                          title="Search Google by name"
                        >
                          <Sparkles className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Star className="h-3 w-3" /> TripAdvisor ID
                      </Label>
                      <Input
                        value={ids.tripadvisor_id}
                        onChange={(e) =>
                          setReviewIds((r) => ({ ...r, [pid]: { ...ids, tripadvisor_id: e.target.value } }))
                        }
                        placeholder="e.g. 12345678"
                        className="text-xs font-mono h-7"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <GooglePlaceSearchDialog
        open={placeSearchFor !== null}
        onOpenChange={(v) => {
          if (!v) setPlaceSearchFor(null);
        }}
        initialQuery={placeSearchFor?.query ?? ""}
        onSelect={(id) => {
          if (!placeSearchFor) return;
          const pid = placeSearchFor.pid;
          setReviewIds((r) => {
            const existing = r[pid] || { google_place_id: "", tripadvisor_id: "" };
            return { ...r, [pid]: { ...existing, google_place_id: id } };
          });
        }}
      />
    </div>
  );

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <PageHeader
          title="Portfolio Management"
          subtitle="Property groupings"
          actions={
            <Dialog
              open={createOpen}
              onOpenChange={(o) => {
                setCreateOpen(o);
                if (!o) resetForm();
              }}
            >
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
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={!formName.trim() || createMutation.isPending}
                    size="sm"
                  >
                    {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {/* Rentals United sub-accounts now live in the Channel Manager console. */}
        <Tabs defaultValue="portfolios" className="mt-4">
          <TabsContent value="portfolios" className="mt-4">

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
                    <React.Fragment key={p.id}>
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => setExpandedId(expanded ? null : p.id)}
                      >
                        <TableCell className="w-8">
                          {expanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {p.slug}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{getMemberCount(p.id)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(p.created_at), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => window.open(`${PUBLIC_DOMAIN}/embed/portfolio/${p.slug}`, "_blank")}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copySnippet(p.slug)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setDeleteId(p.id)}
                            >
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
                                  <div
                                    key={prop.id}
                                    className="flex items-center gap-2 p-2 rounded-md bg-background border border-border"
                                  >
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
                            <div className="mt-4">
                              <RevenueShareSection
                                portfolioId={p.id}
                                properties={memberProps.map((mp) => ({ id: mp.id, name: mp.name }))}
                                isAdmin
                              />
                            </div>
                            <div className="mt-4">
                              <PortfolioPaymentProviderCard
                                portfolioId={p.id}
                                properties={memberProps.map((mp) => ({
                                  id: mp.id,
                                  name: mp.name,
                                  payment_provider_override: mp.payment_provider_override,
                                }))}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
          </TabsContent>
        </Tabs>


        {/* Edit Dialog */}
        <Dialog
          open={!!editPortfolio}
          onOpenChange={(o) => {
            if (!o) {
              setEditPortfolio(null);
              resetForm();
            }
          }}
        >
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Portfolio</DialogTitle>
            </DialogHeader>
            {renderFormFields()}
            {editPortfolio && (
              <div className="mt-4">
                <PortfolioPaymentProviderCard
                  portfolioId={editPortfolio.id}
                  properties={getMemberProperties(editPortfolio.id).map((mp) => ({
                    id: mp.id,
                    name: mp.name,
                    payment_provider_override: mp.payment_provider_override,
                  }))}
                />
              </div>
            )}
            <DialogFooter>
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={!formName.trim() || updateMutation.isPending}
                size="sm"
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deleteId}
          onOpenChange={(o) => {
            if (!o) setDeleteId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Portfolio?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the portfolio and all member associations. Properties themselves won't be affected.
              </AlertDialogDescription>
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
