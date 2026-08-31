import { useMemo, useState } from "react";
import { useChannelPropertyTypes } from "@/hooks/useChannelPropertyTypes";
import { normalizeChannelPropertyType, channelPropertyTypeLabel } from "@/config/channelPropertyTypes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PropertyMap } from "@/components/PropertyMap";
import { ContextualHelp } from "@/components/help";
import { OwnerPMSConnectionCard } from "@/components/pms/OwnerPMSConnectionCard";
import { RatesOverviewPanel } from "@/components/property/RatesOverviewPanel";
import { HyperGuestSyncReflectionButton } from "@/components/property/HyperGuestSyncReflectionButton";
import { HyperGuestPropertyLookup } from "@/components/property/HyperGuestPropertyLookup";
import { ContractManagementPanel } from "@/components/contract";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { ACCOMMODATION_LABEL_OPTIONS } from "@/lib/accommodationLabels";
import { getPMSFieldClass, getPMSDisplayName, isFieldPopulatedByPMS } from "@/lib/pmsFieldConfig";
import { isPMSFullyIntegrated, getPMSIntegrationLevel, getPMSIcon } from "@/hooks/usePMSSync";
import { channelMandatoryClass, CHANNEL_MANDATORY_LEGEND } from "@/lib/channelMandatoryFields";
import { markerFlags } from "@/lib/fieldMarkers";
import { ChannelFieldHint } from "@/components/property/ChannelFieldHint";
import { checkChannelCoordinates, checkChannelName, checkChannelPlace, checkChannelPostalCode, checkChannelStreet } from "@/lib/channelFieldRules";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Home, Save, X, Plus, Check, MapPin, RefreshCw, Cloud, Key,
  ChevronsUpDown, AlertTriangle, Sparkles, Info,
} from "lucide-react";
import type { WebsiteSyncSuggestion } from "@/components/property/WebsiteSyncModal";
import { WebsiteSyncModal } from "@/components/property/WebsiteSyncModal";
import { syncFromWebsite } from "@/lib/api/websiteSync";
import { GooglePlaceSearchDialog } from "@/components/integrations/GooglePlaceSearchDialog";

interface GeneralTabProps {
  // Form state
  formData: any;
  handleInputChange: (field: string, value: any) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isDirty: boolean;
  loading: boolean;
  setIsDirty: (v: boolean) => void;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  handleNavigate: (path: string) => void;

  // Property identity
  propertyId: string | null;
  isEditMode: boolean;
  isRolProperty: boolean;
  setIsRolProperty: (v: boolean) => void;
  isTestProperty: boolean;
  setIsTestProperty: (v: boolean) => void;

  // Offerings
  isAccommodation: boolean;
  setIsAccommodation: (v: boolean) => void;
  isVenues: boolean;
  isEvent: boolean;
  isConference: boolean;
  handleVenuesChange: (checked: boolean) => void;
  handleEventChange: (checked: boolean) => void;
  handleConferenceChange: (checked: boolean) => void;

  // PMS
  selectedPMS: string;
  setSelectedPMS: (v: string) => void;
  availablePMSSystems: any[];
  bensonPropertyCode: string;
  setBensonPropertyCode: (v: string) => void;
  cloudbedsPropertyId: string;
  setCloudbedsPropertyId: (v: string) => void;
  littlehotelierChannelCode: string;
  setLittlehotelierChannelCode: (v: string) => void;
  littlehotelierRegion: string;
  setLittlehotelierRegion: (v: any) => void;
  hotelbedsHotelCode: string;
  setHotelbedsHotelCode: (v: string) => void;
  hyperguestHotelId: string;
  setHyperguestHotelId: (v: string) => void;
  hostfullyPropertyUid: string;
  isSyncingPms: boolean;
  syncFromBenson: () => void;
  handleFullHostfullySync: () => void;
  handleImportHostfullyRooms: () => void;
  importingHostfullyRooms: boolean;
  ownerPmsCredentialId: string | null;
  hostfullyRoomCount: number;
  showHostfullyWarning: boolean;
  setShowHostfullyWarning: (v: boolean) => void;
  previousPMS: string;
  setPreviousPMS: (v: string) => void;
  syncingRoomId: string | null;
  fullSyncingHostfully: boolean;
  syncProgress: any;

  // Owner
  owners: any[];
  ownerSearchOpen: boolean;
  setOwnerSearchOpen: (v: boolean) => void;
  linkedOwners: any[];
  setLinkedOwners: React.Dispatch<React.SetStateAction<any[]>>;

  // Auth
  user: any;
  profile: any;
  authLoading: boolean;
  isAdmin: boolean;
  isDev: boolean;
  isFearlessLeader: boolean;
  isOwnerUser: boolean;

  // Location
  latitude: number | null;
  setLatitude: (v: number | null) => void;
  longitude: number | null;
  setLongitude: (v: number | null) => void;
  googleMapsLink: string;
  handleGoogleMapsLinkChange: (url: string) => void;
  noStreetAddress: boolean;
  setNoStreetAddress: (v: boolean) => void;

  // Owner Hostfully
  ownerHostfullyCredential: any;
  handleOwnerCredentialChange: () => void;
  handleConnectHostfullyOAuth: (useSandbox?: boolean) => void;
  connectingHostfullyOAuth: boolean;

  // External IDs
  tripadvisorId: string;
  setTripadvisorId: (v: string) => void;
  googlePlaceId: string;
  setGooglePlaceId: (v: string) => void;

  // Room types (for rates overview)
  roomTypes: any[];
  pmsRateTypes: any[];
  seasons: any[];
  seasonRates: any;

