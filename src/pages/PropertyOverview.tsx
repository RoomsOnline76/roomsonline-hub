import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useChannelManagerEntitlements } from "@/hooks/useChannelManagerEntitlement";
import { Building2, Edit, Trash2, Home, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Upload, Image, Star, Eye, EyeOff, FileCheck, FileX, FileWarning, Send, Mail, Loader2, FlaskConical, Sparkles, ShieldCheck, ShieldX } from "lucide-react";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { validateImageDimensions, getValidationErrorMessage } from "@/lib/imageValidation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { applyAdminScope } from "@/lib/adminScope";
import { getPropertyUrl } from "@/lib/config";
import { ExternalSourceBadge } from "@/components/pms/ExternalSourceBadge";
import { getPMSSystemByKey } from "@/lib/pmsSystemsConfig";
import { useHomeIconOpenNewTab } from "@/hooks/useFeatureFlags";
import { QualityGateIndicator } from "@/components/property/QualityGateIndicator";
import rolLogo from "@/assets/rol-logo.png";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SortDirection = "asc" | "desc" | null;
type SortColumn = "name" | "external_system" | "hero_listing" | "has_images" | "property_type" | "total_bookings" | null;

const PropertyOverview = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isDev, isFearlessLeader, scopedPropertyIds } = useAuth();
  const { openNewTab: homeIconOpenNewTab } = useHomeIconOpenNewTab();
  const [propertyToDelete, setPropertyToDelete] = useState<{ id: string; name: string } | null>(null);

  // Search filters state
  const [searchName, setSearchName] = useState("");
  const [searchPms, setSearchPms] = useState("");
  const [searchHero, setSearchHero] = useState("");
  const [searchRol, setSearchRol] = useState("");
  const [searchShow, setSearchShow] = useState("");
  const [searchPropertyType, setSearchPropertyType] = useState("");
  const [isTogglingShow, setIsTogglingShow] = useState<string | null>(null);
  const [showSandboxProperties, setShowSandboxProperties] = useState(true);
  const [tradingFilter, setTradingFilter] = useState<"all" | "trading" | "stale">("all");

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [uploadingCell, setUploadingCell] = useState<string | null>(null);
  const [sendingOnboarding, setSendingOnboarding] = useState<string | null>(null);

  const { loading: authLoading } = useAuth();
  const { data: allProperties, isLoading, refetch } = useQuery({
    queryKey: ["properties", user?.id, isAdmin, scopedPropertyIds.join(",")],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user?.id)
        .single();

      let query = supabase
        .from("properties")
        .select("*")
        .is("permanently_deleted_at", null)
        .order("created_at", { ascending: false });

      if (!isAdmin && profile?.email) {
        query = query.eq("owner_email", profile.email);
      }

      query = applyAdminScope(query, "id", scopedPropertyIds);

      const { data: propertiesData, error: propertiesError } = await query;
      
      if (propertiesError) throw propertiesError;

      // Get unique owner emails for batch profile fetch
      const ownerEmails = [...new Set(
        (propertiesData || [])
          .map(p => p.owner_email)
          .filter(Boolean)
      )] as string[];

      // Profiles and contracts are independent — fetch them together.
      const [{ data: profilesData }, { data: ownerContractsData }] = await Promise.all([
        ownerEmails.length > 0
          ? supabase.from("profiles").select("*").in("email", ownerEmails)
          : Promise.resolve({ data: [] as any[] }),
        ownerEmails.length > 0
          ? supabase
              .from("owner_contracts")
              .select("owner_email, status, version, signed_at, override_at, pdf_url")
              .in("owner_email", ownerEmails)
              .order("version", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const profilesByEmail = new Map((profilesData || []).map((p: any) => [p.email, p]));


      // Group contracts by owner_email (get latest version for each)
      const contractsByOwnerEmail = new Map<string, { status: string; signed_at?: string; override_at?: string; pdf_url?: string }>();
      (ownerContractsData || []).forEach(c => {
        if (!contractsByOwnerEmail.has(c.owner_email)) {
          contractsByOwnerEmail.set(c.owner_email, { 
            status: c.status, 
            signed_at: c.signed_at ?? undefined, 
            override_at: c.override_at ?? undefined,
            pdf_url: c.pdf_url ?? undefined,
          });
        }
      });

      // Map properties with profiles and contract status (now by owner_email)
      const propertiesWithExtras = (propertiesData || []).map((property) => ({
        ...property,
        total_bookings: 0, // Skip N+1 booking queries for now
        owner_profile: property.owner_email ? profilesByEmail.get(property.owner_email) || null : null,
        contract_status: property.owner_email ? contractsByOwnerEmail.get(property.owner_email) || null : null,
      }));
      
      return propertiesWithExtras;
    },
    enabled: !authLoading && !!user,
    staleTime: 60_000,
  });

  // Fetch PMS tracker status to check if integrations are enabled
  const { data: pmsTrackerStatus } = useQuery({
    queryKey: ["pms-tracker-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pms_tracker_status")
        .select("system_type, is_production");
      if (error) throw error;
      // Create a map of system_type -> is_production
      return new Map((data || []).map(t => [t.system_type?.toLowerCase(), t.is_production]));
    },
  });

  // Fetch book page images
  const { data: bookPageImages, refetch: refetchBookImages } = useQuery({
    queryKey: ["book-page-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("book_page_images")
        .select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // Handle book page image upload
  const handleBookPageImageUpload = async (
    columnType: 'experience' | 'map' | 'curated',
    rowPosition: number,
    file: File
  ) => {
    const cellKey = `${columnType}-${rowPosition}`;
    setUploadingCell(cellKey);
    
    try {
      const dims = await validateImageDimensions(file);
      if (!dims.valid) {
        toast.error(`Image too small: ${getValidationErrorMessage(file.name, dims.width, dims.height)}`);
        setUploadingCell(null);
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `book-page/${columnType}-row${rowPosition}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from("property-images")
        .getPublicUrl(fileName);
      
      const { error: upsertError } = await supabase.from("book_page_images").upsert({
        column_type: columnType,
        row_position: rowPosition,
        image_url: publicUrl,
      }, { onConflict: 'column_type,row_position' });
      
      if (upsertError) throw upsertError;
      
      refetchBookImages();
      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploadingCell(null);
    }
  };

  const handleSendOnboarding = async (property: any) => {
    if (!property.owner_email) {
      toast.error("No owner email set for this property");
      return;
    }

    setSendingOnboarding(property.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-onboarding-email", {
        body: {
          propertyId: property.id,
          ownerEmail: property.owner_email,
          ownerName: property.owner_name,
          propertyName: property.name,
          createdBy: user?.id
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Onboarding email sent to ${property.owner_email}`);
      } else {
        throw new Error(data?.error || "Failed to send email");
      }
    } catch (error: any) {
      console.error("Send onboarding error:", error);
      toast.error(error.message || "Failed to send onboarding email");
    } finally {
      setSendingOnboarding(null);
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    if (sortDirection === "asc") return <ArrowUp className="h-3 w-3 ml-1" />;
    if (sortDirection === "desc") return <ArrowDown className="h-3 w-3 ml-1" />;
    return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
  };

  // Helper to check if property is sandbox/test
  const isSandboxProperty = (property: any): boolean => {
    const name = property.name || "";
    const metadata = property.external_metadata as any;
    return property.is_sandbox === true || name.startsWith("[SANDBOX]") || metadata?.is_sandbox === true || property.is_test_property === true;
  };

  // Trading = counted in dashboards and metrics. Everything else is stale inventory.
  // The test/sandbox marker never affects this — those properties trade normally.
  const isTradingProperty = (property: any): boolean => property.is_trading === true;

  // Filter and sort active properties
  const activeProperties = useMemo(() => {
    let filtered = (allProperties || []).filter(p => p.is_active);

    // Filter sandbox properties based on toggle
    if (!showSandboxProperties) {
      filtered = filtered.filter(p => !isSandboxProperty(p));
    }

    // Trading / stale inventory filter chip
    if (tradingFilter === "trading") {
      filtered = filtered.filter(p => isTradingProperty(p));
    } else if (tradingFilter === "stale") {
      filtered = filtered.filter(p => !isTradingProperty(p) && !isSandboxProperty(p));
    }


    // Apply search filters
    if (searchName) {
      filtered = filtered.filter(p => 
        p.name?.toLowerCase().includes(searchName.toLowerCase())
      );
    }
    if (searchPms) {
      filtered = filtered.filter(p => 
        p.external_system?.toLowerCase().includes(searchPms.toLowerCase())
      );
    }
    if (searchHero) {
      const searchLower = searchHero.toLowerCase();
      if (searchLower === 'yes' || searchLower === 'hero') {
        filtered = filtered.filter(p => p.hero_listing === true);
      } else if (searchLower === 'no') {
        filtered = filtered.filter(p => !p.hero_listing);
      }
    }
    if (searchRol) {
      const searchLower = searchRol.toLowerCase();
      if (searchLower === 'yes') {
        filtered = filtered.filter(p => (p as any).is_rol_property === true);
      } else if (searchLower === 'no') {
        filtered = filtered.filter(p => !(p as any).is_rol_property);
      }
    }
    if (searchPropertyType) {
      filtered = filtered.filter(p => 
        p.property_type?.toLowerCase().includes(searchPropertyType.toLowerCase())
      );
    }
    if (searchShow) {
      const searchLower = searchShow.toLowerCase();
      if (searchLower === 'yes') {
        filtered = filtered.filter(p => (p as any).show_on_website === true);
      } else if (searchLower === 'no') {
        filtered = filtered.filter(p => !(p as any).show_on_website);
      }
    }

    // Apply sorting
    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        // Special handling for has_images
        if (sortColumn === "has_images") {
          const aHasImages = Array.isArray(a.images) && a.images.length > 0 ? 1 : 0;
          const bHasImages = Array.isArray(b.images) && b.images.length > 0 ? 1 : 0;
          return sortDirection === "asc" ? aHasImages - bHasImages : bHasImages - aHasImages;
        }

        let aVal: any = a[sortColumn];
        let bVal: any = b[sortColumn];

        // Handle null/undefined
        if (aVal == null) aVal = "";
        if (bVal == null) bVal = "";

        // String comparison
        if (typeof aVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [allProperties, searchName, searchPms, searchHero, searchRol, searchShow, searchPropertyType, sortColumn, sortDirection, showSandboxProperties, tradingFilter]);

  // Count sandbox properties for display
  const sandboxCount = useMemo(() => {
    return (allProperties || []).filter(p => p.is_active && isSandboxProperty(p)).length;
  }, [allProperties]);

  // Trading vs stale inventory counts for the header chips
  const tradingCount = useMemo(
    () => (allProperties || []).filter(p => p.is_active && isTradingProperty(p)).length,
    [allProperties],
  );
  const staleCount = useMemo(
    () => (allProperties || []).filter(p => p.is_active && !isTradingProperty(p) && !isSandboxProperty(p)).length,
    [allProperties],
  );


  // Handle toggle show on website with quality gate check
  const handleToggleShowOnWebsite = async (propertyId: string, show: boolean) => {
    setIsTogglingShow(propertyId);
    
    try {
      let qualityResult: { passed: boolean; score: number; blockers?: { message: string }[] } | null = null;
      
      // If enabling, run quality gate first
      if (show) {
        const { data, error: qualityError } = await supabase.functions.invoke('check-activation-readiness', {
          body: { property_id: propertyId }
        });
        
        qualityResult = data;
        
        if (qualityError) {
          console.error('Quality gate error:', qualityError);
          toast.error('Failed to check activation readiness');
          setIsTogglingShow(null);
          return;
        }
        
        if (!qualityResult?.passed) {
          const blockerCount = qualityResult?.blockers?.length || 0;
          toast.error(`Cannot activate: ${blockerCount} blocker${blockerCount !== 1 ? 's' : ''} must be resolved first`, {
            description: qualityResult?.blockers?.[0]?.message || 'Quality checks failed',
            duration: 5000
          });
          setIsTogglingShow(null);
          return;
        }
      }
      
      // Proceed with update
      const updateData: Record<string, unknown> = { show_on_website: show };
      
      // If activating, also update listing_status and activation timestamp
      if (show) {
        updateData.listing_status = 'live';
        updateData.activated_at = new Date().toISOString();
        updateData.activated_by = user?.id;
      } else {
        updateData.listing_status = 'inactive';
      }
      
      const { error } = await supabase
        .from("properties")
        .update(updateData as never)
        .eq("id", propertyId);
      
      if (error) throw error;
      
      // Log activation and send notifications if enabling
      if (show) {
        // Log activation with quality gate results
        await supabase.from('property_activation_logs').insert({
          property_id: propertyId,
          activated_at: new Date().toISOString(),
          activated_by: user?.id,
          pre_activation_score: qualityResult?.score || 0,
          quality_gate_results: qualityResult
        });
        
        // Send activation notification email to owner (fire and forget)
        supabase.functions.invoke('send-activation-notification', {
          body: { property_id: propertyId }
        }).then(({ error: notifyError }) => {
          if (notifyError) {
            console.error('Failed to send activation notification:', notifyError);
          } else {
            console.log('Activation notification sent for property:', propertyId);
          }
        });
        
        // Schedule post-launch validation (fire and forget, runs async)
        setTimeout(() => {
          supabase.functions.invoke('post-launch-validator', {
            body: { property_id: propertyId }
          }).then(({ data: validationResult, error: validationError }) => {
            if (validationError) {
              console.error('Post-launch validation failed:', validationError);
            } else {
              console.log('Post-launch validation complete:', validationResult);
            }
          });
        }, 5000); // Run 5 seconds after activation
      }
      
      toast.success(show ? "Property activated and now live on website" : "Property hidden from website");
      refetch();
    } catch (error: any) {
      console.error('Toggle error:', error);
      toast.error(error.message || "Failed to update visibility");
    } finally {
      setIsTogglingShow(null);
    }
  };

  // The Channels wizard shortcut only shows when the Channel Manager add-on is
  // enabled for the property (or its portfolio) in billing.
  const { map: channelEntitlements } = useChannelManagerEntitlements(
    useMemo(() => activeProperties.map((p) => p.id), [activeProperties]),
  );

  const deletedProperties = allProperties?.filter(p => !p.is_active) || [];

  const handleDeleteProperty = async (id: string) => {
    try {
      const { error } = await supabase
        .from("properties")
        .update({ is_active: false })
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Property moved to deleted");
      refetch();
    } catch (error) {
      toast.error("Failed to delete property");
    }
  };

  const handleReactivateProperty = async (id: string) => {
    try {
      const { error } = await supabase
        .from("properties")
        .update({ is_active: true })
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Property reactivated successfully!");
      refetch();
    } catch (error) {
      toast.error("Failed to reactivate property");
    }
  };

  const handlePermanentDelete = async () => {
    if (!propertyToDelete) return;
    
    try {
      const { error } = await supabase
        .from("properties")
        .update({ permanently_deleted_at: new Date().toISOString() })
        .eq("id", propertyToDelete.id);
      
      if (error) throw error;
      toast.success("Property permanently deleted. Historical data retained.");
      setPropertyToDelete(null);
      refetch();
    } catch (error) {
      toast.error("Failed to permanently delete property");
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Properties"
        subtitle="Manage your portfolio"
        actions={
          <div className="flex gap-2">
            {(isAdmin || isDev || isFearlessLeader) && (
              <Button onClick={() => navigate("/admin/properties/new/preflight")} size="sm" variant="default" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                Start New Listing
              </Button>
            )}
            <Button onClick={() => navigate("/admin/properties/new")} size="sm" variant="outline" className="gap-1">
              <Building2 className="h-3.5 w-3.5" />
              Quick Add
            </Button>
          </div>
        }
      />

        <Tabs defaultValue="active" className="space-y-2">
          <TabsList className="bg-secondary h-8">
            <TabsTrigger value="active" className="gap-1 text-xs py-1">
              Active
              <Badge className="h-4 min-w-4 px-1 text-[10px] font-medium bg-primary/20 text-primary hover:bg-primary/20">
                {activeProperties.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="deleted" className="gap-1 text-xs py-1">
              Deleted
              <Badge className="h-4 min-w-4 px-1 text-[10px] font-medium bg-primary/20 text-primary hover:bg-primary/20">
                {deletedProperties.length}
              </Badge>
            </TabsTrigger>
            {(isAdmin || isDev || isFearlessLeader) && (
              <TabsTrigger value="bookpage" className="gap-1 text-xs py-1">
                <Image className="h-3 w-3 mr-1" />
                Book Page
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="active">
            <Card className="overflow-hidden">
              <CardHeader className="py-2 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <CardTitle className="text-sm">Active Properties</CardTitle>
                    <CardDescription className="text-xs">— Manage your active properties</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {([
                        { key: "all", label: "All" },
                        { key: "trading", label: `Trading (${tradingCount})` },
                        { key: "stale", label: `Stale (${staleCount})` },
                      ] as const).map((chip) => (
                        <Button
                          key={chip.key}
                          size="sm"
                          variant={tradingFilter === chip.key ? "default" : "outline"}
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setTradingFilter(chip.key)}
                        >
                          {chip.label}
                        </Button>
                      ))}
                    </div>

                    {sandboxCount > 0 && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id="show-sandbox"
                          checked={showSandboxProperties}
                          onCheckedChange={setShowSandboxProperties}
                          className="scale-75"
                        />
                        <label htmlFor="show-sandbox" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                          <FlaskConical className="h-3 w-3" />
                          Test ({sandboxCount})
                        </label>
                      </div>
                    )}
                    <Button onClick={() => navigate('/admin/properties/new')} className="h-7 text-xs px-2">
                      <Building2 className="mr-1 h-3 w-3" />
                      Add Property
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-2 px-4">
                {isLoading ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground text-xs">Loading properties...</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="py-1 text-xs w-10">EDIT</TableHead>
                        <TableHead className="py-1 text-xs w-12">STATUS</TableHead>
                        <TableHead className="py-1 text-xs w-12">SHOW</TableHead>
                        <TableHead className="py-1 text-xs w-10">ROL</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("name")}
                        >
                          <div className="flex items-center">
                            NAME
                            {getSortIcon("name")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("external_system")}
                        >
                          <div className="flex items-center">
                            PMS
                            {getSortIcon("external_system")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("hero_listing")}
                        >
                          <div className="flex items-center">
                            HERO
                            {getSortIcon("hero_listing")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs w-12"
                          onClick={() => handleSort("has_images")}
                        >
                          <div className="flex items-center">
                            IMG
                            {getSortIcon("has_images")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("property_type")}
                        >
                          <div className="flex items-center">
                            TYPE
                            {getSortIcon("property_type")}
                          </div>
                        </TableHead>
                        <TableHead className="py-1 text-xs">OWNER</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("total_bookings")}
                        >
                          <div className="flex items-center">
                            BOOKINGS
                            {getSortIcon("total_bookings")}
                          </div>
                        </TableHead>
                        <TableHead className="py-1 text-xs w-16">CONTRACT</TableHead>
                        <TableHead className="py-1 text-xs">TA ID</TableHead>
                        <TableHead className="text-right py-1 text-xs">ACTION</TableHead>
                      </TableRow>
                      {/* Search row */}
                      <TableRow className="hover:bg-transparent h-7">
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="Yes/No"
                            value={searchShow}
                            onChange={(e) => setSearchShow(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="Yes/No"
                            value={searchRol}
                            onChange={(e) => setSearchRol(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="Search"
                            value={searchName}
                            onChange={(e) => setSearchName(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="Search"
                            value={searchPms}
                            onChange={(e) => setSearchPms(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="yes/no"
                            value={searchHero}
                            onChange={(e) => setSearchHero(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="Search"
                            value={searchPropertyType}
                            onChange={(e) => setSearchPropertyType(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                         <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeProperties.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={15} className="text-center py-6">
                            {(searchName || searchPms || searchHero || searchPropertyType) ? (
                              <div>
                                <AlertTriangle className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                                <p className="text-muted-foreground text-xs">No properties match your search criteria</p>
                              </div>
                            ) : (
                              <div>
                                <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <h3 className="text-sm font-semibold mb-1">No Active Properties</h3>
                                <p className="text-muted-foreground text-xs mb-3">
                                  Add your first property to get started
                                </p>
                                <Button onClick={() => navigate('/admin/properties/new')} className="h-7 text-xs px-2">
                                  <Building2 className="mr-1 h-3 w-3" />
                                  Add Property
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : activeProperties.map((property) => (
                        <TableRow key={property.id} className="h-8 group">
                          <TableCell className="py-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => navigate(`/admin/properties/${property.slug || property.id}`)}
                              title="Edit Property"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            {["roomsonline", "rolos", "rol_os", "rolos_pms"].includes(
                              String(property.external_system ?? "").toLowerCase(),
                            ) && channelEntitlements.get(property.id) === true && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => navigate(`/admin/onboarding/${property.id}`)}
                                title="Open go-live workspace"
                              >
                                <Sparkles className="h-3 w-3" />
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="py-1">
                            {(() => {
                              const isPmsEnabled = property.external_system 
                                ? pmsTrackerStatus?.get(property.external_system.toLowerCase()) === true
                                : false;
                              const hasConnection = !!property.external_system;
                              
                              let status: "healthy" | "warning" | "stale" = "stale";
                              let tooltip = "No PMS connected";
                              
                              if (hasConnection && isPmsEnabled) {
                                status = "healthy";
                                tooltip = `Connected: ${property.external_system} (Active)`;
                              } else if (hasConnection && !isPmsEnabled) {
                                status = "warning";
                                tooltip = `Connected: ${property.external_system} (Integration Disabled)`;
                              }
                              
                              return (
                                <StatusIndicator 
                                  status={status}
                                  showLabel={false}
                                  size="sm"
                                  tooltip={tooltip}
                                />
                              );
                            })()}
                          </TableCell>
                          <TableCell className="py-1">
                            {(isAdmin || isDev || isFearlessLeader) ? (
                              <div className="flex items-center gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <Switch
                                          checked={(property as any).show_on_website ?? false}
                                          onCheckedChange={(checked) => handleToggleShowOnWebsite(property.id, checked)}
                                          disabled={isTogglingShow === property.id}
                                          className="scale-75"
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                      <p className="text-xs">
                                        {(property as any).show_on_website 
                                          ? "Click to hide from website"
                                          : "Click to activate. Quality gate checks will run first."
                                        }
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {!(property as any).show_on_website && (
                                  <QualityGateIndicator propertyId={property.id} compact />
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {(property as any).show_on_website ? (
                                  <Eye className="h-3 w-3" />
                                ) : (
                                  <EyeOff className="h-3 w-3 opacity-50" />
                                )}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-1">
                            {(property as any).is_rol_property ? (
                              <img src={rolLogo} alt="ROL" className="h-4 w-4" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium py-1 text-xs">
                            <div className="flex items-center gap-1.5">
                              {isSandboxProperty(property) && (
                                <Badge variant="outline" className="h-4 px-1 text-[9px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800">
                                  <FlaskConical className="h-2.5 w-2.5 mr-0.5" />
                                  TEST
                                </Badge>
                              )}
                              {!isSandboxProperty(property) && !isTradingProperty(property) && (
                                <Badge variant="outline" className="h-4 px-1 text-[9px] text-muted-foreground">
                                  STALE
                                </Badge>
                              )}
                              <span>{property.name?.replace(/^\[SANDBOX\]\s*/, '')}</span>

                            </div>
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            {property.external_system ? (
                              (() => {
                                const pmsConfig = getPMSSystemByKey(property.external_system);
                                const pmsName = pmsConfig?.name || property.external_system;
                                const isPmsEnabled = pmsTrackerStatus?.get(property.external_system.toLowerCase()) === true;
                                
                                return (
                                  <span className={isPmsEnabled ? "text-foreground" : "text-muted-foreground"}>
                                    {pmsName}
                                  </span>
                                );
                              })()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            {property.hero_listing ? (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            {Array.isArray(property.images) && property.images.length > 0 ? (
                              <Image className="h-4 w-4 text-green-600" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            <span className="capitalize">{property.property_type?.replace(/_/g, ' ') || "-"}</span>
                          </TableCell>
                          <TableCell className="py-1 text-xs truncate max-w-[120px]" title={property.owner_name || property.owner_email || ""}>
                            {property.owner_name || property.owner_email || "—"}
                          </TableCell>
                          <TableCell className="py-1 text-xs">{property.total_bookings || 0}</TableCell>
                          <TableCell className="py-1">
                            {(() => {
                              const contractStatus = (property as any).contract_status;
                              if (!contractStatus) {
                                return (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <FileX className="h-3 w-3" />
                                  </span>
                                );
                              }
                              if (contractStatus.status === 'signed') {
                                return (
                                  <span className="flex items-center gap-1 text-green-600" title={`Signed ${contractStatus.signed_at ? new Date(contractStatus.signed_at).toLocaleDateString() : ''}`}>
                                    <FileCheck className="h-3 w-3" />
                                  </span>
                                );
                              }
                              if (contractStatus.status === 'overridden') {
                                return (
                                  <span className="flex items-center gap-1 text-amber-600" title={`Overridden ${contractStatus.override_at ? new Date(contractStatus.override_at).toLocaleDateString() : ''}`}>
                                    <FileWarning className="h-3 w-3" />
                                  </span>
                                );
                              }
                              if (contractStatus.status === 'sent') {
                                return (
                                  <span className="flex items-center gap-1 text-blue-600" title="Awaiting signature">
                                    <Send className="h-3 w-3" />
                                  </span>
                                );
                              }
                              return (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <FileX className="h-3 w-3" />
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="py-1">
                            {(() => {
                              const amenities = property.amenities as any;
                              const taId = amenities?.external_ids?.tripadvisor_id;
                              return taId ? (
                                <span className="font-mono text-[10px]">{taId}</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right py-1">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  const url = getPropertyUrl(property.slug || property.id);
                                  if (homeIconOpenNewTab) {
                                    window.open(url, "_blank");
                                  } else {
                                    navigate(`/property/${property.slug || property.id}`);
                                  }
                                }}
                                title="View Property Showcase"
                              >
                                <Home className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleSendOnboarding(property)}
                                disabled={sendingOnboarding === property.id || !property.owner_email}
                                title={property.owner_email ? `Send onboarding to ${property.owner_email}` : "No owner email set"}
                              >
                                {sendingOnboarding === property.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Mail className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleDeleteProperty(property.id)}
                                title="Delete Property"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deleted">
            <Card>
              <CardHeader className="py-2 px-4">
                <div className="flex items-baseline gap-2">
                  <CardTitle className="text-sm">Deleted Properties</CardTitle>
                  <CardDescription className="text-xs">— View and reactivate deleted properties</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="py-2 px-4">
                {isLoading ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground text-xs">Loading properties...</p>
                  </div>
                ) : deletedProperties.length === 0 ? (
                  <div className="text-center py-6">
                    <Trash2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <h3 className="text-sm font-semibold mb-1">No Deleted Properties</h3>
                    <p className="text-muted-foreground text-xs">
                      Properties you delete will appear here
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="py-1 text-xs">NAME</TableHead>
                        <TableHead className="py-1 text-xs">PMS</TableHead>
                        <TableHead className="py-1 text-xs">OWNER</TableHead>
                        <TableHead className="py-1 text-xs">EMAIL</TableHead>
                        <TableHead className="py-1 text-xs">BOOKINGS</TableHead>
                        <TableHead className="py-1 text-xs">STATUS</TableHead>
                        <TableHead className="text-right py-1 text-xs">ACTION</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deletedProperties.map((property) => (
                        <TableRow key={property.id} className="h-8">
                          <TableCell className="font-medium py-1 text-xs">{property.name}</TableCell>
                          <TableCell className="py-1 text-xs">
                            {property.external_system ? (
                              <Badge variant="outline" className="capitalize text-[10px] px-1 py-0">
                                {property.external_system}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 text-xs">{property.owner_name || "-"}</TableCell>
                          <TableCell className="py-1 text-xs">{property.owner_email || "-"}</TableCell>
                          <TableCell className="py-1 text-xs">{property.total_bookings || 0}</TableCell>
                          <TableCell className="py-1">
                            <Badge 
                              variant="secondary"
                              className="bg-red-100 text-red-800 text-[10px] px-1 py-0"
                            >
                              Deleted
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right py-1">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => handleReactivateProperty(property.id)}
                              >
                                Reactivate
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => setPropertyToDelete({ id: property.id, name: property.name })}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bookpage">
            <Card>
              <CardHeader className="py-2 px-4">
                <div className="flex items-baseline gap-2">
                  <CardTitle className="text-sm">Book Page Images</CardTitle>
                  <CardDescription className="text-xs">— Upload images for the booking page grid (3 rows × 3 columns)</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="py-4 px-4">
                {/* Column Headers */}
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div className="text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground">Experience</div>
                  <div className="text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground">Map</div>
                  <div className="text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground">Curated</div>
                </div>
                
                {/* 3x3 Grid */}
                {[1, 2, 3].map((row) => (
                  <div key={row} className="grid grid-cols-3 gap-4 mb-4">
                    {(['experience', 'map', 'curated'] as const).map((col) => {
                      const cellKey = `${col}-${row}`;
                      const existingImage = bookPageImages?.find(
                        (img: any) => img.column_type === col && img.row_position === row
                      );
                      
                      return (
                        <div
                          key={cellKey}
                          className="aspect-video border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors relative overflow-hidden group"
                          onClick={() => document.getElementById(`upload-${cellKey}`)?.click()}
                        >
                          {existingImage ? (
                            <>
                              <img 
                                src={existingImage.image_url} 
                                alt={`${col} row ${row}`}
                                className="w-full h-full object-cover" 
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Upload className="h-6 w-6 text-white" />
                              </div>
                            </>
                          ) : uploadingCell === cellKey ? (
                            <span className="text-xs text-muted-foreground">Uploading...</span>
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-muted-foreground">
                              <Upload className="h-6 w-6" />
                              <span className="text-[10px]">Click to upload</span>
                            </div>
                          )}
                          <input
                            id={`upload-${cellKey}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleBookPageImageUpload(col, row, file);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Permanent Delete Confirmation Dialog */}
        <AlertDialog open={!!propertyToDelete} onOpenChange={(open) => !open && setPropertyToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Permanently Delete Property
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Are you sure you want to permanently delete <strong>"{propertyToDelete?.name}"</strong>?
                </p>
                <p className="text-sm">
                  This action will:
                </p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  <li>Remove the property from all listings</li>
                  <li>The property cannot be reactivated after this action</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> Historical data including bookings and revenue will be retained for reporting purposes.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handlePermanentDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Permanently Delete
              </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default PropertyOverview;
