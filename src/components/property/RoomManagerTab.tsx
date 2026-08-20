/**
 * RoomManagerTab — Extracted from PropertyForm.tsx (Sub-phase 1A)
 * Manages room type CRUD, bed configuration, facilities, amenities, images, and agreements.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RoomTypeDataViewer, RateTypeItem } from "@/components/ExpandableDataViewer";
import RUAmenityPicker from "@/components/property/RUAmenityPicker";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validateImageDimensions, getValidationErrorMessage, MIN_IMAGE_WIDTH, MIN_IMAGE_HEIGHT } from "@/lib/imageValidation";
import { useImageDimensionAudit } from "@/hooks/useImageDimensionAudit";
import {
  BedCapacityHint,
  CharacterCounterHint,
  DescriptionShortfallHint,
  ImageAuditSummary,
  KitchenHint,
  RECOMMENDED_DESCRIPTION_CHARS,
} from "@/components/property/ContentRuleHint";
import { listDeclaresKitchen } from "@/config/propertyFieldRequirements";
import { ruToken } from "@/lib/ruAmenities";
import { ImageQualityMarker } from "@/components/property/ImageQualityMarker";
import RuImageTagPicker from "@/components/property/RuImageTagPicker";
import { findMainImageUrl, normalizeRuImageTagMap, setMainImageUrl } from "@/lib/ruImageTags";

import { getRoomUrl } from "@/lib/config";
import { parseBedConfiguration, BED_TYPES, BedEntry, calculateBedCapacity, sleepsPerBed, formatBedConfiguration, authoredBedroomCount } from "@/lib/bedConfig";
import { BedComposition } from "@/components/property/BedComposition";

import { cn } from "@/lib/utils";
import { isFieldPopulatedByPMS, getPMSDisplayName } from "@/lib/pmsFieldConfig";
import { ChannelFieldHint } from "@/components/property/ChannelFieldHint";
import { checkChannelName } from "@/lib/channelFieldRules";
import { channelMandatoryClass } from "@/lib/channelMandatoryFields";
import { markerFlags } from "@/lib/fieldMarkers";
import { UNIT_ROW_RULES } from "@/config/propertyFieldRequirements";
import {
  CHANGEOVER_CODES,
  normalizeChannelPropertyType,
  resolveUnitChannelType,
} from "@/config/channelPropertyTypes";
import { useChannelPropertyTypes } from "@/hooks/useChannelPropertyTypes";
import { TagInput } from "@/components/TagInput";
import { HostfullyRoomDetails } from "@/components/pms/HostfullyRoomDetails";
import { ACCOMMODATION_LABEL_OPTIONS, ACCOMMODATION_TYPES, type AccommodationLabelKey } from "@/lib/accommodationLabels";
import {
  Home, Plus, Minus, X, Copy, Cloud, Upload, Heart, Trash2, RefreshCw, Info, DollarSign, Sparkles,
  Loader2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import AiAmenityDialog from "@/components/property/AiAmenityDialog";
import { queueChannelContentSync } from "@/lib/channelContentSync";


// ─── Props ──────────────────────────────────────────────────────────────────
export interface RoomManagerTabProps {
  propertyId: string | null;
  propertySlug: string;
  propertyWebsiteUrl?: string | null;
  /** Master channel property type authored in Identity & Location — units inherit it. */
  propertyChannelType?: string | null;
  routeId: string | undefined; // useParams().id

  roomTypes: any[];
  setRoomTypes: React.Dispatch<React.SetStateAction<any[]>>;
  selectedRoomType: string;
  setSelectedRoomType: React.Dispatch<React.SetStateAction<string>>;
  selectedPMS: string;
  isRolProperty: boolean;
  pmsRateTypes: any[];
  accommodationLabel: string;
  homeIconOpenNewTab: boolean;
  isDev: boolean;
  isFearlessLeader: boolean;
  setIsDirty: (dirty: boolean) => void;
  mealTypeSuggestions: string[];
  handleNewMealType: (mealType: string) => Promise<void>;
}

export const MIN_ROOM_DESCRIPTION_CHARS = 700;

// ─── Helpers (moved from PropertyForm) ──────────────────────────────────────
const SUPPORTED_ROOM_IMAGE_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/svg+xml", "image/avif",
];

function ensureArray(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return [];
}