  // Business registration
  registeredBusinessName: string;
  setRegisteredBusinessName: (v: string) => void;
  mobileNumber: string;
  setMobileNumber: (v: string) => void;
  postalAddress: string;
  setPostalAddress: (v: string) => void;
  keyRepresentative: string;
  setKeyRepresentative: (v: string) => void;

  // Feature flags
  featureFlags: any;
  roomsonlineActive: boolean;
  countryOpen: boolean;
  setCountryOpen: (v: boolean) => void;

  // Website sync
  websiteSyncing: boolean;
  setWebsiteSyncing: (v: boolean) => void;
  websiteSyncModalOpen: boolean;
  setWebsiteSyncModalOpen: (v: boolean) => void;
  websiteSyncSuggestions: WebsiteSyncSuggestion[];
  setWebsiteSyncSuggestions: (v: WebsiteSyncSuggestion[]) => void;
  websiteSyncUrl: string;
  setWebsiteSyncUrl: (v: string) => void;
}

export function GeneralTab(props: GeneralTabProps) {
  const { toast } = useToast();
  const {
    formData, handleInputChange, handleSubmit, isDirty, loading, setIsDirty, setFormData,
    handleNavigate, propertyId, isEditMode, isRolProperty, setIsRolProperty,
    isTestProperty, setIsTestProperty, isAccommodation, setIsAccommodation,
    isVenues, isEvent, isConference, handleVenuesChange, handleEventChange,
    handleConferenceChange, selectedPMS,
    setSelectedPMS, availablePMSSystems, bensonPropertyCode, setBensonPropertyCode,
    cloudbedsPropertyId, setCloudbedsPropertyId, littlehotelierChannelCode,
    setLittlehotelierChannelCode, littlehotelierRegion, setLittlehotelierRegion,
    hotelbedsHotelCode, setHotelbedsHotelCode, hyperguestHotelId, setHyperguestHotelId, isSyncingPms, syncFromBenson,
    handleFullHostfullySync, handleImportHostfullyRooms, importingHostfullyRooms,
    ownerPmsCredentialId, hostfullyRoomCount, showHostfullyWarning,
    setShowHostfullyWarning, previousPMS, setPreviousPMS, fullSyncingHostfully,
    syncProgress, owners, ownerSearchOpen, setOwnerSearchOpen, linkedOwners,
    setLinkedOwners, user, profile, authLoading, isAdmin, isDev, isFearlessLeader,
    isOwnerUser, latitude, setLatitude, longitude, setLongitude, googleMapsLink,
    handleGoogleMapsLinkChange, noStreetAddress, setNoStreetAddress,
    ownerHostfullyCredential, handleOwnerCredentialChange,
    handleConnectHostfullyOAuth, connectingHostfullyOAuth, tripadvisorId,
    setTripadvisorId, googlePlaceId, setGooglePlaceId, roomTypes, pmsRateTypes,
    seasons, seasonRates, registeredBusinessName, setRegisteredBusinessName,
    mobileNumber, setMobileNumber, postalAddress, setPostalAddress,
    keyRepresentative, setKeyRepresentative, countryOpen, setCountryOpen,
    websiteSyncing, setWebsiteSyncing, websiteSyncModalOpen, setWebsiteSyncModalOpen,
    websiteSyncSuggestions, setWebsiteSyncSuggestions, websiteSyncUrl, setWebsiteSyncUrl,
    hostfullyPropertyUid,
  } = props;

  const [linkedOwnerSearch, setLinkedOwnerSearch] = useState("");
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);

  // Live channel-constraint feedback for the channel-mandatory inputs on this tab.
  const channelTypes = useChannelPropertyTypes();
  /**
   * The channel type list, plus the currently stored value when it predates the list —
   * a legacy type must stay visible instead of silently blanking the field.
   */
  const channelTypeOptions = useMemo(() => {
    const current = normalizeChannelPropertyType(formData.property_type);
    const options = channelTypes.options.map((o) => ({ value: o.value, label: o.label }));
    if (current && !options.some((o) => o.value === current)) {
      options.unshift({ value: current, label: `${channelPropertyTypeLabel(current)} (legacy)` });
    }
    return options;
  }, [channelTypes.options, formData.property_type]);

  const nameFeedback = useMemo(() => checkChannelName(formData.name), [formData.name]);
  const streetFeedback = useMemo(() => checkChannelStreet(formData.address), [formData.address]);
  const cityFeedback = useMemo(() => checkChannelPlace(formData.city, "City"), [formData.city]);
  const postalFeedback = useMemo(() => checkChannelPostalCode(formData.postal_code), [formData.postal_code]);
  const coordsFeedback = useMemo(() => checkChannelCoordinates(latitude, longitude), [latitude, longitude]);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Rates Overview Section */}
      {!selectedPMS && roomTypes.length > 0 && (
        <Collapsible defaultOpen={true}>
          <Card className="border-primary/20">
            <CollapsibleTrigger asChild>
              <CardHeader className="py-2 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Rates Overview
                  </span>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="py-2 px-4">
                <RatesOverviewPanel
                  roomTypes={roomTypes}
                  rateTypes={pmsRateTypes}
                  seasons={seasons}
                  seasonRates={seasonRates}
                  currency={formData.currency || "ZAR"}
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Offerings Section */}
      <Card>
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-sm">
            {selectedPMS === "nightsbridge" ? "PMS Connection" : "Offerings"}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4">
          {selectedPMS !== "nightsbridge" && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="accommodation" checked={isAccommodation} onCheckedChange={(c) => { setIsAccommodation(c as boolean); setIsDirty(true); }} />
                  <Label htmlFor="accommodation" className="cursor-pointer text-xs">Accommodation</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="venues" checked={isVenues} onCheckedChange={(c) => handleVenuesChange(c as boolean)} />
                  <Label htmlFor="venues" className="cursor-pointer text-xs">Venues</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="event" checked={isEvent} onCheckedChange={(c) => handleEventChange(c as boolean)} />
                  <Label htmlFor="event" className="cursor-pointer text-xs">Event/Wedding</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="conference" checked={isConference} onCheckedChange={(c) => handleConferenceChange(c as boolean)} />
                  <Label htmlFor="conference" className="cursor-pointer text-xs">Conference</Label>
                </div>
              </div>

              <Separator className="my-3" />
            </>
          )}

          {/* WETU Pin ID — always visible for ALL properties regardless of PMS */}
          <div className="flex items-center gap-2 mt-1 mb-3 flex-wrap">
            <Label htmlFor="wetu_id_top" className="text-xs whitespace-nowrap">WETU Pin ID</Label>
            <Input
              id="wetu_id_top"
              value={formData.wetu_id ?? ""}
              onChange={(e) => handleInputChange("wetu_id", e.target.value)}
              placeholder="e.g. 12345"
              className="h-7 text-xs max-w-[200px]"
            />
            {formData.wetu_id && propertyId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke("wetu-api", {
                      body: {
                        action: "import_to_property",
                        property_id: propertyId,
                        wetu_id: String(formData.wetu_id).trim(),
                      },
                    });
                    if (error) throw error;
                    if (!data?.success) throw new Error(data?.error || "Import failed");

                    // Re-hydrate local form state from DB so the imported
                    // description/images/amenities are visible immediately and
                    // a subsequent Save doesn't overwrite the freshly-imported
                    // values with the stale formData snapshot.
                    const { data: fresh, error: refetchErr } = await supabase
                      .from("properties")
                      .select("description, short_description, images, amenities, latitude, longitude, address, city, country, external_metadata")
                      .eq("id", propertyId)
                      .single();
                    if (refetchErr) {
                      console.warn("[WETU] could not refresh form after import:", refetchErr.message);
                    } else if (fresh) {
                      setFormData((prev: any) => ({
                        ...prev,
                        description: fresh.description ?? prev.description,
                        short_description: fresh.short_description ?? prev.short_description,
                        images: fresh.images ?? prev.images,
                        amenities: fresh.amenities ?? prev.amenities,
                        latitude: fresh.latitude ?? prev.latitude,
                        longitude: fresh.longitude ?? prev.longitude,
                        address: fresh.address ?? prev.address,
                        city: fresh.city ?? prev.city,
                        country: fresh.country ?? prev.country,
                        external_metadata: fresh.external_metadata ?? prev.external_metadata,
                      }));
                      setIsDirty(false);
                    }

                    toast({
                      title: "WETU content imported",
                      description: `Updated: ${(data.updated_fields || []).join(", ") || "no new fields"}${data.image_count ? ` · ${data.image_count} images` : ""}`,
                    });
                  } catch (err: any) {
                    toast({
                      title: "WETU import failed",
                      description: err.message || "Could not import from WETU",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Cloud className="h-3 w-3" />
                Import from WETU
              </Button>
            )}
            <span className="text-[10px] text-muted-foreground">Available for any property — pulls description, images, amenities &amp; geo from WETU.</span>
          </div>
          <Separator className="my-3" />


          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="pms_system" className="text-xs whitespace-nowrap">PMS</Label>
              <Select
                value={selectedPMS || "none"}
                onValueChange={(value) => {
                  const newPMS = value === "none" ? "" : value;
                  if (newPMS === "hostfully" && selectedPMS !== "hostfully" && !ownerPmsCredentialId) {
                    setPreviousPMS(selectedPMS);
                    setShowHostfullyWarning(true);
                    return;
                  }
                  setSelectedPMS(newPMS);
                  if (newPMS === "roomsonline") setIsRolProperty(true);
                  else if (newPMS && newPMS !== "roomsonline") setIsRolProperty(false);
                  setIsDirty(true);
                }}
              >
                <SelectTrigger id="pms_system" className="h-7 text-xs w-[140px]"><SelectValue placeholder="Select PMS" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none"><span className="flex items-center gap-1 text-xs"><X className="h-3 w-3" />None</span></SelectItem>
                  {availablePMSSystems.map((pms) => {
                    const IconComponent = getPMSIcon(pms.system_type);
                    return (
                      <SelectItem key={pms.system_type} value={pms.system_type}>
                        <span className="flex items-center gap-1 text-xs"><IconComponent className="h-3 w-3" />{pms.name.replace(" API Key", "")}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedPMS && selectedPMS !== "none" && !isPMSFullyIntegrated(selectedPMS) && (
                <TooltipProvider><Tooltip><TooltipTrigger asChild><AlertTriangle className="h-4 w-4 text-amber-500 cursor-help" /></TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs"><p className="text-xs">
                    {getPMSIntegrationLevel(selectedPMS) === "partial"
                      ? `${getPMSDisplayName(selectedPMS)} integration is partially implemented.`
                      : `${getPMSDisplayName(selectedPMS)} integration has not been implemented yet.`}
                  </p></TooltipContent></Tooltip></TooltipProvider>
              )}
            </div>

            {selectedPMS === "nightsbridge" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="bb_id" className="text-xs">BBID</Label>
                <Input id="bb_id" value={formData.bb_id} onChange={(e) => handleInputChange("bb_id", e.target.value)} placeholder="13402" className="h-7 text-xs w-24" />
              </div>
            )}

            {selectedPMS === "semper" && (
              <>
                {["venue_id", "channel_id", "account_id", "agent_id"].map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <Label htmlFor={field} className="text-xs">{field.replace("_id", "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</Label>
                    <Input id={field} value={(formData as any)[field]} onChange={(e) => handleInputChange(field, e.target.value)} placeholder="ID" className="h-7 text-xs w-20" />
                  </div>
                ))}
              </>
            )}

            {selectedPMS === "benson" && (
              <>
                <div className="flex items-center gap-2">
                  <Label htmlFor="benson_property_code" className="text-xs whitespace-nowrap">Benson Code *</Label>
                  <Input id="benson_property_code" value={bensonPropertyCode} onChange={(e) => { setBensonPropertyCode(e.target.value); setIsDirty(true); }} placeholder="Property code" className="h-7 text-xs w-40" required />
                </div>
                {bensonPropertyCode && (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={syncFromBenson} disabled={isSyncingPms}>
                    <RefreshCw className={cn("h-3 w-3", isSyncingPms && "animate-spin")} />
                    {isSyncingPms ? "Syncing..." : "Sync"}
                  </Button>
                )}
              </>
            )}

            {selectedPMS === "cloudbeds" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="cloudbeds_property_id" className="text-xs whitespace-nowrap">Cloudbeds Property ID *</Label>
                <Input id="cloudbeds_property_id" value={cloudbedsPropertyId} onChange={(e) => { setCloudbedsPropertyId(e.target.value); setIsDirty(true); }} placeholder="Property ID" className="h-7 text-xs w-40" required />
              </div>
            )}

            {selectedPMS === "littlehotelier" && (
              <>
                <div className="flex items-center gap-2">
                  <Label htmlFor="littlehotelier_channel_code" className="text-xs whitespace-nowrap">Channel Code *</Label>
                  <Input id="littlehotelier_channel_code" value={littlehotelierChannelCode} onChange={(e) => { setLittlehotelierChannelCode(e.target.value); setIsDirty(true); }} placeholder="Channel code" className="h-7 text-xs w-32" required />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="littlehotelier_region" className="text-xs whitespace-nowrap">Region</Label>
                  <Select value={littlehotelierRegion} onValueChange={(v) => { setLittlehotelierRegion(v); setIsDirty(true); }}>
                    <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="apac">APAC</SelectItem><SelectItem value="emea">EMEA</SelectItem></SelectContent>
                  </Select>
                </div>
              </>
            )}

            {selectedPMS === "hotelbeds" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="hotelbeds_hotel_code" className="text-xs whitespace-nowrap">Hotel Code *</Label>
                <Input id="hotelbeds_hotel_code" value={hotelbedsHotelCode} onChange={(e) => { setHotelbedsHotelCode(e.target.value); setIsDirty(true); }} placeholder="HotelBeds hotel code" className="h-7 text-xs w-40" required />
              </div>
            )}

            {(selectedPMS === "hyperguest" || selectedPMS === "rolos" || selectedPMS === "roomsonline") && (
              <div className="flex items-center gap-2 flex-wrap">
                <Label htmlFor="hyperguest_hotel_id" className="text-xs whitespace-nowrap">
                  HyperGuest Hotel ID{selectedPMS === "hyperguest" ? " *" : ""}
                </Label>
                <Input
                  id="hyperguest_hotel_id"
                  value={hyperguestHotelId}
                  onChange={(e) => { setHyperguestHotelId(e.target.value); setIsDirty(true); }}
                  placeholder="e.g. 19912"
                  className="h-7 text-xs w-40"
                  required={selectedPMS === "hyperguest"}
                />
                <HyperGuestPropertyLookup
                  propertyId={propertyId}
                  propertyName={formData?.name ?? ""}
                  currentHotelId={hyperguestHotelId}
                  onSelect={(id) => { setHyperguestHotelId(id); setIsDirty(true); }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {selectedPMS === "hyperguest"
                    ? "Sandbox certification hotel: 19912"
                    : "Optional — links this ROL'OS property to a HyperGuest hotel for distribution."}
                </span>
                {propertyId && hyperguestHotelId && (
                  <HyperGuestSyncReflectionButton propertyId={propertyId} />
                )}
              </div>
            )}

            {selectedPMS === "hostfully" && !authLoading && isOwnerUser && (
              <div className="w-full mt-2">
                <OwnerPMSConnectionCard ownerId={user?.id || ""} ownerName={profile?.full_name || profile?.email || ""} ownerEmail={profile?.email || user?.email || ""} existingCredential={ownerHostfullyCredential} onCredentialChange={handleOwnerCredentialChange} />
              </div>
            )}

            {selectedPMS === "hostfully" && !authLoading && propertyId && (ownerPmsCredentialId || hostfullyPropertyUid) && (isAdmin || isDev || isFearlessLeader) && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="default" size="sm" className="h-7 text-xs gap-1" onClick={handleFullHostfullySync} disabled={fullSyncingHostfully}>
                    <RefreshCw className={cn("h-3 w-3", fullSyncingHostfully && "animate-spin")} />
                    {fullSyncingHostfully ? `Syncing... ${syncProgress?.current || 0}/${syncProgress?.total || '?'}` : "Full Sync"}
                  </Button>
                  {hostfullyRoomCount > 0 && (
                    <Badge variant="outline" className="text-xs h-5">{hostfullyRoomCount} rooms</Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Google Place ID and TripAdvisor IDs */}
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Label htmlFor="google_place_id" className="cursor-help flex items-center gap-1 text-xs">Google Place <Info className="h-3 w-3 text-muted-foreground" /></Label>
              </TooltipTrigger><TooltipContent><p className="text-xs">Google Place ID for reviews and maps integration</p></TooltipContent></Tooltip></TooltipProvider>
              <Input id="google_place_id" value={googlePlaceId} onChange={(e) => { setGooglePlaceId(e.target.value); setIsDirty(true); }} placeholder="ChIJ... or numeric" className="h-7 text-xs w-28" />
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setPlaceSearchOpen(true)} title="Search Google by name">
                <Sparkles className="h-3 w-3" /> Find
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Label htmlFor="tripadvisor_id" className="cursor-help flex items-center gap-1 text-xs">TripAdvisor <Info className="h-3 w-3 text-muted-foreground" /></Label>
              </TooltipTrigger><TooltipContent><p className="text-xs">Number after "d/" in TripAdvisor URL</p></TooltipContent></Tooltip></TooltipProvider>
              <Input id="tripadvisor_id" value={tripadvisorId} onChange={(e) => { setTripadvisorId(e.target.value); setIsDirty(true); }} placeholder="123456" className="h-7 text-xs w-24" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Property, Address & Map - Side by side layout */}
      <div className="flex gap-3 items-stretch">
        <div className="flex-1 flex flex-col gap-3">
          {/* Property Section */}
          <Card>
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Property</span>
                {selectedPMS && !isRolProperty && (
                  <div className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <div className="w-3 h-3 rounded bg-primary/10 border border-primary/30" />
                    <Cloud className="h-3 w-3" /><span>{getPMSDisplayName(selectedPMS)} synced</span>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <p className="col-span-full text-[11px] text-muted-foreground">{CHANNEL_MANDATORY_LEGEND}</p>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="name" className="text-xs">Name *</Label>
                  <Input id="name" value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} placeholder="Property name" required disabled={isFieldPopulatedByPMS("name", selectedPMS)} className={cn("h-7 text-xs", getPMSFieldClass("name", selectedPMS), channelMandatoryClass("name"), nameFeedback.status === "error" && "border-destructive focus-visible:ring-destructive", isFieldPopulatedByPMS("name", selectedPMS) && "cursor-not-allowed")} {...markerFlags(nameFeedback.status === "ok" && formData.name.trim().length > 0)} />
                  <ChannelFieldHint feedback={nameFeedback} />
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="property_type" className="text-xs flex items-center">Type *<ContextualHelp table="properties" field="property_type" /></Label>
                  <Select value={formData.property_type} onValueChange={(v) => handleInputChange("property_type", v)}>
                    <SelectTrigger id="property_type" className="h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {/* Options come from the channel's own property-type list so the master
                          type (and every unit inheriting it) is always publishable. */}
                      {channelTypeOptions.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(isAdmin || isDev || isFearlessLeader) && (
                  <>
                    <div className="flex items-center gap-2 pt-5">
                      <Checkbox id="is_rol_property" checked={isRolProperty} onCheckedChange={(c) => { setIsRolProperty(c as boolean); setIsDirty(true); }} />
                      <Label htmlFor="is_rol_property" className="text-xs cursor-pointer">ROL Property</Label>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox id="is_test_property" checked={isTestProperty} onCheckedChange={(c) => { setIsTestProperty(c as boolean); setIsDirty(true); }} />
                      <Label htmlFor="is_test_property" className="text-xs cursor-pointer text-warning" title="Marker only: behaves as a normal property, including channel syncs.">⚠ Test</Label>
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="telephone" className="text-xs">Telephone</Label>
                  <Input id="telephone" value={formData.telephone} onChange={(e) => handleInputChange("telephone", e.target.value)} placeholder="+27..." className="h-7 text-xs" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="contact_email" className="text-xs">Contact Email *</Label>
                  <Input id="contact_email" type="email" value={formData.contact_email} onChange={(e) => handleInputChange("contact_email", e.target.value)} placeholder="email@example.com" required className="h-7 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="currency" className="text-xs">Currency *</Label>
                  <Select value={formData.currency} onValueChange={(v) => handleInputChange("currency", v)}>
                    <SelectTrigger id="currency" className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["ZAR","USD","EUR","GBP","BWP","MZN","NAD","KES","TZS","MUR","SCR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                 <div className="flex flex-col gap-1" data-field="owner_email">
                   <Label htmlFor="owner_email" className="text-xs">Owner</Label>

                  <Popover open={ownerSearchOpen} onOpenChange={setOwnerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={ownerSearchOpen} className="h-7 text-xs justify-between w-full font-normal">
                        {formData.owner_email ? owners.find((o: any) => o.email === formData.owner_email)?.full_name || formData.owner_email : "Select owner…"}
                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search by name, email or phone…" className="text-xs h-8" />
                        <CommandList>
                          <CommandEmpty className="py-3 text-xs text-center text-muted-foreground">No owner found.</CommandEmpty>
                          <CommandGroup>
                            {formData.owner_email && !owners.find((o: any) => o.email === formData.owner_email) && (
                              <CommandItem value={formData.owner_email} onSelect={() => setOwnerSearchOpen(false)} className="text-xs">
                                <Check className="mr-2 h-3 w-3 opacity-100" />
                                <div className="flex flex-col"><span>{formData.owner_email}</span><span className="text-[10px] text-muted-foreground">Profile pending</span></div>
                              </CommandItem>
                            )}
                            {owners.map((owner: any) => (
                              <CommandItem key={owner.id} value={`${owner.full_name || ""} ${owner.email} ${owner.phone || ""}`} onSelect={() => { handleInputChange("owner_email", owner.email); handleInputChange("owner_name", owner.full_name || ""); setOwnerSearchOpen(false); }} className="text-xs">
                                <Check className={cn("mr-2 h-3 w-3", formData.owner_email === owner.email ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium truncate">{owner.full_name || "—"}</span>
                                  <span className="text-[10px] text-muted-foreground truncate">{owner.email}</span>
                                  {owner.phone && <span className="text-[10px] text-muted-foreground truncate">{owner.phone}</span>}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {propertyId && (isAdmin || isDev || isFearlessLeader) && (
                  <div className="flex flex-col gap-1 col-span-2">
                    <Label className="text-xs">Additional Owners</Label>
                    {linkedOwners.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {linkedOwners.map((lo: any) => (
                          <Badge key={lo.id} variant="secondary" className="text-xs gap-1 pr-1">
                            {lo.owner_name || lo.owner_email}
                            <button type="button" className="ml-0.5 hover:text-destructive" onClick={async () => {
                              const { error } = await supabase.from("property_owners").delete().eq("id", lo.id);
                              if (!error) {
                                setLinkedOwners((prev: any[]) => prev.filter((o: any) => o.id !== lo.id));
                                toast({ title: "Owner removed", description: `${lo.owner_email} unlinked from property` });
                              }
                            }}><X className="h-3 w-3" /></button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <Input placeholder="Search owners to add..." value={linkedOwnerSearch} onChange={(e) => setLinkedOwnerSearch(e.target.value)} className="h-7 text-xs" />
                      {linkedOwnerSearch.length >= 2 && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {owners.filter((o: any) => {
                            if (o.email === formData.owner_email) return false;
                            if (linkedOwners.some((lo: any) => lo.user_id === o.id)) return false;
                            const q = linkedOwnerSearch.toLowerCase();
                            return o.email?.toLowerCase().includes(q) || o.full_name?.toLowerCase().includes(q);
                          }).slice(0, 8).map((o: any) => (
                            <button key={o.id} type="button" className="w-full text-left px-2 py-1.5 hover:bg-accent text-xs" onClick={async () => {
                              if (!propertyId) return;
                              const { data, error } = await supabase.from("property_owners").insert({ property_id: propertyId, user_id: o.id, owner_email: o.email, owner_name: o.full_name || null }).select().single();
                              if (!error && data) {
                                setLinkedOwners((prev: any[]) => [...prev, data]);
                                setLinkedOwnerSearch("");
                                toast({ title: "Owner linked", description: `${o.email} added to property` });
                              }
                            }}>
                              <span className="font-medium">{o.full_name || "—"}</span>
                              <span className="text-muted-foreground ml-1">{o.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <Label htmlFor="property_url" className="text-xs">Website URL</Label>
                  <div className="flex gap-2">
                    <Input id="property_url" value={formData.property_url} onChange={(e) => handleInputChange("property_url", e.target.value)} placeholder="https://yourproperty.com" className="h-7 text-xs flex-1" />
                    {formData.property_url && (
                      <Button type="button" variant="outline" size="sm" onClick={async () => {
                        if (!formData.property_url) return;
                        setWebsiteSyncing(true);
                        try {
                          const result = await syncFromWebsite(propertyId || "new-property", formData.property_url, formData as unknown as Record<string, unknown>);
                          if (result.suggestions && result.suggestions.length > 0) {
                            setWebsiteSyncSuggestions(result.suggestions);
                            setWebsiteSyncUrl(formData.property_url);
                            setWebsiteSyncModalOpen(true);
                          } else {
                            toast({ title: "No suggestions", description: "The website scan didn't find any new data to import." });
                          }
                        } catch (err: any) {
                          toast({ title: "Scan failed", description: err.message || "Failed to scan website", variant: "destructive" });
                        } finally {
                          setWebsiteSyncing(false);
                        }
                      }} disabled={websiteSyncing} className="h-7 gap-1 text-xs">
                        {websiteSyncing ? (<><RefreshCw className="h-3 w-3 animate-spin" />Scanning...</>) : (<><Sparkles className="h-3 w-3" />Auto-fill</>)}
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Scan the website to auto-fill empty fields</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address Section */}
          <Card>
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Address</span>
                <div className="flex items-center gap-2">
                  <Label htmlFor="no_street_address" className="text-xs text-muted-foreground font-normal">No street address?</Label>
                  <Switch id="no_street_address" checked={noStreetAddress} onCheckedChange={(c) => { setNoStreetAddress(c); setIsDirty(true); }} />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-4">
              {!noStreetAddress && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="address" className="text-xs">Street *</Label>
                    <Input id="address" value={formData.address} onChange={(e) => handleInputChange("address", e.target.value)} placeholder="Street address" required={!noStreetAddress} disabled={isFieldPopulatedByPMS("address", selectedPMS)} className={cn("h-7 text-xs", getPMSFieldClass("address", selectedPMS), channelMandatoryClass("address"), streetFeedback.status === "error" && "border-destructive focus-visible:ring-destructive", isFieldPopulatedByPMS("address", selectedPMS) && "cursor-not-allowed")} {...markerFlags(noStreetAddress || (streetFeedback.status !== "error" && formData.address.trim().length > 0))} />
                    <ChannelFieldHint feedback={streetFeedback} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="suburb" className="text-xs">Suburb</Label>
                    <Input id="suburb" value={formData.suburb} onChange={(e) => handleInputChange("suburb", e.target.value)} placeholder="Suburb" className="h-7 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="city" className="text-xs">City *</Label>
                    <Input id="city" value={formData.city} onChange={(e) => handleInputChange("city", e.target.value)} placeholder="City" required={!noStreetAddress} disabled={isFieldPopulatedByPMS("city", selectedPMS)} className={cn("h-7 text-xs", getPMSFieldClass("city", selectedPMS), channelMandatoryClass("city"), isFieldPopulatedByPMS("city", selectedPMS) && "cursor-not-allowed")} {...markerFlags(formData.city.trim().length > 0)} />
                    <ChannelFieldHint feedback={cityFeedback} />
                  </div>
                  <div className="flex flex-col gap-1" data-field="country">
                    <Label htmlFor="country" className="text-xs">Country *</Label>

                    <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={countryOpen} className={cn("h-7 text-xs w-full justify-between font-normal", getPMSFieldClass("country", selectedPMS), channelMandatoryClass("country"))} {...markerFlags(!!formData.country)} disabled={isFieldPopulatedByPMS("country", selectedPMS)}>
                          {formData.country || "Select country..."}<ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command><CommandInput placeholder="Search country..." /><CommandList><CommandEmpty>No country found.</CommandEmpty><CommandGroup>
                          {COUNTRY_OPTIONS.map((c) => (<CommandItem key={c.value} value={c.label} onSelect={() => { handleInputChange("country", c.label); setCountryOpen(false); }}>
                            <Check className={cn("mr-2 h-3 w-3", formData.country === c.label ? "opacity-100" : "opacity-0")} />{c.label}
                          </CommandItem>))}
                        </CommandGroup></CommandList></Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="postal_code" className="text-xs">Code</Label>
                    <Input id="postal_code" value={formData.postal_code} onChange={(e) => handleInputChange("postal_code", e.target.value)} placeholder="Postal code" disabled={isFieldPopulatedByPMS("postal_code", selectedPMS)} className={cn("h-7 text-xs", getPMSFieldClass("postal_code", selectedPMS), channelMandatoryClass("postal_code"), postalFeedback.status === "error" && "border-destructive focus-visible:ring-destructive", isFieldPopulatedByPMS("postal_code", selectedPMS) && "cursor-not-allowed")} {...markerFlags(postalFeedback.status !== "error" && formData.postal_code.trim().length > 0)} />
                    <ChannelFieldHint feedback={postalFeedback} />
                  </div>
                </div>
              )}
              <div className="mt-3">
                <ChannelLocationLockNotice propertyId={propertyId} />
              </div>
              <div className={cn("grid gap-3 mt-3", noStreetAddress ? "grid-cols-1" : "grid-cols-2 md:grid-cols-4")} data-field="geo">
                <div className="flex flex-col gap-1">

                  <Label htmlFor="latitude_input" className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" />Latitude</Label>
                  <Input id="latitude_input" type="number" step="any" value={latitude ?? ""} onChange={(e) => { setLatitude(e.target.value ? parseFloat(e.target.value) : null); setIsDirty(true); }} placeholder="-34.0522" className={cn("h-7 text-xs font-mono", channelMandatoryClass("latitude"))} {...markerFlags(Number.isFinite(Number(latitude)) && latitude !== null)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="longitude_input" className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" />Longitude</Label>
                  <Input id="longitude_input" type="number" step="any" value={longitude ?? ""} onChange={(e) => { setLongitude(e.target.value ? parseFloat(e.target.value) : null); setIsDirty(true); }} placeholder="18.4241" className={cn("h-7 text-xs font-mono", channelMandatoryClass("longitude"))} {...markerFlags(Number.isFinite(Number(longitude)) && longitude !== null)} />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <ChannelFieldHint feedback={coordsFeedback} compact={false} />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <Label htmlFor="google_maps_link" className="text-xs">Google Maps Link {noStreetAddress && '*'}</Label>
                  <div className="flex items-center gap-2">
                    <Input id="google_maps_link" value={googleMapsLink} onChange={(e) => handleGoogleMapsLinkChange(e.target.value)} placeholder="Paste Google Maps link to extract GPS" className="flex-1 h-7 text-xs font-mono" required={noStreetAddress} />
                    {googleMapsLink && latitude && longitude && <span className="text-xs text-success flex items-center gap-1"><Check className="h-3 w-3" /></span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-1/4 min-w-[200px] flex">
          <Card className="flex-1 flex flex-col p-2">
            <PropertyMap address={formData.address} suburb={formData.suburb} city={formData.city} country={formData.country} latitude={latitude} longitude={longitude} onLocationUpdate={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} />
          </Card>
        </div>
      </div>

      {/* Property Surroundings */}
      <Card>
        <CardHeader className="py-2 px-4"><CardTitle className="text-sm">Property Surroundings</CardTitle></CardHeader>
        <CardContent className="py-2 px-4 space-y-3">
          {[
            { label: "Restaurants & Cafes", field: "restaurants_cafes", distField: "restaurants_cafes_distance" },
            { label: "Public Transport", field: "public_transport", distField: "public_transport_distance" },
            { label: "Closest Airport", field: "closest_airport", distField: "closest_airport_distance" },
          ].map(({ label, field, distField }) => (
            <div key={field} className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={field} className="text-xs text-muted-foreground">{label}</Label>
                <Input id={field} value={(formData as any)[field]} onChange={(e) => handleInputChange(field, e.target.value)} placeholder={`e.g., ${label}`} className="h-7 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={distField} className="text-xs text-muted-foreground">Distance</Label>
                <Input id={distField} value={(formData as any)[distField]} onChange={(e) => handleInputChange(distField, e.target.value)} placeholder="e.g., 2 km" className="h-7 text-xs" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Business Registration */}
      {selectedPMS !== "nightsbridge" && (
        <Card>
          <CardHeader className="py-2 px-4"><CardTitle className="text-sm">Business Registration</CardTitle></CardHeader>
          <CardContent className="py-2 px-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="registered_business_name" className="text-xs">Registered Business Name</Label>
                <Input id="registered_business_name" value={registeredBusinessName} onChange={(e) => { setRegisteredBusinessName(e.target.value); setIsDirty(true); }} placeholder="e.g., Safari Lodge (Pty) Ltd" className="h-7 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="mobile_number" className="text-xs">Mobile Number</Label>
                <Input id="mobile_number" value={mobileNumber} onChange={(e) => { setMobileNumber(e.target.value); setIsDirty(true); }} placeholder="e.g., +27 82 123 4567" className="h-7 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="key_representative" className="text-xs">Key Representative</Label>
                <Input id="key_representative" value={keyRepresentative} onChange={(e) => { setKeyRepresentative(e.target.value); setIsDirty(true); }} placeholder="e.g., John Smith" className="h-7 text-xs" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="postal_address" className="text-xs">Postal Address</Label>
              <Textarea id="postal_address" value={postalAddress} onChange={(e) => { setPostalAddress(e.target.value); setIsDirty(true); }} placeholder="e.g., PO Box 123, Hoedspruit, 1380" className="text-xs min-h-[50px]" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Banking Details */}
      {selectedPMS !== "nightsbridge" && (
        <Card>
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Banking Details</span>
              <div className="flex items-center gap-2">
                <Label htmlFor="has_vat" className="text-xs text-muted-foreground font-normal">VAT Registered?</Label>
                <Switch id="has_vat" checked={formData.has_vat} onCheckedChange={(c) => handleInputChange("has_vat", c)} />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="banking_currency" className="text-xs">Currency *</Label>
                <Select value={formData.currency || "ZAR"} onValueChange={(v) => handleInputChange("currency", v)}>
                  <SelectTrigger id="banking_currency" className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{["ZAR","USD","EUR","GBP","BWP","MZN","NAD","KES","TZS","MUR","SCR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {formData.has_vat && <div className="flex flex-col gap-1"><Label htmlFor="vat_number" className="text-xs">VAT #</Label><Input id="vat_number" value={formData.vat_number} onChange={(e) => handleInputChange("vat_number", e.target.value)} placeholder="VAT number" className="h-7 text-xs" /></div>}
              {[
                { id: "property_registration", label: "Reg #" },
                { id: "bank_name", label: "Bank" },
                { id: "branch_code", label: "Branch" },
              ].map(f => (
                <div key={f.id} className="flex flex-col gap-1" data-field={f.id === "property_registration" ? "property_registration" : f.id === "bank_name" ? "banking" : undefined}><Label htmlFor={f.id} className="text-xs">{f.label}</Label><Input id={f.id} value={(formData as any)[f.id]} onChange={(e) => handleInputChange(f.id, e.target.value)} placeholder={f.label} className="h-7 text-xs" /></div>
              ))}

            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: "account_holder", label: "Holder" },
                { id: "account_number", label: "Account #" },
                { id: "account_type", label: "Type" },
                { id: "swift_code", label: "SWIFT" },
              ].map(f => (
                <div key={f.id} className="flex flex-col gap-1"><Label htmlFor={f.id} className="text-xs">{f.label}</Label><Input id={f.id} value={(formData as any)[f.id]} onChange={(e) => handleInputChange(f.id, e.target.value)} placeholder={f.label} className="h-7 text-xs" /></div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Switch id="accepts_bitcoin" checked={formData.accepts_bitcoin} onCheckedChange={(c) => handleInputChange("accepts_bitcoin", c)} />
                <Label htmlFor="accepts_bitcoin" className="text-xs">Bitcoin</Label>
              </div>
              {formData.accepts_bitcoin && (
                <div className="flex flex-col gap-1 col-span-3"><Label htmlFor="bitcoin_wallet_address" className="text-xs">Wallet Address</Label><Input id="bitcoin_wallet_address" value={formData.bitcoin_wallet_address} onChange={(e) => handleInputChange("bitcoin_wallet_address", e.target.value)} placeholder="Bitcoin wallet address" className="h-7 text-xs font-mono" /></div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contract Management */}
      {propertyId && (
        <ContractManagementPanel propertyId={propertyId} propertyName={formData.name} ownerEmail={formData.owner_email} ownerName={formData.owner_name} isRolProperty={isRolProperty} />
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>Cancel</Button>
        {isDirty && <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}><Save className="mr-1 h-3 w-3" />{loading ? "Saving..." : "Save"}</Button>}
      </div>

      {/* Website Sync Modal */}
      <WebsiteSyncModal
        open={websiteSyncModalOpen}
        onOpenChange={setWebsiteSyncModalOpen}
        suggestions={websiteSyncSuggestions}
        scrapedUrl={websiteSyncUrl}
        onApply={(appliedSuggestions) => {
          for (const s of appliedSuggestions) {
            if (s.stateVariable && s.suggested !== undefined) handleInputChange(s.stateVariable.replace("formData.", ""), s.suggested);
          }
          setIsDirty(true);
          toast({ title: "Fields updated", description: `${appliedSuggestions.length} field(s) applied from website scan` });
        }}
      />

      <GooglePlaceSearchDialog
        open={placeSearchOpen}
        onOpenChange={setPlaceSearchOpen}
        initialQuery={[formData.name, formData.city, formData.country].filter(Boolean).join(" ")}
        onSelect={(id) => { setGooglePlaceId(id); setIsDirty(true); }}
      />
    </form>
  );
}
