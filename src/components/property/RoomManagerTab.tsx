/**
 * RoomManagerTab — Extracted from PropertyForm.tsx (Sub-phase 1A)
 * Manages room type CRUD, bed configuration, facilities, amenities, images, and agreements.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { validateImageDimensions, getValidationErrorMessage } from "@/lib/imageValidation";
import { getRoomUrl } from "@/lib/config";
import { parseBedConfiguration, BED_TYPES, BedEntry, calculateBedCapacity, sleepsPerBed } from "@/lib/bedConfig";
import { cn } from "@/lib/utils";
import { isFieldPopulatedByPMS, getPMSDisplayName } from "@/lib/pmsFieldConfig";
import { TagInput } from "@/components/TagInput";
import { HostfullyRoomDetails } from "@/components/pms/HostfullyRoomDetails";
import { ACCOMMODATION_LABEL_OPTIONS, ACCOMMODATION_TYPES, type AccommodationLabelKey } from "@/lib/accommodationLabels";
import {
  Home, Plus, Minus, X, Copy, Cloud, Upload, Heart, Trash2, RefreshCw, Info, DollarSign,
} from "lucide-react";

// ─── Props ──────────────────────────────────────────────────────────────────
export interface RoomManagerTabProps {
  propertyId: string | null;
  propertySlug: string;
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
  const { toast } = useToast();
  const [isRoomImageUploading, setIsRoomImageUploading] = useState(false);

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
    <div className="flex gap-2 h-[calc(100vh-220px)]">
      {/* Left Sidebar - Room Types List */}
      <div className="w-56 border-r bg-muted/30 p-2 space-y-1">
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
            className={cn(
              "flex items-center justify-between p-2 rounded-md transition-colors text-xs",
              selectedRoomType === room.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              room.pms_synced && !isRolProperty && selectedRoomType !== room.id ? "bg-primary/5 border border-primary/20" : "",
              room.is_active === false && selectedRoomType !== room.id ? "opacity-50" : "",
            )}
          >
            <span
              className={cn("font-medium flex-1 cursor-pointer truncate", room.is_active === false && "line-through")}
              onClick={() => setSelectedRoomType(room.id)}
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
      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="room-type" className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="room-type" className="text-xs h-7">
              {accommodationLabel ? ACCOMMODATION_LABEL_OPTIONS.find(o => o.value === accommodationLabel)?.label || "Room" : "Room"} Type
            </TabsTrigger>
            {selectedPMS !== "nightsbridge" && (
              <TabsTrigger value="rate-types" className="text-xs h-7">Rate Types</TabsTrigger>
            )}
            <TabsTrigger value="facilities" className="text-xs h-7">Facilities</TabsTrigger>
            <TabsTrigger value="amenities" className="text-xs h-7">Amenities</TabsTrigger>
            {selectedPMS !== "nightsbridge" && (
              <TabsTrigger value="room-images" className="text-xs h-7">Images</TabsTrigger>
            )}
            {selectedPMS !== "nightsbridge" && (
              <TabsTrigger value="agreement" className="text-xs h-7">Agreement</TabsTrigger>
            )}
          </TabsList>

          {/* Room Type Sub-tab */}
          <TabsContent value="room-type" className="p-3 space-y-3">
            <div className="grid grid-cols-4 gap-2 items-end">
              <div className="col-span-2 flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap flex items-center gap-1">
                  Name
                  {isRoomFieldPmsSynced(selectedRoomType, "name") && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 bg-primary/10">
                      <Cloud className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                </Label>
                <Input
                  value={roomTypes.find((r) => r.id === selectedRoomType)?.name || ""}
                  onChange={(e) => updateRoomTypeName(selectedRoomType, e.target.value)}
                  className={cn("h-7 text-xs", getRoomPmsFieldClass(selectedRoomType, "name"))}
                  disabled={isRoomFieldPmsSynced(selectedRoomType, "name")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">
                  # {ACCOMMODATION_TYPES[accommodationLabel as AccommodationLabelKey]?.plural || "Units"}
                </Label>
                <Input
                  type="number"
                  className="h-7 text-xs w-20"
                  value={roomTypes.find((r) => r.id === selectedRoomType)?.numRooms || 1}
                  onChange={(e) => updateRoomTypeField(selectedRoomType, "numRooms", parseInt(e.target.value) || 1)}
                />
              </div>
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
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    className="text-xs min-h-[60px]"
                    placeholder="Room description..."
                    value={roomTypes.find((r) => r.id === selectedRoomType)?.description || ""}
                    onChange={(e) => updateRoomTypeField(selectedRoomType, "description", e.target.value)}
                  />
                </div>
              </div>
            )}

            {selectedPMS !== "nightsbridge" && (
              <>
                {selectedPMS && (
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div className="flex items-center gap-2">
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
                    <div className="flex items-center gap-2">
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

                <div className="flex items-start gap-2">
                  <Label className="text-xs whitespace-nowrap pt-1.5 flex items-center gap-1">
                    Description
                    {isRoomFieldPmsSynced(selectedRoomType, "description") && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 bg-primary/10">
                        <Cloud className="h-2.5 w-2.5" />
                      </Badge>
                    )}
                  </Label>
                  <Textarea
                    rows={2}
                    className={cn("text-xs flex-1", getRoomPmsFieldClass(selectedRoomType, "description"))}
                    value={roomTypes.find((r) => r.id === selectedRoomType)?.description || ""}
                    onChange={(e) => updateRoomTypeField(selectedRoomType, "description", e.target.value)}
                    disabled={isRoomFieldPmsSynced(selectedRoomType, "description")}
                  />
                </div>

                <div className="flex items-start gap-2">
                  <Label className="text-xs whitespace-nowrap pt-1.5">Extra Person Policy</Label>
                  <Textarea
                    rows={1}
                    className="text-xs flex-1"
                    value={roomTypes.find((r) => r.id === selectedRoomType)?.extraPersonPolicy || ""}
                    onChange={(e) => updateRoomTypeField(selectedRoomType, "extraPersonPolicy", e.target.value)}
                  />
                </div>

                {/* Bed Configuration Section */}
                <div className="flex items-start gap-2">
                  <Label className="text-xs whitespace-nowrap pt-1">Beds</Label>
                  <div className="border rounded-md p-2 flex-1 space-y-2">
                    {(() => {
                      const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                      const bedConfig = parseBedConfiguration(currentRoom?.bedConfiguration);
                      const capacity = calculateBedCapacity(bedConfig);
                      const maxSynced = isRoomFieldPmsSynced(selectedRoomType, "maxPeople");
                      const applyBeds = (newConfig: BedEntry[]) => {
                        updateRoomTypeField(selectedRoomType, "bedConfiguration", newConfig);
                        const newCapacity = calculateBedCapacity(newConfig);
                        if (!maxSynced && newCapacity > 0) {
                          updateRoomTypeField(selectedRoomType, "maxPeople", newCapacity);
                        }
                      };
                      return (
                        <>
                          <div className="flex flex-wrap gap-2 items-center">
                          {bedConfig.map((bed, index) => (
                            <div key={index} className="flex items-center gap-1 bg-muted/50 rounded px-2 py-1">
                              <Select
                                value={bed.type}
                                onValueChange={(value) => {
                                  const newConfig = [...bedConfig];
                                  newConfig[index] = { ...bed, type: value };
                                  applyBeds(newConfig);
                                }}
                              >
                                <SelectTrigger className="w-[110px] h-6 text-xs border-0 bg-transparent">
                                  <SelectValue placeholder="Bed type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {BED_TYPES.map((bt) => (
                                    <SelectItem key={bt.value} value={bt.value}>
                                      {bt.label} (sleeps {sleepsPerBed(bt.value)})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                                onClick={() => applyBeds(bedConfig.map((b, i) => i === index ? { ...b, count: Math.max(1, b.count - 1) } : b))}
                                disabled={bed.count <= 1}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-4 text-center text-xs font-medium">{bed.count}</span>
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                                onClick={() => applyBeds(bedConfig.map((b, i) => i === index ? { ...b, count: b.count + 1 } : b))}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {bed.count} bed{bed.count !== 1 ? "s" : ""} · sleeps {sleepsPerBed(bed.type) * bed.count}
                              </span>
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive"
                                onClick={() => applyBeds(bedConfig.filter((_, i) => i !== index))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" variant="outline" size="sm" className="h-6 text-xs"
                            onClick={() => applyBeds([...bedConfig, { type: "king", count: 1 }])}
                          >
                            <Plus className="h-3 w-3 mr-1" />Add
                          </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            The number is how many beds of that type. Sleeping capacity from beds:{" "}
                            <span className="font-medium text-foreground">{capacity} guest{capacity !== 1 ? "s" : ""}</span>
                            {!maxSynced && capacity > 0 && (currentRoom?.maxPeople || 0) !== capacity && (
                              <Button type="button" variant="link" size="sm" className="h-4 px-1 text-[10px]"
                                onClick={() => updateRoomTypeField(selectedRoomType, "maxPeople", capacity)}
                              >
                                Apply to Max ({capacity})
                              </Button>
                            )}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>


                <div className="grid grid-cols-7 gap-2 items-end">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap">Size (m²)</Label>
                    <Input type="number" className="h-7 text-xs w-16"
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.roomSize || 0}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "roomSize", parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label className="text-xs whitespace-nowrap cursor-help underline decoration-dotted">Floor</Label>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Which level the unit is on. 0 = Ground floor (street level). 1 = 1st floor (the second level in a double-storey house).
                          2 = 2nd floor (the top level of a three-storey unit), and so on. Pushed to channel managers (Rentals United).
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Select
                      value={(() => { const f = roomTypes.find((r) => r.id === selectedRoomType)?.floor; return f === null || f === undefined ? "none" : String(f); })()}
                      onValueChange={(v) => updateRoomTypeField(selectedRoomType, "floor", v === "none" ? null : parseInt(v))}
                    >
                      <SelectTrigger className="h-7 text-xs w-40">
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

                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap">Baths</Label>
                    <Input type="number" className="h-7 text-xs w-14"
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.bathrooms || 1}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "bathrooms", parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Max
                      {isRoomFieldPmsSynced(selectedRoomType, "maxPeople") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number"
                      className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, "maxPeople"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxPeople || 2}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxPeople", parseInt(e.target.value) || 1)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "maxPeople")}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Adults
                      {isRoomFieldPmsSynced(selectedRoomType, "maxAdults") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number"
                      className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, "maxAdults"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxAdults || 2}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxAdults", parseInt(e.target.value) || 1)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "maxAdults")}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Children
                      {isRoomFieldPmsSynced(selectedRoomType, "maxChildren") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number"
                      className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, "maxChildren"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxChildren || 0}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxChildren", parseInt(e.target.value) || 0)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "maxChildren")}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Min
                      {isRoomFieldPmsSynced(selectedRoomType, "minGuests") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number"
                      className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, "minGuests"))}
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
                <div className="grid grid-cols-4 gap-2 items-end">
                  <div className="flex items-center gap-1">
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
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                      Min Adults
                      {isRoomFieldPmsSynced(selectedRoomType, "minAdultsToOfferNonAdultRates") && <Cloud className="h-2.5 w-2.5 text-primary" />}
                    </Label>
                    <Input type="number" min="0"
                      className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, "minAdultsToOfferNonAdultRates"))}
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.minAdultsToOfferNonAdultRates || 0}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "minAdultsToOfferNonAdultRates", parseInt(e.target.value) || 0)}
                      disabled={isRoomFieldPmsSynced(selectedRoomType, "minAdultsToOfferNonAdultRates")}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap">Min Stay</Label>
                    <Input type="number" className="h-7 text-xs w-14"
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.minStay || 1}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "minStay", parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap">Max Stay</Label>
                    <Input type="number" className="h-7 text-xs w-14"
                      value={roomTypes.find((r) => r.id === selectedRoomType)?.maxStay || 0}
                      onChange={(e) => updateRoomTypeField(selectedRoomType, "maxStay", parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="bg-info-surface border border-info-border rounded-md p-2">
                  <p className="text-xs text-info">
                    <strong>INFO:</strong> Align "Max adult" with rate type if Person Rate is applied.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Rate Info</h3>
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

          {/* Facilities Sub-tab */}
          <TabsContent value="facilities" className="p-6 space-y-4">
            <div className="bg-warning-surface border border-warning-border rounded-md p-2 mb-4">
              <p className="text-sm text-warning">
                <strong>Manual Entry:</strong> Facilities are not available from the PMS API. Select the facilities available in this room type.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-6">
              {/* Cooking & Kitchen */}
              <FacilityChecklistGroup
                title="Cooking & Kitchen"
                items={["Braai/Barbeque Facilities","Coffee/tea facilities","Electric kettle","Kitchenette","Microwave","Oven","Refrigerator","Toaster","Two Plate Stove","Dining Table"]}
                roomTypes={roomTypes}
                selectedRoomType={selectedRoomType}
                updateRoomTypeField={updateRoomTypeField}
                fieldKey="facilities"
              />
              {/* Room Features */}
              <FacilityChecklistGroup
                title="Room Features"
                items={["Airconditioned room","Heating","Electric blankets","Hypoallergenic","Desk","Sitting area","DSTV/Satellite TV","Flat screen TV","Telephone","Shared lounge/TV area","Non-smoking","Patio","Terrace","Outdoor Furniture","Outdoor dining area"]}
                roomTypes={roomTypes}
                selectedRoomType={selectedRoomType}
                updateRoomTypeField={updateRoomTypeField}
                fieldKey="facilities"
              />
              {/* Bathroom & Laundry */}
              <FacilityChecklistGroup
                title="Bathroom & Laundry"
                items={["Shower and bath","Hairdryer","Cleaning Service","Daily housekeeping","Iron","Ironing board","Ironing service","Laundry","Trouser press","Washing machine"]}
                roomTypes={roomTypes}
                selectedRoomType={selectedRoomType}
                updateRoomTypeField={updateRoomTypeField}
                fieldKey="facilities"
              />
              {/* Security & Safety + View */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Security & Safety</h4>
                {["Safe","Safety deposit box","Fire extinguishers","Key access","24-hour security"].map((item) => (
                  <ChecklistItem key={item} item={item} roomTypes={roomTypes} selectedRoomType={selectedRoomType} updateRoomTypeField={updateRoomTypeField} fieldKey="facilities" />
                ))}
                <h4 className="font-semibold text-sm pt-4">View</h4>
                {["Garden view","Landmark view","Mountain view","Pool view"].map((item) => (
                  <ChecklistItem key={item} item={item} roomTypes={roomTypes} selectedRoomType={selectedRoomType} updateRoomTypeField={updateRoomTypeField} fieldKey="facilities" />
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Amenities Sub-tab */}
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
                <div className="bg-warning-surface border border-warning-border rounded-md p-2 mb-4">
                  <p className="text-sm text-warning">
                    <strong>Manual Entry:</strong> Amenities are not available from the PMS API. Select the amenities available in this room type.
                  </p>
                </div>
              );
            })()}
            <RUAmenityPicker
              value={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities) as string[]}
              onChange={(next) => updateRoomTypeField(selectedRoomType, "amenities", next)}
            />

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
            <div className="grid grid-cols-6 gap-4">
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
                <div key={index} className="relative aspect-video rounded-lg overflow-hidden border border-border group">
                  <img src={imageUrl} alt={`Room ${index + 1}`} className="w-full h-full object-cover" />
                  {index === 0 ? (
                    <div className="absolute top-2 left-2 bg-primary rounded-full p-1.5" title="Primary room image">
                      <Heart className="h-3 w-3 text-white fill-white" />
                    </div>
                  ) : (
                    <button type="button"
                      onClick={() => {
                        const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                        if (currentRoom?.images) {
                          const newImages = [...currentRoom.images];
                          const [selected] = newImages.splice(index, 1);
                          newImages.unshift(selected);
                          updateRoomTypeField(selectedRoomType, "images", newImages);
                        }
                      }}
                      className="absolute top-2 left-2 bg-muted-foreground/60 hover:bg-primary rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Set as primary room image"
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