// ─── Component ──────────────────────────────────────────────────────────────
export function RoomManagerTab({
  propertyId,
  propertySlug,
  propertyWebsiteUrl,
  propertyChannelType,
  routeId,
  roomTypes,
  setRoomTypes,
  selectedRoomType,
  setSelectedRoomType,
  selectedPMS,
  isRolProperty,
  pmsRateTypes,
  accommodationLabel,
  homeIconOpenNewTab,
  isDev,
  isFearlessLeader,
  setIsDirty,
  mealTypeSuggestions,
  handleNewMealType,
}: RoomManagerTabProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isRoomImageUploading, setIsRoomImageUploading] = useState(false);
  const [aiUnitAmenityOpen, setAiUnitAmenityOpen] = useState(false);
  const channelTypes = useChannelPropertyTypes();

  useEffect(() => {
    const requestedRoom = searchParams.get("room")?.trim().toLowerCase();
    if (!requestedRoom) return;
    const match = roomTypes.find((room) => String(room.name ?? "").trim().toLowerCase() === requestedRoom);
    if (match?.id) setSelectedRoomType(String(match.id));
  }, [roomTypes, searchParams, setSelectedRoomType]);

  const roomImageAudit = useImageDimensionAudit(
    (roomTypes.find((r) => r.id === selectedRoomType)?.images || []) as string[],
  );

  // ── Room CRUD ────────────────────────────────────────────────────────────
  const addRoomType = () => {
    const newRoom = {
      id: Date.now().toString(),
      name: `New ${accommodationLabel ? ACCOMMODATION_LABEL_OPTIONS.find(o => o.value === accommodationLabel)?.label || "Room" : "Room"} Type`,
      url: "",
      selected: false,
      numRooms: 1,
      pmsRoomType: "",
      pmsRoomId: "",
      description: "",
      extraPersonPolicy: "",
      bedConfiguration: [] as BedEntry[],
      roomSize: 0,
      floor: 0,
      bathrooms: 1,
      toilets: 1 as number | null,
      separateKitchen: false,
      // Channel-mandatory: the type the Channel Manager maps to ObjectTypeID.
      channelPropertyType: "",
      // null = inherit the property master changeover rule.
      changeover: null as number | null,

      maxPeople: 2,
      maxAdults: 2,
      maxChildren: 0,
      minStay: 1,
      maxStay: 0,
      rateType: "per-unit",
      splitPercent: 0,
      images: [] as string[],
      facilities: [] as string[],
      amenities: [] as string[],
      linkedRateTypes: [] as number[],
      mealTypes: [] as string[],
    };
    setRoomTypes(prev => [...prev, newRoom]);
    setSelectedRoomType(newRoom.id);
    setIsDirty(true);
  };

  const deleteRoomType = (id: string) => {
    const filtered = roomTypes.filter((r) => r.id !== id);
    setRoomTypes(filtered);
    if (selectedRoomType === id && filtered.length > 0) {
      setSelectedRoomType(filtered[0].id);
    }
    setIsDirty(true);
  };

  const updateRoomTypeName = (id: string, name: string) => {
    setRoomTypes(prev => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    setIsDirty(true);
  };


  const updateRoomTypeField = (id: string, field: string, value: any) => {
    setRoomTypes(prev => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setIsDirty(true);
  };

  const toggleRoomRateTypeLink = (roomId: string, rateTypeId: number | string) => {
    setRoomTypes(prev =>
      prev.map((room) => {
        if (room.id === roomId) {
          const linked = room.linkedRateTypes || [];
          const isLinked = linked.includes(rateTypeId);
          return {
            ...room,
            linkedRateTypes: isLinked
              ? linked.filter((id: number | string) => id !== rateTypeId)
              : [...linked, rateTypeId],
          };
        }
        return room;
      }),
    );
    setIsDirty(true);
  };

  const getRoomLinkedRateTypes = (roomId: string): (number | string)[] => {
    const room = roomTypes.find((r) => r.id === roomId);
    return room?.linkedRateTypes || [];
  };

  const toggleRoomActive = async (roomId: string) => {
    const room = roomTypes.find((r) => r.id === roomId);
    if (!room) return;

    const newActive = !room.is_active;
    const timestamp = new Date().toISOString();
    const roomName = String(room.name || "").trim();
    const normalizedRoomName = roomName.toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId);

    setRoomTypes((prev) => prev.map((r) => (r.id === roomId ? { ...r, is_active: newActive } : r)));

    const syncErrors: Array<{ source: string; error: unknown }> = [];
    let canonicalUpdates = 0;
    let amenitiesSynced = false;

    const updateCanonicalByName = async (table: "hostfully_room_types" | "rolos_room_types") => {
      if (!propertyId || !roomName) return 0;
      const { data, error } = await supabase
        .from(table as any)
        .update({ is_active: newActive, updated_at: timestamp } as any)
        .eq("property_id", propertyId)
        .ilike("name", roomName)
        .select("id");
      if (error) { syncErrors.push({ source: table, error }); return 0; }
      return data?.length || 0;
    };

    const updateCanonicalById = async (table: "hostfully_room_types" | "rolos_room_types") => {
      const { data, error } = await supabase
        .from(table as any)
        .update({ is_active: newActive, updated_at: timestamp } as any)
        .eq("id", roomId)
        .select("id");
      if (error) { syncErrors.push({ source: table, error }); return 0; }
      return data?.length || 0;
    };

    if (propertyId && roomName) {
      const [hostfullyCount, rolosCount] = await Promise.all([
        updateCanonicalByName("hostfully_room_types"),
        updateCanonicalByName("rolos_room_types"),
      ]);
      canonicalUpdates += hostfullyCount + rolosCount;
    }

    if (canonicalUpdates === 0 && isUuid) {
      canonicalUpdates += await updateCanonicalById("hostfully_room_types");
      if (canonicalUpdates === 0) {
        canonicalUpdates += await updateCanonicalById("rolos_room_types");
      }
    }

    if (propertyId) {
      const { data: propData, error: propError } = await supabase
        .from("properties")
        .select("amenities")
        .eq("id", propertyId)
        .single();
      if (propError) {
        syncErrors.push({ source: "properties", error: propError });
      } else {
        const amenities = (propData?.amenities as any) || {};
        const currentRoomTypes = Array.isArray(amenities.room_types) ? amenities.room_types : [];
        const updatedRoomTypes = currentRoomTypes.map((rt: any) => {
          const sameId = String(rt?.id) === String(roomId);
          const sameName = String(rt?.name || "").trim().toLowerCase() === normalizedRoomName;
          return sameId || sameName ? { ...rt, is_active: newActive } : rt;
        });
        const { error: amenityError } = await supabase
          .from("properties")
          .update({ amenities: { ...amenities, room_types: updatedRoomTypes } })
          .eq("id", propertyId);
        if (amenityError) { syncErrors.push({ source: "properties", error: amenityError }); }
        else { amenitiesSynced = true; }
      }
    }

    if (!amenitiesSynced && canonicalUpdates === 0) {
      console.error("[toggleRoomActive] Sync failed:", syncErrors);
      setRoomTypes((prev) => prev.map((r) => (r.id === roomId ? { ...r, is_active: !newActive } : r)));
      toast({ title: "Error", description: "Failed to update room status", variant: "destructive" });
      return;
    }

    if (canonicalUpdates === 0) {
      console.warn("[toggleRoomActive] No canonical room rows matched; editor metadata was updated only", {
        propertyId, roomId, roomName,
      });
    }

    // Activating or hiding a unit changes the channel inventory for this listing.
    void queueChannelContentSync(propertyId, "unit_active_toggle");

    toast({
      title: newActive ? "Room Activated" : "Room Deactivated",
      description: `${room.name} is now ${newActive ? "visible" : "hidden"} on booking pages`,
    });
  };

  const isRoomFieldPmsSynced = (roomId: string, fieldName: string): boolean => {
    if (isRolProperty) return false;
    const room = roomTypes.find((r) => r.id === roomId);
    const syncedFields = ensureArray(room?.pms_synced_fields);
    return syncedFields.includes(fieldName);
  };

  const getRoomPmsFieldClass = (roomId: string, fieldName: string): string => {
    if (isRoomFieldPmsSynced(roomId, fieldName)) return "bg-primary/5 border-primary/20";
    return "";
  };

  // ── TOBI room description ────────────────────────────────────────────────
  const [writingRoomDescription, setWritingRoomDescription] = useState(false);
  const selectedRoom = useMemo(
    () => roomTypes.find((r) => r.id === selectedRoomType) || null,
    [roomTypes, selectedRoomType],
  );
  // Explicit main photo for this unit (channel ImageTypeID 1).
  const roomMainImageUrl = useMemo(
    () =>
      findMainImageUrl(
        normalizeRuImageTagMap(selectedRoom?.ruImageTags),
        ensureArray(selectedRoom?.images) as string[],
      ),
    [selectedRoom],
  );
  const roomDescriptionLength = (selectedRoom?.description ?? "").trim().length;
  const roomDescriptionTooShort = roomDescriptionLength < MIN_ROOM_DESCRIPTION_CHARS;
  const roomDescriptionPmsSynced = isRoomFieldPmsSynced(selectedRoomType, "description");

  const writeRoomDescriptionWithTobi = useCallback(async () => {
    if (!selectedRoom) return;
    setWritingRoomDescription(true);
    try {
      const { data, error } = await supabase.functions.invoke("editorial-ai-assist", {
        body: {
          action: "generate_room_description",
          minChars: MIN_ROOM_DESCRIPTION_CHARS,
          propertyContext: {
            name: selectedRoom.name,
            description: selectedRoom.description,
            maxPeople: selectedRoom.maxPeople,
            bedConfiguration: formatBedConfiguration(selectedRoom.bedConfiguration),
            roomSize: selectedRoom.roomSize,
            facilities: selectedRoom.facilities,
            amenities: selectedRoom.amenities,
            propertyType: accommodationLabel
              ? ACCOMMODATION_LABEL_OPTIONS.find((o) => o.value === accommodationLabel)?.label
              : undefined,
          },
        },
      });
      if (error) throw error;
      const text: string = (data?.description ?? "").trim();
      if (!text) throw new Error("TOBI returned no text");
      updateRoomTypeField(selectedRoom.id, "description", text);
      toast({
        title: text.length >= MIN_ROOM_DESCRIPTION_CHARS ? "TOBI wrote the description" : "Description still too short",
        description: text.length >= MIN_ROOM_DESCRIPTION_CHARS
          ? `${text.length} characters — review and save.`
          : `TOBI wrote ${text.length} characters — still under the ${MIN_ROOM_DESCRIPTION_CHARS} minimum, please expand.`,
      });
    } catch (err) {
      toast({
        title: "TOBI could not write the description",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWritingRoomDescription(false);
    }
  }, [selectedRoom, accommodationLabel, updateRoomTypeField, toast]);



  const handleRoomImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!propertyId) {
      toast({ title: "Upload failed", description: "Property must be saved before uploading room images", variant: "destructive" });
      return;
    }

    const supportedFiles: File[] = [];
    const unsupportedNames: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (SUPPORTED_ROOM_IMAGE_TYPES.includes(file.type) || (file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif")) {
        supportedFiles.push(file);
      } else {
        unsupportedNames.push(file.name);
      }
    }

    if (unsupportedNames.length > 0) {
      toast({
        title: `${unsupportedNames.length} file(s) skipped`,
        description: `Unsupported format: ${unsupportedNames.join(", ")}. Use JPG, PNG, WebP, or GIF.`,
        variant: "destructive",
      });
    }

    if (supportedFiles.length === 0) return;

    // Validate dimensions before uploading
    const validFiles: File[] = [];
    for (const file of supportedFiles) {
      const dims = await validateImageDimensions(file);
      if (!dims.valid) {
        toast({ title: "Image too small", description: getValidationErrorMessage(file.name, dims.width, dims.height), variant: "destructive" });
      } else {
        validFiles.push(file);
      }
    }
    if (validFiles.length === 0) { return; }

    setIsRoomImageUploading(true);
    const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
    const existingImages = [...(currentRoom?.images || [])];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `room-${selectedRoomType}-${Date.now()}-${i}.${fileExt}`;
        const filePath = `${propertyId}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from("property-images").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("property-images").getPublicUrl(filePath);
        existingImages.push(publicUrl);
      } catch (error: any) {
        console.error("Room image upload error:", error);
        toast({ title: "Upload failed", description: error?.message || `Failed to upload ${file.name}`, variant: "destructive" });
      }
    }

    setRoomTypes(prev => prev.map((r) => (r.id === selectedRoomType ? { ...r, images: existingImages } : r)));
    setIsDirty(true);
    setIsRoomImageUploading(false);

    if (supportedFiles.length > 0 && unsupportedNames.length > 0) {
      toast({ title: "Upload complete", description: `${supportedFiles.length} image(s) uploaded successfully.` });
    }
  };

  const removeRoomImage = (imageUrl: string) => {
    const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
    const updatedImages = (currentRoom?.images || []).filter((img: string) => img !== imageUrl);
    setRoomTypes(prev => prev.map((r) => (r.id === selectedRoomType ? { ...r, images: updatedImages } : r)));
    setIsDirty(true);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-2 items-start">
      {/* Left Sidebar - Room Types List */}
      <div className="w-56 shrink-0 self-stretch border-r bg-muted/30 p-2 space-y-1 md:sticky md:top-2 md:max-h-[calc(100vh-140px)] md:overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <h3 className="font-semibold text-xs">
              {(accommodationLabel ? ACCOMMODATION_LABEL_OPTIONS.find(o => o.value === accommodationLabel)?.label?.toUpperCase() : "ROOM")} TYPES
            </h3>
            {selectedPMS && !isRolProperty && isFieldPopulatedByPMS("room_types", selectedPMS) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Cloud className="h-3 w-3 text-primary" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Synced from {getPMSDisplayName(selectedPMS)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={addRoomType}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {[...roomTypes].sort((a, b) => a.name.localeCompare(b.name)).map((room) => (
          <div
            key={room.id}
            /* Channel-wizard blockers deep-link to a named unit — these hooks let
               the requirement painter find, select and pulse the right row. */
            data-room-name={room.name}
            data-room-select="1"
            className={cn(
              "flex items-center justify-between p-2 rounded-md transition-colors text-xs",
              selectedRoomType === room.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              room.pms_synced && !isRolProperty && selectedRoomType !== room.id ? "bg-primary/5 border border-primary/20" : "",
              room.is_active === false && selectedRoomType !== room.id ? "opacity-50" : "",
            )}
            onClick={() => setSelectedRoomType(room.id)}
          >
            <span
              className={cn("font-medium flex-1 cursor-pointer truncate", room.is_active === false && "line-through")}
            >
              {room.name}
              {room.pms_synced && !isRolProperty && <Cloud className="inline h-2.5 w-2.5 ml-1 opacity-50" />}
            </span>

            <div className="flex gap-0.5 items-center">
              <Switch
                checked={room.is_active !== false}
                onCheckedChange={() => toggleRoomActive(room.id)}
                className="h-3.5 w-7 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-muted-foreground/30"
                title={room.is_active !== false ? "Active — visible on booking pages" : "Inactive — hidden from booking pages"}
                onClick={(e) => e.stopPropagation()}
              />
              {selectedPMS !== "nightsbridge" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = getRoomUrl(propertySlug || routeId || "", room.id);
                      if (homeIconOpenNewTab) {
                        window.open(url, "_blank");
                      } else {
                        navigate(`/property/${propertySlug || routeId}/room/${room.id}`);
                      }
                    }}
                    title="View room page"
                  >
                    <Home className="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(getRoomUrl(propertySlug || routeId || "", room.id));
                      toast({ title: "Copied", description: "Room URL copied to clipboard" });
                    }}
                    title="Copy room URL"
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteRoomType(room.id);
                }}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>



      {/* Main Content - Room Type Details */}
      <div className="flex-1 min-w-0">
        <Tabs defaultValue="room-type" className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="room-type" className="text-xs h-7">
              {accommodationLabel ? ACCOMMODATION_LABEL_OPTIONS.find(o => o.value === accommodationLabel)?.label || "Room" : "Room"} Type
            </TabsTrigger>
            {selectedPMS !== "nightsbridge" && (
              <TabsTrigger value="rate-types" className="text-xs h-7">Rate Types</TabsTrigger>
            )}
            <TabsTrigger value="amenities" className="text-xs h-7">Amenities &amp; Facilities</TabsTrigger>
            {selectedPMS !== "nightsbridge" && (
              <TabsTrigger value="room-images" className="text-xs h-7">Images</TabsTrigger>
            )}
            {selectedPMS !== "nightsbridge" && (
              <TabsTrigger value="agreement" className="text-xs h-7">Agreement</TabsTrigger>
            )}
          </TabsList>

          {/* Room Type Sub-tab */}
          <TabsContent value="room-type" className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-4">
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs whitespace-nowrap flex items-center gap-1">
                  Name
                  {isRoomFieldPmsSynced(selectedRoomType, "name") && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 bg-primary/10">
                      <Cloud className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                </Label>
                <Input
                  data-field="room_name"
                  value={roomTypes.find((r) => r.id === selectedRoomType)?.name || ""}
                  onChange={(e) => updateRoomTypeName(selectedRoomType, e.target.value)}
                  className={cn("h-7 text-xs", channelMandatoryClass("room_name"), getRoomPmsFieldClass(selectedRoomType, "name"))}
                  {...markerFlags(checkChannelName(selectedRoom?.name || "").status === "ok" && !!(selectedRoom?.name || "").trim())}
                  disabled={isRoomFieldPmsSynced(selectedRoomType, "name")}
                />
                <ChannelFieldHint
                  feedback={checkChannelName(roomTypes.find((r) => r.id === selectedRoomType)?.name || "")}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs whitespace-nowrap">
                  # {ACCOMMODATION_TYPES[accommodationLabel as AccommodationLabelKey]?.plural || "Units"}
                </Label>
                <Input
                  type="number"
                  className="h-7 w-full text-xs"
                  value={roomTypes.find((r) => r.id === selectedRoomType)?.numRooms || 1}
                  onChange={(e) => updateRoomTypeField(selectedRoomType, "numRooms", parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Room URL</Label>
                <div className="flex items-center gap-1">
                <Input
                  readOnly
                  className="bg-muted/50 h-7 text-xs"
                  value={getRoomUrl(propertySlug || routeId || "", selectedRoomType || "")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    navigator.clipboard.writeText(getRoomUrl(propertySlug || routeId || "", selectedRoomType || ""));
                    toast({ title: "URL Copied", description: "Room URL has been copied to clipboard" });
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                </div>
              </div>
            </div>

            {/* NightsBridge-specific fields */}
            {selectedPMS === "nightsbridge" && (
              <div className="space-y-2 pt-2 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Max Adults</Label>
                    <Input
                      type="number"
                      min={1}
                      className="h-7 text-xs"
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxPeople || 2}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxPeople", parseInt(e.target.value) || 2)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Children</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 text-xs"
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxChildren || 0}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxChildren", parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Description</Label>
                    <div className="flex items-center gap-2">
                      <CharacterCounterHint
                        value={selectedRoom?.description || ""}
                        required={MIN_ROOM_DESCRIPTION_CHARS}
                        recommended={RECOMMENDED_DESCRIPTION_CHARS}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px]"
                        disabled={writingRoomDescription}
                        onClick={writeRoomDescriptionWithTobi}
                      >
                        {writingRoomDescription
                          ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />TOBI is writing…</>
                          : <><Sparkles className="h-3 w-3 mr-1" />Write with TOBI</>}
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    data-field="room_description"
                    className={cn("text-xs min-h-[60px]", channelMandatoryClass("room_description"), roomDescriptionTooShort && "border-destructive focus-visible:ring-destructive")}
                    {...markerFlags(!roomDescriptionTooShort)}
                    placeholder="Room description..."
                    value={selectedRoom?.description || ""}
                    onChange={(e) => updateRoomTypeField(selectedRoomType, "description", e.target.value)}
                  />
                  <DescriptionShortfallHint
                    value={selectedRoom?.description || ""}
                    required={MIN_ROOM_DESCRIPTION_CHARS}
                    recommended={RECOMMENDED_DESCRIPTION_CHARS}
                    subject="unit"
                  />
                </div>
              </div>
            )}

            {selectedPMS !== "nightsbridge" && (
              <>
                {selectedPMS && !isRolProperty && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs whitespace-nowrap">
                        {selectedPMS.charAt(0).toUpperCase() + selectedPMS.slice(1)} Type
                      </Label>
                      <Input
                        className="h-7 text-xs"
                        value={roomTypes.find((r) => r.id === selectedRoomType)?.pmsRoomType || ""}
                        onChange={(e) => updateRoomTypeField(selectedRoomType, "pmsRoomType", e.target.value)}
                        placeholder={`${selectedPMS} room type`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs whitespace-nowrap">
                        {selectedPMS.charAt(0).toUpperCase() + selectedPMS.slice(1)} ID
                      </Label>
                      <Input
                        className="h-7 text-xs"
                        value={roomTypes.find((r) => r.id === selectedRoomType)?.pmsRoomId || ""}
                        onChange={(e) => updateRoomTypeField(selectedRoomType, "pmsRoomId", e.target.value)}
                        placeholder={`${selectedPMS} ID`}
                      />
                    </div>
                  </div>
                )}

                {!selectedPMS && (
                  <div className="bg-muted/50 border border-border rounded-md p-2">
                    <p className="text-xs text-muted-foreground">No PMS connected. Select a PMS in General tab.</p>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs flex items-center gap-1">
                      Description
                      {roomDescriptionPmsSynced && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-primary/10">
                          <Cloud className="h-2.5 w-2.5" />
                        </Badge>
                      )}
                    </Label>
                    <div className="flex items-center gap-2">
                      <CharacterCounterHint
                        value={selectedRoom?.description || ""}
                        required={MIN_ROOM_DESCRIPTION_CHARS}
                        recommended={RECOMMENDED_DESCRIPTION_CHARS}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px]"
                        disabled={writingRoomDescription || roomDescriptionPmsSynced}
                        onClick={writeRoomDescriptionWithTobi}
                      >
                        {writingRoomDescription
                          ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />TOBI is writing…</>
                          : <><Sparkles className="h-3 w-3 mr-1" />Write with TOBI</>}
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    data-field="room_description"
                    rows={2}
                    className={cn(
                      "min-h-[52px] w-full text-xs",
                      channelMandatoryClass("room_description"),
                      getRoomPmsFieldClass(selectedRoomType, "description"),
                      !roomDescriptionPmsSynced && roomDescriptionTooShort && "border-destructive focus-visible:ring-destructive",
                    )}
                    value={selectedRoom?.description || ""}
                    onChange={(e) => updateRoomTypeField(selectedRoomType, "description", e.target.value)}
                    disabled={roomDescriptionPmsSynced}
                    {...markerFlags(!roomDescriptionTooShort)}
                  />
                  {!roomDescriptionPmsSynced && (
                    <DescriptionShortfallHint
                      value={selectedRoom?.description || ""}
                      required={MIN_ROOM_DESCRIPTION_CHARS}
                      recommended={RECOMMENDED_DESCRIPTION_CHARS}
                      subject="unit"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Extra Person Policy</Label>
                  <Textarea
                    rows={1}
                    className="min-h-[44px] w-full text-xs"
                    value={roomTypes.find((r) => r.id === selectedRoomType)?.extraPersonPolicy || ""}
                    onChange={(e) => updateRoomTypeField(selectedRoomType, "extraPersonPolicy", e.target.value)}
                  />
                </div>

                {/* Bed Configuration Section — beds authored per bedroom */}
                <div className="space-y-1">
                  <Label className="text-xs">Beds per bedroom</Label>
                  <div
                    data-field="bed_configuration"
                    className={cn("border rounded-md p-2 space-y-2", channelMandatoryClass("bed_configuration"))}
                    {...markerFlags(
                      UNIT_ROW_RULES.beds({
                        bedConfiguration: selectedRoom?.bedConfiguration,
                        maxPeople: selectedRoom?.maxPeople,
                      }) &&
                        UNIT_ROW_RULES.bedsDistributed({
                          bedConfiguration: selectedRoom?.bedConfiguration,
                          bedrooms: (selectedRoom as any)?.bedrooms,
                        }),
                    )}
                  >
                    {(() => {
                      const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                      const maxSynced = isRoomFieldPmsSynced(selectedRoomType, "maxPeople");
                      const applyBeds = (newConfig: BedEntry[]) => {
                        updateRoomTypeField(selectedRoomType, "bedConfiguration", newConfig);
                        const authored = authoredBedroomCount(newConfig);
                        if (authored > 0) {
                          updateRoomTypeField(selectedRoomType, "bedrooms", authored);
                        }
                        const newCapacity = calculateBedCapacity(newConfig);
                        if (!maxSynced && newCapacity > 0) {
                          updateRoomTypeField(selectedRoomType, "maxPeople", newCapacity);
                        }
                      };
                      const capacity = calculateBedCapacity(parseBedConfiguration(currentRoom?.bedConfiguration));
                      return (
                        <>
                          <BedComposition
                            value={currentRoom?.bedConfiguration}
                            declaredBedrooms={(currentRoom as any)?.bedrooms}
                            onChange={applyBeds}
                            onDeclaredBedroomsChange={(bedrooms) =>
                              updateRoomTypeField(selectedRoomType, "bedrooms", bedrooms)
                            }
                          />
                          <BedCapacityHint
                            capacity={capacity}
                            maxGuests={Number(currentRoom?.maxPeople) || 0}
                            action={
                              !maxSynced && capacity > 0 ? (
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  className="h-4 px-1 text-[10px]"
                                  onClick={() => updateRoomTypeField(selectedRoomType, "maxPeople", capacity)}
                                >
                                  Set max guests to {capacity}
                                </Button>
                              ) : undefined
                            }
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>



                <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap">Size (m²)</Label>
                    <Input type="number" min={1}
                      data-field="room_size"
                      className={cn("h-7 w-full text-xs", channelMandatoryClass("room_size"))}
                      {...markerFlags(UNIT_ROW_RULES.size({ roomSize: selectedRoom?.roomSize }))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.roomSize || ""}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "roomSize", parseInt(e.target.value) || 0)}
                    />
                    {Number(roomTypes.find((r) => r.id === selectedRoomType)?.roomSize || 0) < 1 && (
                      <p className="flex items-center gap-1 text-[10px] text-destructive">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Required — blank or zero makes the channel receive an invented 50 m².
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 lg:col-span-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-xs whitespace-nowrap cursor-help underline decoration-dotted">Floor</Label>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Which level the unit is on. 0 = Ground floor (street level). 1 = 1st floor (the second level in a double-storey house).
                          2 = 2nd floor (the top level of a three-storey unit), and so on. Pushed to the Channel Manager and downstream channels.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Select
                      value={(() => { const f = roomTypes.find((r) => r.id === selectedRoomType)?.floor; return f === null || f === undefined ? "none" : String(f); })()}
                      onValueChange={(v) => updateRoomTypeField(selectedRoomType, "floor", v === "none" ? null : parseInt(v))}
                    >
                      <SelectTrigger
                        data-field="floor"
                        className={cn("h-7 w-full text-xs", channelMandatoryClass("floor"))}
                        {...markerFlags(UNIT_ROW_RULES.floor({ floor: selectedRoom?.floor }))}
                      >
                        <SelectValue placeholder="Select floor" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="none">Not specified</SelectItem>
                        <SelectItem value="-1">-1 — Basement / lower level</SelectItem>
                        <SelectItem value="0">0 — Ground floor (street level)</SelectItem>
                        <SelectItem value="1">1 — 1st floor (2nd level up)</SelectItem>
                        <SelectItem value="2">2 — 2nd floor (3rd level up)</SelectItem>
                        <SelectItem value="3">3 — 3rd floor (4th level up)</SelectItem>
                        <SelectItem value="4">4 — 4th floor</SelectItem>
                        <SelectItem value="5">5 — 5th floor</SelectItem>
                        <SelectItem value="6">6 — 6th floor</SelectItem>
                        <SelectItem value="7">7 — 7th floor</SelectItem>
                        <SelectItem value="8">8 — 8th floor</SelectItem>
                        <SelectItem value="9">9 — 9th floor</SelectItem>
                        <SelectItem value="10">10 — 10th floor or higher</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap">Baths</Label>
                    <Input type="number" min={1}
                      data-field="bathrooms"
                      className={cn("h-7 w-full text-xs", channelMandatoryClass("bathrooms"))}
                      {...markerFlags(UNIT_ROW_RULES.bathrooms({ bathrooms: selectedRoom?.bathrooms }))}
                      value={(() => { const value = roomTypes.find((r) => r.id === selectedRoomType)?.bathrooms; return value === null || value === undefined ? "" : String(value); })()}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "bathrooms", e.target.value === "" ? null : Number(e.target.value))}
                    />
                    {Number(roomTypes.find((r) => r.id === selectedRoomType)?.bathrooms) < 1 && <p className="text-[10px] text-destructive">Required: at least 1 bathroom.</p>}
                  </div>
                  <div className="space-y-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-xs whitespace-nowrap cursor-help underline decoration-dotted">Toilets</Label>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Toilets in this unit. The Channel Manager rejects blank or zero; each unit must explicitly have at least 1.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Input type="number" min={1} placeholder="Required"
                      data-field="toilets"
                      className={cn("h-7 w-full text-xs", channelMandatoryClass("toilets"))}
                      {...markerFlags(UNIT_ROW_RULES.toilets({ toilets: selectedRoom?.toilets }))}
                      value={(() => { const t = roomTypes.find((r) => r.id === selectedRoomType)?.toilets; return t === null || t === undefined ? "" : String(t); })()}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "toilets", e.target.value === "" ? null : Number(e.target.value))}
                    />
                    {Number(roomTypes.find((r) => r.id === selectedRoomType)?.toilets) < 1 && <p className="text-[10px] text-destructive">Required: at least 1 toilet. Blank and zero block channel onboarding.</p>}
                  </div>
                  {(() => {
                    const resolvedType = resolveUnitChannelType(
                      selectedRoom?.channelPropertyType,
                      propertyChannelType,
                      channelTypes.isMapped,
                    );
                    return (
                  <div className="space-y-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-xs whitespace-nowrap cursor-help underline decoration-dotted">Channel property type</Label>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          The type the Channel Manager publishes for this unit. It inherits the property type
                          set in Identity &amp; Location unless you override it here.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <Select
                      value={
                        normalizeChannelPropertyType(selectedRoom?.channelPropertyType) &&
                        channelTypes.isMapped(selectedRoom?.channelPropertyType)
                          ? normalizeChannelPropertyType(selectedRoom?.channelPropertyType)
                          : "inherit"
                      }
                      onValueChange={(v) =>
                        updateRoomTypeField(selectedRoomType, "channelPropertyType", v === "inherit" ? "" : v)
                      }
                    >
                      <SelectTrigger
                        data-field="channel_property_type"
                        className={cn("h-7 w-full text-xs", channelMandatoryClass("channel_property_type"))}
                        {...markerFlags(resolvedType.isMapped)}
                      >
                        <SelectValue placeholder="Required — select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit" className="text-xs">
                          {resolvedType.inherited && resolvedType.isMapped
                            ? `Use property type (${channelTypes.label(resolvedType.value)})`
                            : "Use property type"}
                        </SelectItem>
                        {channelTypes.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {resolvedType.isMapped ? (
                      resolvedType.inherited && (
                        <p className="text-[10px] text-muted-foreground">
                          Inherited from the property type — publishes as {channelTypes.label(resolvedType.value)}.
                        </p>
                      )
                    ) : (
                      <p className="text-[10px] text-destructive">
                        Required: the property type is not a supported channel type — set it in Identity &amp;
                        Location or pick a type for this unit.
                      </p>
                    )}
                  </div>
                    );
                  })()}

                  <div className="space-y-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-xs whitespace-nowrap cursor-help underline decoration-dotted">Changeover (this unit)</Label>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Optional override. Leave on “Use property rule” to inherit the master changeover rule authored in Policies.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Select
                      value={
                        selectedRoom?.changeover === null || selectedRoom?.changeover === undefined || selectedRoom?.changeover === ""
                          ? "inherit"
                          : String(selectedRoom?.changeover)
                      }
                      onValueChange={(v) =>
                        updateRoomTypeField(selectedRoomType, "changeover", v === "inherit" ? null : Number(v))
                      }
                    >
                      <SelectTrigger className="h-7 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit" className="text-xs">Use property rule</SelectItem>
                        {CHANGEOVER_CODES.map((c) => (
                          <SelectItem key={c.value} value={String(c.value)} className="text-xs">{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-xs whitespace-nowrap cursor-help underline decoration-dotted">Kitchen</Label>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Tick when this unit has its own separate kitchen (not a kitchenette in the living area).
                          Unticked falls back to the property-wide setting.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="flex h-7 items-center gap-1.5">
                      <Checkbox
                        id={`sep-kitchen-${selectedRoomType}`}
                        checked={!!roomTypes.find((r) => r.id === selectedRoomType)?.separateKitchen}
                        onCheckedChange={(v) => {
                          updateRoomTypeField(selectedRoomType, "separateKitchen", !!v);
                          // The channel publishes "Separate kitchen" from the Kitchen amenity,
                          // so the unit amenity list must say the same thing.
                          const current = ensureArray(
                            roomTypes.find((r) => r.id === selectedRoomType)?.amenities,
                          ) as string[];
                          updateRoomTypeField(
                            selectedRoomType,
                            "amenities",
                            withSeparateKitchen(current, !!v),
                          );
                        }}
                      />
                      <Label htmlFor={`sep-kitchen-${selectedRoomType}`} className="text-[10px] cursor-pointer">
                        Separate
                      </Label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Max
                      {isRoomFieldPmsSynced(selectedRoomType, "maxPeople") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number"
                      data-field="max_guests"
                      className={cn("h-7 w-full text-xs", channelMandatoryClass("max_guests"), getRoomPmsFieldClass(selectedRoomType, "maxPeople"))}
                      {...markerFlags(UNIT_ROW_RULES.maxGuests({ maxPeople: selectedRoom?.maxPeople }))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxPeople || 2}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxPeople", parseInt(e.target.value) || 1)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "maxPeople")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Adults
                      {isRoomFieldPmsSynced(selectedRoomType, "maxAdults") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number"
                      className={cn("h-7 w-full text-xs", getRoomPmsFieldClass(selectedRoomType, "maxAdults"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxAdults || 2}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxAdults", parseInt(e.target.value) || 1)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "maxAdults")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Children
                      {isRoomFieldPmsSynced(selectedRoomType, "maxChildren") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number"
                      className={cn("h-7 w-full text-xs", getRoomPmsFieldClass(selectedRoomType, "maxChildren"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxChildren || 0}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxChildren", parseInt(e.target.value) || 0)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "maxChildren")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Min
                      {isRoomFieldPmsSynced(selectedRoomType, "minGuests") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number"
                      className={cn("h-7 w-full text-xs", getRoomPmsFieldClass(selectedRoomType, "minGuests"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.minGuests || 1}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "minGuests", parseInt(e.target.value) || 1)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "minGuests")}
                    />
                  </div>
                </div>

                {/* Guest Policies - Compact Row */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Teens */}
                  <div className="border rounded-md p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1">
                        Teens
                        {isRoomFieldPmsSynced(selectedRoomType, "allowTeens") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                      </Label>
                      <Switch className="scale-75"
                        checked={roomTypes.find((r) => r.id === selectedRoomType)?.allowTeens || false}
                        onCheckedChange={(checked) => updateRoomTypeField(selectedRoomType, "allowTeens", checked)}
                        disabled={isRoomFieldPmsSynced(selectedRoomType, "allowTeens")}
                      />
                    </div>
                    {roomTypes.find((r) => r.id === selectedRoomType)?.allowTeens && (
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1 flex-1">
                          <Label className="text-[10px] text-muted-foreground">Min</Label>
                          <Input type="number"
                            className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, "teenMinAge"))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.teenMinAge || 13}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "teenMinAge", parseInt(e.target.value) || 13)}
                            disabled={isRoomFieldPmsSynced(selectedRoomType, "teenMinAge")}
                          />
                        </div>
                        <div className="flex items-center gap-1 flex-1">
                          <Label className="text-[10px] text-muted-foreground">Max</Label>
                          <Input type="number"
                            className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, "teenMaxAge"))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.teenMaxAge || 17}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "teenMaxAge", parseInt(e.target.value) || 17)}
                            disabled={isRoomFieldPmsSynced(selectedRoomType, "teenMaxAge")}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Children */}
                  <div className="border rounded-md p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1">
                        Children
                        {isRoomFieldPmsSynced(selectedRoomType, "allowChildren") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                      </Label>
                      <Switch className="scale-75"
                        checked={roomTypes.find((r) => r.id === selectedRoomType)?.allowChildren || false}
                        onCheckedChange={(checked) => updateRoomTypeField(selectedRoomType, "allowChildren", checked)}
                        disabled={isRoomFieldPmsSynced(selectedRoomType, "allowChildren")}
                      />
                    </div>
                    {roomTypes.find((r) => r.id === selectedRoomType)?.allowChildren && (
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1 flex-1">
                          <Label className="text-[10px] text-muted-foreground">Min</Label>
                          <Input type="number"
                            className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, "childMinAge"))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.childMinAge || 2}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "childMinAge", parseInt(e.target.value) || 2)}
                            disabled={isRoomFieldPmsSynced(selectedRoomType, "childMinAge")}
                          />
                        </div>
                        <div className="flex items-center gap-1 flex-1">
                          <Label className="text-[10px] text-muted-foreground">Max</Label>
                          <Input type="number"
                            className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, "childMaxAge"))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.childMaxAge || 12}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "childMaxAge", parseInt(e.target.value) || 12)}
                            disabled={isRoomFieldPmsSynced(selectedRoomType, "childMaxAge")}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Infants */}
                  <div className="border rounded-md p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1">
                        Infants
                        {isRoomFieldPmsSynced(selectedRoomType, "allowInfants") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                      </Label>
                      <Switch className="scale-75"
                        checked={roomTypes.find((r) => r.id === selectedRoomType)?.allowInfants || false}
                        onCheckedChange={(checked) => updateRoomTypeField(selectedRoomType, "allowInfants", checked)}
                        disabled={isRoomFieldPmsSynced(selectedRoomType, "allowInfants")}
                      />
                    </div>
                    {roomTypes.find((r) => r.id === selectedRoomType)?.allowInfants && (
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1 flex-1">
                          <Label className="text-[10px] text-muted-foreground">Min</Label>
                          <Input type="number"
                            className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, "infantMinAge"))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.infantMinAge || 0}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "infantMinAge", parseInt(e.target.value) || 0)}
                            disabled={isRoomFieldPmsSynced(selectedRoomType, "infantMinAge")}
                          />
                        </div>
                        <div className="flex items-center gap-1 flex-1">
                          <Label className="text-[10px] text-muted-foreground">Max</Label>
                          <Input type="number"
                            className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, "infantMaxAge"))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.infantMaxAge || 2}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "infantMaxAge", parseInt(e.target.value) || 2)}
                            disabled={isRoomFieldPmsSynced(selectedRoomType, "infantMaxAge")}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional PMS Fields - Inline */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Age Cat
                      {isRoomFieldPmsSynced(selectedRoomType, "minAgeCategory") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Select
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.minAgeCategory || ""}
                      onValueChange={(value) => updateRoomTypeField(selectedRoomType, "minAgeCategory", value)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "minAgeCategory")}
                    >
                      <SelectTrigger className={cn("h-7 text-xs", getRoomPmsFieldClass(selectedRoomType, "minAgeCategory"))}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADULT">Adult</SelectItem>
                        <SelectItem value="TEEN">Teen</SelectItem>
                        <SelectItem value="CHILD">Child</SelectItem>
                        <SelectItem value="INFANT">Infant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Min Adults
                      {isRoomFieldPmsSynced(selectedRoomType, "minAdultsToOfferNonAdultRates") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number" min="0"
                      className={cn("h-7 w-full text-xs", getRoomPmsFieldClass(selectedRoomType, "minAdultsToOfferNonAdultRates"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.minAdultsToOfferNonAdultRates || 0}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "minAdultsToOfferNonAdultRates", parseInt(e.target.value) || 0)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "minAdultsToOfferNonAdultRates")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap">Min Stay</Label>
                    <Input type="number" data-field="min_stay" className={cn("h-7 w-full text-xs", channelMandatoryClass("min_stay_set"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.minStay || 1}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "minStay", parseInt(e.target.value) || 1)}
                      {...markerFlags(UNIT_ROW_RULES.minStay(roomTypes.find((r) => r.id === selectedRoomType) ?? {}))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs whitespace-nowrap">Max Stay</Label>
                    <Input type="number" data-field="max_stay" className="h-7 w-full text-xs channel-recommended"
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxStay || 0}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxStay", parseInt(e.target.value) || 0)}
                      {...markerFlags(UNIT_ROW_RULES.maxStay(roomTypes.find((r) => r.id === selectedRoomType) ?? {}))}
                    />
                  </div>
                </div>

                <div className="bg-info-surface border border-info-border rounded-md p-2">
                  <p className="text-xs text-info">
                    <strong>INFO:</strong> Align "Max adult" with rate type if Person Rate is applied.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Rate Info</h3>
                  {(() => {
                    const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                    const linkedRateTypeIds = currentRoom?.linkedRateTypes || currentRoom?.availableRateTypes || [];
                    const linkedRateTypesData = pmsRateTypes.filter((rt) => linkedRateTypeIds.includes(rt.id));

                    if (linkedRateTypesData.length > 0) {
                      const priceTypes = [...new Set(linkedRateTypesData.map((rt) => rt.priceType).filter(Boolean))];
                      return (
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            Price Type (from linked Rate Types)
                            {!isRolProperty && (
                              <Badge variant="outline" className="text-xs bg-primary/10">
                                <Cloud className="h-3 w-3 mr-1" />PMS
                              </Badge>
                            )}
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {priceTypes.length > 0 ? (
                              priceTypes.map((pt, idx) => <Badge key={idx} variant="secondary">{pt}</Badge>)
                            ) : (
                              <span className="text-sm text-muted-foreground">No price types defined in linked rate types</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Price types are determined by the rate types linked to this room. Manage linked rate types in the "Rate Types" tab.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <Label>Rate Type (Manual)</Label>
                        <Select
                          value={currentRoom?.rateType || "per-unit"}
                          onValueChange={(value) => updateRoomTypeField(selectedRoomType, "rateType", value)}
                        >
                          <SelectTrigger className="text-xs h-7"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="per-unit">Per Unit</SelectItem>
                            <SelectItem value="per-person">Per Person</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Link rate types in the "Rate Types" tab to use PMS price types instead.
                        </p>
                      </div>
                    );
                  })()}
                  <div className="space-y-2">
                    <Label>Meal Types (for this room)</Label>
                    <TagInput
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.mealTypes || []}
                      onChange={(newMealTypes) => updateRoomTypeField(selectedRoomType, "mealTypes", newMealTypes)}
                      suggestions={mealTypeSuggestions}
                      placeholder="Type meal type and press Enter..."
                      onNewTag={handleNewMealType}
                    />
                    <p className="text-xs text-muted-foreground">
                      Meal types are manual entry. Add meal types specific to this room (e.g., Self Catering, Bed & Breakfast, Full Board).
                    </p>
                  </div>
                </div>

                {/* Hostfully-specific Room Details */}
                {selectedPMS === "hostfully" && (
                  <HostfullyRoomDetails
                    room={roomTypes.find((r) => r.id === selectedRoomType)}
                    onFieldChange={(field, value) => updateRoomTypeField(selectedRoomType, field, value)}
                    isFieldPmsSynced={(field) => isRoomFieldPmsSynced(selectedRoomType, field)}
                    getPmsFieldClass={(field) => getRoomPmsFieldClass(selectedRoomType, field)}
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* Rate Types Sub-tab */}
          <TabsContent value="rate-types" className="p-3 space-y-2">
            {(() => {
              const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
              const extractRateTypeId = (key: string | number): string => {
                const keyStr = String(key);
                if (keyStr.includes('|')) {
                  const parts = keyStr.split('|').filter(p => p.trim());
                  return parts[parts.length - 1] || '';
                }
                return keyStr;
              };
              const rawLinkedIds = currentRoom?.availableRateTypes || currentRoom?.linkedRateTypes || currentRoom?.linked_rate_type_ids || [];
              const linkedRateTypeIds = rawLinkedIds.map(extractRateTypeId).filter(Boolean);
              const filteredByLinked = linkedRateTypeIds.length > 0
                ? pmsRateTypes.filter((rt) => linkedRateTypeIds.includes(String(rt.id)) || linkedRateTypeIds.includes(rt.id))
                : [];
              const availableRateTypesForRoom = filteredByLinked.length > 0 ? filteredByLinked : pmsRateTypes;

              return (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Link Rate Types to {currentRoom?.name}</span>
                      {availableRateTypesForRoom.length > 0 && (
                        <Badge variant="outline" className="text-[10px] h-4">{availableRateTypesForRoom.length} available</Badge>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-4">
                      {getRoomLinkedRateTypes(selectedRoomType).length} linked
                    </Badge>
                  </div>

                  {availableRateTypesForRoom.length === 0 ? (
                    <div className="border rounded-md p-4 text-center text-muted-foreground">
                      <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">No rate types available. Create rate types in the Rates tab first.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {availableRateTypesForRoom.map((rateType) => {
                        const isLinked = getRoomLinkedRateTypes(selectedRoomType).includes(rateType.id);
                        return (
                          <RateTypeItem
                            key={rateType.id}
                            rateType={rateType}
                            isLinked={isLinked}
                            onToggleLink={() => toggleRoomRateTypeLink(selectedRoomType, rateType.id)}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </TabsContent>

          {/* Amenities & Facilities Sub-tab (RU-aligned, single source of truth) */}
          <TabsContent value="amenities" className="p-6 space-y-4">
            {(() => {
              const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
              const pmsSyncedAmenities = isRoomFieldPmsSynced(selectedRoomType, "amenities")
                ? ensureArray(currentRoom?.amenities)
                : [];
              return pmsSyncedAmenities.length > 0 ? (
                <div className="bg-primary/5 border border-primary/20 rounded-md p-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cloud className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">{pmsSyncedAmenities.length} amenities synced from Hostfully</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {pmsSyncedAmenities.slice(0, 10).map((amenity: string) => (
                      <Badge key={amenity} variant="secondary" className="text-xs"><Cloud className="h-2.5 w-2.5 mr-1" />{amenity}</Badge>
                    ))}
                    {pmsSyncedAmenities.length > 10 && (
                      <Badge variant="outline" className="text-xs">+{pmsSyncedAmenities.length - 10} more</Badge>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-muted border border-border rounded-md p-2 mb-4">
                  <p className="text-sm text-muted-foreground">
                    Room facilities and amenities are managed in one place here — the selection below is the source of truth pushed to the Channel Manager and downstream channels.
                  </p>
                </div>
              );
            })()}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Channel amenities first — this unit's selection is pushed to the Channel Manager and OTAs
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs shrink-0"
                disabled={!propertyId || !selectedRoomType}
                title={
                  propertyId
                    ? "Let TOBI review the property website, photos and ROLOS data to propose amenities for this unit"
                    : "Save the property first"
                }
                onClick={() => setAiUnitAmenityOpen(true)}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                TOBI amenity check
              </Button>
            </div>
            <div
              data-field="room_amenities"
              className={channelMandatoryClass("room_amenities")}
              {...markerFlags(ensureArray(selectedRoom?.amenities).length >= 10)}
            >
              <RUAmenityPicker
                value={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities) as string[]}
                onChange={(next) => updateRoomTypeField(selectedRoomType, "amenities", next)}
              />
              {ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities).length < 10 && (
                <p className="mt-2 text-[10px] text-destructive">At least 10 mapped amenities are required.</p>
              )}
              {(() => {
                // Live kitchen rule: self-catering units are rejected by the channel
                // without a kitchen or kitchenette amenity.
                const amenities = ensureArray(
                  roomTypes.find((r) => r.id === selectedRoomType)?.amenities,
                ) as string[];
                const tick = (id: number) =>
                  updateRoomTypeField(selectedRoomType, "amenities", [...amenities, ruToken(id)]);
                return (
                  <KitchenHint
                    className="mt-2"
                    selfCatering
                    hasKitchen={
                      listDeclaresKitchen(amenities) ||
                      !!roomTypes.find((r) => r.id === selectedRoomType)?.separateKitchen
                    }
                    onTickKitchen={() => tick(101)}
                    onTickKitchenette={() => tick(157)}
                  />
                );
              })()}
            </div>

            {propertyId && selectedRoomType && (
              <AiAmenityDialog
                open={aiUnitAmenityOpen}
                onOpenChange={setAiUnitAmenityOpen}
                propertyId={propertyId}
                websiteUrl={propertyWebsiteUrl || undefined}

                unitScope={{
                  unitId: String(selectedRoomType),
                  unitName: roomTypes.find((r) => r.id === selectedRoomType)?.name || "this unit",
                  current: ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities) as string[],
                  onApply: (next) => updateRoomTypeField(selectedRoomType, "amenities", next),
                }}
              />
            )}


            {(() => {
              const legacy = ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities) as string[];
              if (!legacy.length) return null;
              return (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold">Legacy facilities (website only)</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => updateRoomTypeField(selectedRoomType, "facilities", [])}
                    >
                      Clear all
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Captured before the channel amenity alignment. Re-select the equivalents above so they reach the channels, then clear these.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {legacy.map((f) => (
                      <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                </div>
              );
            })()}
          </TabsContent>


          {/* Room Images Sub-tab */}
          <TabsContent value="room-images" className="p-6 space-y-4">
            {(() => {
              const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
              const pmsSyncedImages = isRoomFieldPmsSynced(selectedRoomType, "images");
              return (
                <>
                  {pmsSyncedImages && (
                    <div className="bg-primary/5 border border-primary/20 rounded-md p-3 mb-4">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-primary">Images synced from Hostfully</span>
                        {currentRoom?.thumbnail_url && (
                          <Badge variant="secondary" className="text-xs ml-auto">Thumbnail set</Badge>
                        )}
                      </div>
                    </div>
                  )}
                  {currentRoom?.lastSyncedAt && pmsSyncedImages && (
                    <p className="text-xs text-muted-foreground">
                      Last synced: {new Date(currentRoom.lastSyncedAt).toLocaleString()}
                    </p>
                  )}
                </>
              );
            })()}

            {/* Channel image compliance — states exactly which rule fails and which photos */}
            {(() => {
              const images = ((roomTypes.find((r) => r.id === selectedRoomType)?.images || []) as string[]);
              const entries = images.map((url, i) => ({ url, index: i + 1, entry: roomImageAudit.results[url] }));
              const failing = entries.filter((e) => e.entry?.status === "fail");
              const unmeasured = entries.filter((e) => e.entry?.status === "unmeasured");
              const pending = entries.filter((e) => !e.entry || e.entry.status === "pending");
              const countOk = images.length >= 10;
              const allOk = countOk && failing.length === 0 && unmeasured.length === 0;

              const Row = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
                <li className={cn("flex items-start gap-1.5 text-xs", ok ? "text-success" : "text-destructive")}>
                  {ok ? <CheckCircle2 className="mt-[2px] h-3 w-3 shrink-0" /> : <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0" />}
                  <span>{children}</span>
                </li>
              );

              return (
                <div
                  className={cn(
                    "rounded-md border p-3",
                    allOk ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <p className="mb-2 text-xs font-medium">
                    Channel image requirements {pending.length > 0 && (
                      <span className="text-muted-foreground">· measuring {pending.length}…</span>
                    )}
                  </p>
                  <ul className="space-y-1">
                    <Row ok={countOk}>
                      At least 10 images — <strong>{images.length}</strong> loaded
                      {!countOk && ` (add ${10 - images.length} more)`}
                    </Row>
                    <Row ok={failing.length === 0}>
                      Every image at least {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT}px
                      {failing.length > 0 && (
                        <>
                          {" — "}
                          {failing.length} too small: {failing
                            .map((f) => `#${f.index} (${f.entry?.width}×${f.entry?.height})`)
                            .join(", ")}
                        </>
                      )}
                    </Row>
                    {unmeasured.length > 0 && (
                      <Row ok={false}>
                        Could not verify size for {unmeasured.map((f) => `#${f.index}`).join(", ")} — re-upload these photos
                      </Row>
                    )}
                  </ul>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Failing photos are ringed in red in the gallery below. Property-gallery images may supplement this unit during channel validation.
                  </p>
                </div>
              );
            })()}

            <div
              data-field="room_images"
              className={cn("grid grid-cols-6 gap-4", channelMandatoryClass("room_images"))}
              {...markerFlags((selectedRoom?.images || []).length >= 10)}
            >
              {/* Upload slot */}
              <div
                className="aspect-video border-2 border-dashed border-primary/50 rounded-lg flex flex-col items-center justify-center bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => document.getElementById("room-image-upload")?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleRoomImageUpload(e.dataTransfer.files); }}
              >
                {isRoomImageUploading ? (
                  <RefreshCw className="h-8 w-8 text-primary mb-2 animate-spin" />
                ) : (
                  <Upload className="h-8 w-8 text-primary mb-2" />
                )}
                <p className="text-xs text-center text-muted-foreground px-2">
                  {isRoomImageUploading ? "Uploading..." : "Click or Drag and drop image to upload"}
                </p>
                <input
                  id="room-image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleRoomImageUpload(e.target.files)}
                />
              </div>

              {/* Uploaded room images */}
              {(roomTypes.find((r) => r.id === selectedRoomType)?.images || []).map((imageUrl: string, index: number) => (
                <div key={index} className="space-y-1">
                  <div className="relative aspect-video rounded-lg overflow-hidden border border-border group">
                    <img src={imageUrl} alt={`Room ${index + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 rounded bg-foreground/70 px-1 text-[9px] font-medium text-background">
                      #{index + 1}
                    </span>
                    <ImageQualityMarker entry={roomImageAudit.results[imageUrl]} />
                    {roomMainImageUrl === imageUrl ? (
                      <div className="absolute top-2 left-2 bg-primary rounded-full p-1.5" title="Main room image">
                        <Heart className="h-3 w-3 text-white fill-white" />
                      </div>
                    ) : (
                      <button type="button"
                        onClick={() => {
                          const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                          const map = normalizeRuImageTagMap(currentRoom?.ruImageTags);
                          updateRoomTypeField(
                            selectedRoomType,
                            "ruImageTags",
                            setMainImageUrl(map, ensureArray(currentRoom?.images) as string[], imageUrl),
                          );
                        }}
                        className="absolute top-2 left-2 bg-muted-foreground/60 hover:bg-primary rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Set as main room image"
                      >
                        <Heart className="h-3 w-3 text-white" />
                      </button>
                    )}
                    <button type="button"
                      onClick={() => removeRoomImage(imageUrl)}
                      className="absolute top-2 right-2 bg-muted-foreground/80 hover:bg-destructive rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>
                  <RuImageTagPicker
                    value={normalizeRuImageTagMap(roomTypes.find((r) => r.id === selectedRoomType)?.ruImageTags)[imageUrl] || []}
                    isMain={roomMainImageUrl === imageUrl}
                    onChange={(next) => {
                      const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                      const map = normalizeRuImageTagMap(currentRoom?.ruImageTags);
                      updateRoomTypeField(selectedRoomType, "ruImageTags", { ...map, [imageUrl]: next });
                    }}
                  />
                </div>
              ))}


              {/* Placeholder empty slots */}
              {Array.from({ length: Math.max(0, 11 - (roomTypes.find((r) => r.id === selectedRoomType)?.images?.length || 0)) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-video border-2 border-dashed border-border rounded-lg bg-muted/20"></div>
              ))}
            </div>
          </TabsContent>

          {/* Agreement Sub-tab */}
          <TabsContent value="agreement" className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>Split %</Label>
              <Input
                type="number"
                value={roomTypes.find((r) => r.id === selectedRoomType)?.splitPercent || 0}
                onChange={(e) => updateRoomTypeField(selectedRoomType, "splitPercent", parseFloat(e.target.value) || 0)}
                className="max-w-xs"
              />
            </div>
            <div className="bg-info-surface border border-info-border rounded-md p-3">
              <p className="text-sm text-info">
                Inputting a value here will override the split % specified in House Style for this room.
              </p>
            </div>
          </TabsContent>

          {/* Data Explorer Sub-tab (dev only) */}
          {(isDev || isFearlessLeader) && (
            <TabsContent value="data-explorer" className="p-6 space-y-4">
              {(() => {
                const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                if (!currentRoom) {
                  return (
                    <div className="border rounded-lg p-8 text-center text-muted-foreground">
                      <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Select a room type to explore its data.</p>
                    </div>
                  );
                }
                return (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Raw data explorer for <strong>{currentRoom.name}</strong>
                    </p>
                    <RoomTypeDataViewer room={currentRoom} rateTypes={pmsRateTypes} />
                  </>
                );
              })()}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
interface FacilityChecklistGroupProps {
  title: string;
  items: string[];
  roomTypes: any[];
  selectedRoomType: string;
  updateRoomTypeField: (id: string, field: string, value: any) => void;
  fieldKey: "facilities" | "amenities";
}

function FacilityChecklistGroup({ title, items, roomTypes, selectedRoomType, updateRoomTypeField, fieldKey }: FacilityChecklistGroupProps) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">{title}</h4>
      {items.map((item) => (
        <ChecklistItem key={item} item={item} roomTypes={roomTypes} selectedRoomType={selectedRoomType} updateRoomTypeField={updateRoomTypeField} fieldKey={fieldKey} />
      ))}
    </div>
  );
}

interface ChecklistItemProps {
  item: string;
  roomTypes: any[];
  selectedRoomType: string;
  updateRoomTypeField: (id: string, field: string, value: any) => void;
  fieldKey: "facilities" | "amenities";
}

function ChecklistItem({ item, roomTypes, selectedRoomType, updateRoomTypeField, fieldKey }: ChecklistItemProps) {
  const currentValues: string[] = (() => {
    const value = roomTypes.find((r) => r.id === selectedRoomType)?.[fieldKey];
    if (Array.isArray(value)) return value;
    return [];
  })();

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`${fieldKey}-${item}`}
        checked={currentValues.includes(item)}
        onCheckedChange={(checked) => {
          const newValues = checked
            ? [...currentValues, item]
            : currentValues.filter((f: string) => f !== item);
          updateRoomTypeField(selectedRoomType, fieldKey, newValues);
        }}
      />
      <Label htmlFor={`${fieldKey}-${item}`} className="text-sm cursor-pointer flex-1">{item}</Label>
    </div>
  );
}
