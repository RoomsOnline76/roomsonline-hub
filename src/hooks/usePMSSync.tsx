import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseHostfullyProperties } from "@/lib/hostfullyBuildingParser";
import { LucideIcon, Key, BedDouble, RefreshCw, CheckCircle, Briefcase, Layers, Building2 } from "lucide-react";
import { pmsIntegrationStatus } from "@/components/ApiMilestones";

// Check if a PMS is fully integrated (all milestones complete)
export const isPMSFullyIntegrated = (systemType: string): boolean => {
  const status = pmsIntegrationStatus[systemType];
  if (!status) return false;
  return Object.values(status).every((v) => v === true);
};

// Check if a PMS has any integration progress
export const getPMSIntegrationLevel = (systemType: string): "none" | "partial" | "full" => {
  const status = pmsIntegrationStatus[systemType];
  if (!status) return "none";
  const values = Object.values(status);
  const completeCount = values.filter((v) => v === true).length;
  const pendingCount = values.filter((v) => v === "pending").length;
  if (completeCount === values.length) return "full";
  if (completeCount > 0 || pendingCount > 0) return "partial";
  return "none";
};

// Map PMS system types to icons
export const getPMSIcon = (systemType: string): LucideIcon => {
  switch (systemType) {
    case "roomsonline":
      return Key;
    case "nightsbridge":
      return BedDouble;
    case "semper":
      return RefreshCw;
    case "checkfront":
      return CheckCircle;
    case "benson":
      return Briefcase;
    case "siteminder":
      return Layers;
    case "littlehotelier":
    case "cloudbeds":
    case "hostfully":
    case "mews":
    case "opera":
      return BedDouble;
    default:
      return Building2;
  }
};

interface UsePMSSyncProps {
  propertyId: string;
  formData: { name: string; [key: string]: any };
  roomTypes: any[];
  setRoomTypes: React.Dispatch<React.SetStateAction<any[]>>;
  selectedRoomType: string;
  setSelectedRoomType: (id: string) => void;
  pmsRateTypes: any[];
  setPmsRateTypes: React.Dispatch<React.SetStateAction<any[]>>;
  setIsDirty: (dirty: boolean) => void;
  setLatitude: (lat: number | null) => void;
  setLongitude: (lng: number | null) => void;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  roomsonlineActive: boolean;
}

export interface ExistingExternalIds {
  nightsbridge_bb_id?: string | null;
  semper_venue_id?: string | null;
  semper_channel_id?: string | null;
  semper_account_id?: string | null;
  semper_agent_id?: string | null;
  siteminder_id?: string | null;
  checkfront_id?: string | null;
  benson_id?: string | null;
  tripadvisor_id?: string | null;
  google_place_id?: string | null;
}

export function usePMSSync({
  propertyId,
  formData,
  roomTypes,
  setRoomTypes,
  selectedRoomType,
  setSelectedRoomType,
  pmsRateTypes,
  setPmsRateTypes,
  setIsDirty,
  setLatitude,
  setLongitude,
  setFormData,
  roomsonlineActive,
}: UsePMSSyncProps) {
  const { toast } = useToast();

  // PMS state
  const [selectedPMS, setSelectedPMS] = useState<string>("");
  const [availablePMSSystems, setAvailablePMSSystems] = useState<
    { key_name: string; name: string; system_type: string }[]
  >([]);
  const [bensonPropertyCode, setBensonPropertyCode] = useState<string>("");
  const [bensonEnvironment, setBensonEnvironment] = useState<"staging" | "production">("production");
  const [cloudbedsPropertyId, setCloudbedsPropertyId] = useState<string>("");
  const [littlehotelierChannelCode, setLittlehotelierChannelCode] = useState<string>("");
  const [littlehotelierRegion, setLittlehotelierRegion] = useState<"apac" | "emea">("apac");
  const [hotelbedsHotelCode, setHotelbedsHotelCode] = useState<string>("");
  const [hostfullyPropertyUid, setHostfullyPropertyUid] = useState<string>("");
  const [isSyncingPms, setIsSyncingPms] = useState(false);
  const [lastPmsSync, setLastPmsSync] = useState<Date | null>(null);
  const [isSyncEditorialDialogOpen, setIsSyncEditorialDialogOpen] = useState(false);

  // Existing external IDs
  const [existingExternalIds, setExistingExternalIds] = useState<ExistingExternalIds>({});
  const [tripadvisorId, setTripadvisorId] = useState<string>("");
  const [googlePlaceId, setGooglePlaceId] = useState<string>("");
  const [existingBensonPropertyCode, setExistingBensonPropertyCode] = useState<string | null>(null);
  const [existingCloudbedsPropertyId, setExistingCloudbedsPropertyId] = useState<string | null>(null);
  const [existingLittlehotelierChannelCode, setExistingLittlehotelierChannelCode] = useState<string | null>(null);
  const [existingLittlehotelierRegion, setExistingLittlehotelierRegion] = useState<string | null>(null);
  const [existingHotelbedsHotelCode, setExistingHotelbedsHotelCode] = useState<string | null>(null);
  const [existingHostfullyPropertyUid, setExistingHostfullyPropertyUid] = useState<string | null>(null);

  // Hostfully import and warning states
  const [ownerPmsCredentialId, setOwnerPmsCredentialId] = useState<string | null>(null);
  const [hostfullyRoomCount, setHostfullyRoomCount] = useState(0);
  const [importingHostfullyRooms, setImportingHostfullyRooms] = useState(false);
  const [showHostfullyWarning, setShowHostfullyWarning] = useState(false);
  const [previousPMS, setPreviousPMS] = useState<string>("");
  const [syncingRoomId, setSyncingRoomId] = useState<string | null>(null);
  const [fullSyncingHostfully, setFullSyncingHostfully] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ phase: string; current: number; total: number } | null>(null);

  // Helper: Extract image URLs from Hostfully photos
  const extractImageUrls = (images: any[]): string[] => {
    if (!Array.isArray(images)) return [];
    return images.map(img => typeof img === 'string' ? img : (img.url || img.original)).filter(Boolean);
  };

  // Helper: Map Hostfully amenities to ROL format
  const mapHostfullyAmenities = (amenities: any[]): string[] => {
    if (!Array.isArray(amenities)) return [];
    return amenities.map(a => typeof a === 'string' ? a : a.name).filter(Boolean);
  };

  // Handle importing Hostfully rooms from the owner's agency
  const handleImportHostfullyRooms = async () => {
    if (!propertyId || !ownerPmsCredentialId) {
      toast({
        title: "Cannot Import",
        description: "Property must be linked to an owner's Hostfully account",
        variant: "destructive",
      });
      return;
    }

    setImportingHostfullyRooms(true);
    try {
      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: {
          action: "list_all_properties",
          owner_credential_id: ownerPmsCredentialId,
        },
      });

      if (error) throw error;
      if (!data?.data?.properties) {
        throw new Error("No properties returned from Hostfully");
      }

      const buildings = parseHostfullyProperties(data.data.properties);
      const matchingBuilding = buildings.find(
        (b) => b.building_name.toUpperCase() === formData.name.toUpperCase()
      );

      if (!matchingBuilding) {
        toast({
          title: "No Matching Building",
          description: `Could not find a building named "${formData.name}" in Hostfully. Available: ${buildings.map(b => b.building_name).join(", ")}`,
          variant: "destructive",
        });
        setImportingHostfullyRooms(false);
        return;
      }

      let successCount = 0;
      const importedRooms: typeof roomTypes = [];

      for (const unit of matchingBuilding.units) {
        const roomName = `${unit.room_number} ${unit.room_type}`.trim() || unit.name;
        const { error: upsertError } = await supabase
          .from("hostfully_room_types")
          .upsert(
            {
              property_id: propertyId,
              hostfully_room_id: unit.id,
              name: roomName,
              is_active: true,
            },
            { onConflict: "property_id,hostfully_room_id" }
          );

        if (!upsertError) {
          successCount++;
          importedRooms.push({
            id: unit.id,
            name: roomName,
            url: "",
            selected: false,
            numRooms: 1,
            pmsRoomType: unit.room_type || "",
            pmsRoomId: unit.id,
            description: "",
            extraPersonPolicy: "",
            bedConfiguration: [],
            roomSize: 0,
            bathrooms: 1,
            maxPeople: 2,
            maxAdults: 2,
            maxChildren: 0,
            minStay: 1,
            maxStay: 0,
            rateType: "per-unit",
            splitPercent: 0,
            images: [],
            facilities: [],
            amenities: [],
          });
        }
      }

      if (importedRooms.length > 0) {
        setRoomTypes(importedRooms);
        setIsDirty(true);
      }

      const { count } = await supabase
        .from("hostfully_room_types")
        .select("*", { count: "exact", head: true })
        .eq("property_id", propertyId);
      setHostfullyRoomCount(count || 0);

      toast({
        title: "Import Complete",
        description: `Synced ${importedRooms.length} room types from "${matchingBuilding.building_name}"`,
      });
    } catch (err: any) {
      console.error("Hostfully import error:", err);
      toast({
        title: "Import Failed",
        description: err.message || "Failed to import Hostfully rooms",
        variant: "destructive",
      });
    } finally {
      setImportingHostfullyRooms(false);
    }
  };

  // Sync single room from Hostfully API
  const syncRoomFromHostfully = async (roomId: string) => {
    const room = roomTypes.find(r => r.id === roomId);
    if (!room?.pmsRoomId) {
      toast({ title: "No Hostfully ID", description: "This room has no linked Hostfully ID", variant: "destructive" });
      return;
    }

    setSyncingRoomId(roomId);

    try {
      const { data: property } = await supabase
        .from("properties")
        .select("owner_pms_credential_id, owner_email")
        .eq("id", propertyId)
        .single();

      let credentialId = property?.owner_pms_credential_id;

      if (!credentialId && property?.owner_email) {
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", property.owner_email)
          .maybeSingle();

        if (ownerProfile?.id) {
          const { data: credential } = await supabase
            .from("owner_pms_credentials")
            .select("id")
            .eq("owner_id", ownerProfile.id)
            .eq("system_type", "hostfully")
            .eq("is_active", true)
            .maybeSingle();

          credentialId = credential?.id;

          if (credentialId) {
            await supabase
              .from("properties")
              .update({ owner_pms_credential_id: credentialId })
              .eq("id", propertyId);
          }
        }
      }

      if (!credentialId) {
        throw new Error("No owner PMS credential linked to this property");
      }

      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: {
          action: "get_listing_details",
          owner_credential_id: credentialId,
          propertyUid: room.pmsRoomId,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error?.message || "Failed to fetch room details from Hostfully");
      }

      const hf = data.data;
      console.log("Hostfully comprehensive room data:", hf);

      const syncedFields = [
        "name", "description", "maxPeople", "maxAdults", "minGuests", "bathrooms",
        "roomSize", "beds", "images", "amenities", "minStay", "maxStay",
        "checkInTime", "checkOutTime", "dailyRate", "currency", "cleaningFee",
        "securityDeposit", "extraGuestFee", "taxRate", "propertyType",
        "wifiNetwork", "wifiPassword", "houseRules", "checkInInstructions", "cancellationPolicy",
        "addressStreet", "addressCity", "addressState", "addressPostalCode", "addressCountry",
        "latitude", "longitude", "thumbnailUrl"
      ];

      const updatedFields: Partial<typeof room> = {
        name: hf.name || room.name,
        description: hf.description || room.description,
        maxPeople: hf.max_guests || room.maxPeople,
        maxAdults: hf.max_guests || room.maxAdults,
        minGuests: hf.min_guests || room.minGuests || 1,
        bathrooms: hf.bathrooms || room.bathrooms,
        roomSize: hf.room_size || room.roomSize,
        bedConfiguration: hf.beds ? [{ type: 'bed', count: hf.beds }] : room.bedConfiguration,
        minStay: hf.min_stay || room.minStay || 1,
        maxStay: hf.max_stay || room.maxStay,
        checkInTime: hf.check_in_time || room.checkInTime,
        checkOutTime: hf.check_out_time || room.checkOutTime,
        propertyType: hf.property_type || room.propertyType,
        images: (hf.images && hf.images.length > 0) ? hf.images : room.images,
        thumbnailUrl: hf.thumbnail || room.thumbnailUrl,
        amenities: (hf.amenities && hf.amenities.length > 0) ? hf.amenities : room.amenities,
        dailyRate: hf.daily_rate || room.dailyRate,
        currency: hf.currency || room.currency || 'ZAR',
        cleaningFee: hf.cleaning_fee || room.cleaningFee,
        securityDeposit: hf.security_deposit || room.securityDeposit,
        extraGuestFee: hf.extra_guest_fee || room.extraGuestFee,
        taxRate: hf.tax_rate || room.taxRate,
        wifiNetwork: hf.wifi_network || room.wifiNetwork,
        wifiPassword: hf.wifi_password || room.wifiPassword,
        houseRules: hf.house_rules || room.houseRules,
        checkInInstructions: hf.check_in_instructions || room.checkInInstructions,
        cancellationPolicy: hf.cancellation_policy || room.cancellationPolicy,
        addressStreet: hf.address?.street || room.addressStreet,
        addressCity: hf.address?.city || room.addressCity,
        addressState: hf.address?.state || room.addressState,
        addressPostalCode: hf.address?.postal_code || room.addressPostalCode,
        addressCountry: hf.address?.country || room.addressCountry,
        latitude: hf.location?.latitude || room.latitude,
        longitude: hf.location?.longitude || room.longitude,
        lastSyncedAt: new Date().toISOString(),
        pms_synced_fields: syncedFields,
      };

      setRoomTypes(prev => prev.map(r =>
        r.id === roomId ? { ...r, ...updatedFields } : r
      ));

      const dbUpdate = {
        name: hf.name,
        description: hf.description,
        max_guests: hf.max_guests,
        min_guests: hf.min_guests,
        bedrooms: hf.bedrooms,
        bathrooms: hf.bathrooms,
        beds: hf.beds,
        room_size: hf.room_size,
        room_size_unit: hf.room_size_unit || 'SQUARE_METERS',
        daily_rate: hf.daily_rate,
        currency: hf.currency || 'ZAR',
        cleaning_fee: hf.cleaning_fee,
        security_deposit: hf.security_deposit,
        extra_guest_fee: hf.extra_guest_fee,
        tax_rate: hf.tax_rate,
        min_stay: hf.min_stay,
        max_stay: hf.max_stay,
        check_in_time: hf.check_in_time,
        check_out_time: hf.check_out_time,
        property_type: hf.property_type,
        images: hf.images || [],
        amenities: hf.amenities || [],
        thumbnail_url: hf.thumbnail,
        wifi_network: hf.wifi_network,
        wifi_password: hf.wifi_password,
        check_in_instructions: hf.check_in_instructions,
        house_rules: hf.house_rules,
        cancellation_policy: hf.cancellation_policy,
        address_street: hf.address?.street,
        address_city: hf.address?.city,
        address_state: hf.address?.state,
        address_postal_code: hf.address?.postal_code,
        address_country: hf.address?.country,
        latitude: hf.location?.latitude,
        longitude: hf.location?.longitude,
        pms_synced_fields: syncedFields,
        last_synced_at: new Date().toISOString(),
        raw_data: hf._raw || hf,
      };

      await supabase.from("hostfully_room_types").update(dbUpdate).eq("id", roomId);

      const syncedCount = Object.values(dbUpdate).filter(v => v !== null && v !== undefined).length;

      setIsDirty(true);
      toast({
        title: "Room Synced",
        description: `Updated ${syncedCount} fields for "${room.name}" from Hostfully`
      });
    } catch (err: any) {
      console.error("Hostfully room sync error:", err);
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncingRoomId(null);
    }
  };

  // Consolidated Hostfully sync
  const handleFullHostfullySync = async () => {
    if (!propertyId) {
      toast({ title: "Cannot Sync", description: "Property must be saved first", variant: "destructive" });
      return;
    }
    const hasOwnerCredential = !!ownerPmsCredentialId;
    const hasPropertyUid = !!hostfullyPropertyUid;
    if (!hasOwnerCredential && !hasPropertyUid) {
      toast({ title: "Cannot Sync", description: "Property must be linked to a Hostfully account or have a Property UID", variant: "destructive" });
      return;
    }

    setFullSyncingHostfully(true);
    setSyncProgress({ phase: "Running ingestion pipeline...", current: 0, total: 1 });

    try {
      // Step 1: Run full_ingest_property via orchestrator
      const ingestBody: Record<string, string> = {
        action: "full_ingest_property",
        rol_property_id: propertyId,
        property_id: propertyId,
      };
      if (hasPropertyUid) ingestBody.propertyUid = hostfullyPropertyUid;
      if (hasOwnerCredential) ingestBody.owner_credential_id = ownerPmsCredentialId!;

      const { data: ingestData, error: ingestError } = await supabase.functions.invoke("hostfully-api", {
        body: ingestBody,
      });

      if (ingestError || !ingestData?.success) {
        console.error("[Sync] Orchestrator failed:", ingestData?.error || ingestError);
        if (!hasOwnerCredential) {
          throw new Error(ingestData?.error?.message || ingestError?.message || "Ingestion failed");
        }
        toast({ title: "Orchestrator incomplete", description: "Continuing with per-room sync..." });
      } else {
        console.log("[Sync] Orchestrator complete:", ingestData.data);
      }

      // Step 2: Per-room sync (only if owner credential available)
      if (hasOwnerCredential) {
        const { data: existingRooms, error: fetchError } = await supabase
          .from("hostfully_room_types")
          .select("id, hostfully_room_id, name")
          .eq("property_id", propertyId)
          .not("hostfully_room_id", "is", null)
          .order("name");

        if (fetchError) throw fetchError;

        console.log("[DEBUG] Raw rooms from DB:", existingRooms?.map(r => r.name));

        if (!existingRooms || existingRooms.length === 0) {
          console.log("[Sync] No rooms found for per-room sync, skipping detail fetch");
        } else {
          const sortedRooms = [...existingRooms].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true })
          );

          console.log("[DEBUG] Sorted rooms:", sortedRooms.map(r => r.name));

          toast({
            title: "DEBUG: Rooms Found",
            description: `${sortedRooms.length} rooms (sorted): ${sortedRooms.slice(0, 3).map(r => r.name).join(', ')}...`,
          });

          const roomsToSync = sortedRooms;
          setSyncProgress({
            phase: "Syncing room data...",
            current: 0,
            total: roomsToSync.length
          });

          let syncedCount = 0;
          for (const room of roomsToSync) {
            setSyncProgress({
              phase: `Syncing ${room.name}...`,
              current: syncedCount + 1,
              total: roomsToSync.length,
            });

            toast({
              title: "DEBUG: Calling API",
              description: `Room: ${room.name}, UID: ${room.hostfully_room_id}`,
            });

            const { data: roomData, error: roomError } = await supabase
              .functions.invoke("hostfully-api", {
                body: {
                  action: "get_listing_details",
                  owner_credential_id: ownerPmsCredentialId,
                  propertyUid: room.hostfully_room_id,
                },
              });

            console.log("[DEBUG] API Response for", room.name, ":", roomData);

            if (roomError) {
              console.error("[DEBUG] API Error:", roomError);
              toast({
                title: "DEBUG: API Failed",
                description: `${room.name}: ${roomError.message}`,
                variant: "destructive",
              });
              continue;
            }

            if (!roomData?.success) {
              console.error("[DEBUG] API returned failure:", roomData);
              toast({
                title: "DEBUG: API Returned Failure",
                description: `${room.name}: ${roomData?.error || 'Unknown error'}`,
                variant: "destructive",
              });
              continue;
            }

            const hf = roomData.data;

            toast({
              title: "DEBUG: API Success",
              description: `Received: ${hf.name}, guests: ${hf.max_guests}, rate: ${hf.daily_rate}`,
            });

            const dbUpdate = {
              description: hf.description,
              max_guests: hf.max_guests,
              min_guests: hf.min_guests,
              bedrooms: hf.bedrooms,
              bathrooms: hf.bathrooms,
              beds: hf.beds,
              room_size: hf.room_size,
              room_size_unit: hf.room_size_unit || "SQUARE_METERS",
              daily_rate: hf.daily_rate,
              currency: hf.currency || "ZAR",
              cleaning_fee: hf.cleaning_fee,
              security_deposit: hf.security_deposit,
              extra_guest_fee: hf.extra_guest_fee,
              tax_rate: hf.tax_rate,
              min_stay: hf.min_stay,
              max_stay: hf.max_stay,
              check_in_time: hf.check_in_time,
              check_out_time: hf.check_out_time,
              property_type: hf.property_type,
              images: hf.images || [],
              amenities: hf.amenities || [],
              thumbnail_url: hf.thumbnail,
              wifi_network: hf.wifi_network,
              wifi_password: hf.wifi_password,
              check_in_instructions: hf.check_in_instructions,
              house_rules: hf.house_rules,
              cancellation_policy: hf.cancellation_policy,
              address_street: hf.address?.street,
              address_city: hf.address?.city,
              address_state: hf.address?.state,
              address_postal_code: hf.address?.postal_code,
              address_country: hf.address?.country,
              latitude: hf.latitude || hf.address?.latitude,
              longitude: hf.longitude || hf.address?.longitude,
              pms_synced_fields: [
                "name", "description", "maxPeople", "maxAdults", "minGuests",
                "bathrooms", "roomSize", "beds", "images", "amenities",
                "minStay", "maxStay", "checkInTime", "checkOutTime",
                "dailyRate", "currency", "cleaningFee", "securityDeposit",
                "extraGuestFee", "taxRate", "propertyType", "wifiNetwork",
                "wifiPassword", "houseRules", "checkInInstructions",
                "cancellationPolicy", "addressStreet", "addressCity",
                "addressState", "addressPostalCode", "addressCountry",
                "latitude", "longitude", "thumbnailUrl",
              ],
              last_synced_at: new Date().toISOString(),
              raw_data: hf._raw || hf,
            };

            console.log("[DEBUG] Writing to DB:", dbUpdate);

            const { error: updateError } = await supabase
              .from("hostfully_room_types")
              .update(dbUpdate)
              .eq("id", room.id);

            if (updateError) {
              console.error("[DEBUG] DB Update failed:", updateError);
              toast({
                title: "DEBUG: DB Update Failed",
                description: `${room.name}: ${updateError.message}`,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Room Synced Successfully",
                description: `Updated: ${hf.name || room.name}`,
              });
              syncedCount++;
            }
          }

          // Refetch ALL room data to update UI
          const { data: refreshedRooms, error: refreshError } = await supabase
            .from("hostfully_room_types")
            .select("*")
            .eq("property_id", propertyId)
            .order("name");

          if (!refreshError && refreshedRooms && refreshedRooms.length > 0) {
            const convertedRooms = refreshedRooms.map(hr => {
              const bedConfig = Array.isArray(hr.bed_configuration) && hr.bed_configuration.length > 0
                ? hr.bed_configuration
                : (Array.isArray(hr.beds)
                  ? hr.beds
                  : (typeof hr.beds === 'number' && hr.beds > 0
                    ? [{ type: 'bed', count: hr.beds }]
                    : []));

              const roomRateType = hr.rate_type || 'per-unit';
              const facilitiesRaw = hr.facilities_raw || [];

              return {
                id: hr.id,
                name: hr.name || "Unnamed Room",
                url: "",
                selected: false,
                numRooms: 1,
                pmsRoomType: hr.name,
                pmsRoomId: hr.hostfully_room_id,
                hostfullyId: hr.hostfully_room_id,
                description: hr.description || "",
                extraPersonPolicy: hr.extra_person_policy || "",
                bedConfiguration: bedConfig,
                roomSize: hr.room_size || 0,
                bathrooms: hr.bathrooms || 1,
                maxPeople: hr.max_guests || 2,
                maxAdults: hr.max_guests || 2,
                minGuests: hr.min_guests || 1,
                maxChildren: 0,
                minStay: hr.min_stay || 1,
                maxStay: hr.max_stay || 0,
                rateType: roomRateType,
                splitPercent: 0,
                images: Array.isArray(hr.images)
                  ? hr.images.map((img: any) => typeof img === 'string' ? img : img?.url).filter(Boolean)
                  : [],
                facilities: facilitiesRaw,
                facilitiesRaw: facilitiesRaw,
                amenities: hr.amenities || [],
                linkedRateTypeIds: hr.linked_rate_type_ids || [roomRateType],
                checkInTime: hr.check_in_time ? `${String(hr.check_in_time).padStart(2, '0')}:00` : null,
                checkOutTime: hr.check_out_time ? `${String(hr.check_out_time).padStart(2, '0')}:00` : null,
                propertyType: hr.property_type,
                dailyRate: hr.daily_rate,
                currency: hr.currency || 'ZAR',
                cleaningFee: hr.cleaning_fee,
                securityDeposit: hr.security_deposit,
                extraGuestFee: hr.extra_guest_fee,
                taxRate: hr.tax_rate,
                wifiNetwork: hr.wifi_network,
                wifiPassword: hr.wifi_password,
                houseRules: hr.house_rules,
                checkInInstructions: hr.check_in_instructions,
                cancellationPolicy: hr.cancellation_policy,
                addressStreet: hr.address_street,
                addressCity: hr.address_city,
                addressState: hr.address_state,
                addressPostalCode: hr.address_postal_code,
                addressCountry: hr.address_country,
                latitude: hr.latitude,
                longitude: hr.longitude,
                thumbnailUrl: hr.thumbnail_url,
                lastSyncedAt: hr.last_synced_at,
                pms_synced_fields: hr.pms_synced_fields || [],
                is_active: hr.is_active !== false,
              };
            });

            setRoomTypes(convertedRooms);
            setHostfullyRoomCount(convertedRooms.length);
            console.log("[DEBUG] UI State Updated with", convertedRooms.length, "rooms");

            if (convertedRooms.length > 0) {
              const existingSelection = convertedRooms.find(r => r.id === selectedRoomType);
              if (!existingSelection) {
                setSelectedRoomType(convertedRooms[0].id);
              }
            }

            // Update property-level GPS & address from first room with coords
            const roomWithCoords = convertedRooms.find(r => r.latitude && r.longitude);
            if (roomWithCoords) {
              setLatitude(roomWithCoords.latitude);
              setLongitude(roomWithCoords.longitude);

              setFormData((prev: any) => ({
                ...prev,
                address: roomWithCoords.addressStreet || prev.address,
                city: roomWithCoords.addressCity || prev.city,
                country: roomWithCoords.addressCountry || prev.country,
                postal_code: roomWithCoords.addressPostalCode || prev.postal_code,
                property_type: roomWithCoords.propertyType?.toLowerCase() || prev.property_type,
              }));

              const { data: currentProperty } = await supabase
                .from("properties")
                .select("amenities")
                .eq("id", propertyId)
                .single();

              const currentAmenities = currentProperty?.amenities as Record<string, unknown> || {};
              const updatedAmenities = {
                ...currentAmenities,
                address_details: {
                  ...(currentAmenities.address_details as Record<string, unknown> || {}),
                  postal_code: roomWithCoords.addressPostalCode,
                },
              };

              const { error: updateError } = await supabase
                .from("properties")
                .update({
                  latitude: roomWithCoords.latitude,
                  longitude: roomWithCoords.longitude,
                  address: roomWithCoords.addressStreet || undefined,
                  city: roomWithCoords.addressCity || undefined,
                  country: roomWithCoords.addressCountry || undefined,
                  property_type: roomWithCoords.propertyType?.toLowerCase() || undefined,
                  amenities: updatedAmenities,
                })
                .eq("id", propertyId);

              if (updateError) {
                console.error("[DEBUG] Property update FAILED:", updateError);
              }

              console.log("[DEBUG] Property fields updated from first room:", {
                address: roomWithCoords.addressStreet,
                city: roomWithCoords.addressCity,
                postal_code: roomWithCoords.addressPostalCode,
                country: roomWithCoords.addressCountry,
                latitude: roomWithCoords.latitude,
                longitude: roomWithCoords.longitude,
                property_type: roomWithCoords.propertyType,
              });
            }
          }

          // Sync normalized room_types back to amenities
          if (refreshedRooms && refreshedRooms.length > 0) {
            const { data: currentPropData } = await supabase
              .from("properties")
              .select("amenities")
              .eq("id", propertyId)
              .single();

            const currentAmenities = (currentPropData?.amenities as Record<string, unknown>) || {};
            const amenitiesRoomTypes = refreshedRooms.map(hr => ({
              id: hr.id,
              pmsRoomId: hr.hostfully_room_id,
              pmsRoomType: hr.property_type || hr.name,
              name: hr.name,
              description: hr.description || '',
              maxPeople: hr.max_guests || 2,
              maxAdults: hr.max_guests || 2,
              minGuests: hr.min_guests || 1,
              numRooms: 1,
              bedrooms: hr.bedrooms || 1,
              bathrooms: hr.bathrooms || 1,
              beds: hr.beds || 1,
              roomSize: hr.room_size || 0,
              checkInTime: hr.check_in_time || '',
              checkOutTime: hr.check_out_time || '',
              dailyRate: hr.daily_rate || 0,
              currency: hr.currency || 'ZAR',
              cleaningFee: hr.cleaning_fee || 0,
              securityDeposit: hr.security_deposit || 0,
              extraGuestFee: hr.extra_guest_fee || 0,
              rateType: hr.rate_type || 'per-unit',
              linkedRateTypeIds: hr.linked_rate_type_ids || ['per-unit'],
              propertyType: hr.property_type || '',
              images: Array.isArray(hr.images)
                ? hr.images.map((img: any) => typeof img === 'string' ? img : (img as any)?.url).filter(Boolean)
                : [],
              thumbnailUrl: hr.thumbnail_url || (Array.isArray(hr.images) && (hr.images[0] as any)?.url) || '',
              amenities: [],
              facilities: [],
              facilitiesRaw: hr.facilities_raw || [],
              selected: false,
              splitPercent: 0,
              pms_synced_fields: hr.pms_synced_fields || [],
              lastSyncedAt: hr.last_synced_at,
            }));

            const { error: amenitySyncError } = await supabase
              .from("properties")
              .update({
                amenities: { ...currentAmenities, room_types: amenitiesRoomTypes },
                last_pms_sync_at: new Date().toISOString(),
              })
              .eq("id", propertyId);

            if (amenitySyncError) {
              console.error("[Sync] Failed to update amenities.room_types:", amenitySyncError);
            } else {
              console.log(`[Sync] Synced ${amenitiesRoomTypes.length} rooms to amenities.room_types with normalized images`);
            }
          }
        } // end else (rooms found)
      } // end if (hasOwnerCredential)

      toast({
        title: "Hostfully Sync Complete",
        description: "All rooms synced – UI and showcase data updated",
      });
    } catch (err: any) {
      console.error("Full Hostfully sync error:", err);
      toast({
        title: "Sync Failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setFullSyncingHostfully(false);
      setSyncProgress(null);
    }
  };

  // Sync from Benson
  const syncFromBenson = async () => {
    if (!bensonPropertyCode || !propertyId) {
      toast({
        title: "Cannot Sync",
        description: "Please save the property with a Benson property code first",
        variant: "destructive",
      });
      return;
    }

    setIsSyncingPms(true);
    try {
      const formatSyncDate = (date: Date) => date.toISOString().split("T")[0];

      const { data, error } = await supabase.functions.invoke("benson-api", {
        body: {
          action: "fetch_property_data",
          property_id: propertyId,
        },
      });

      if (error) throw error;

      if (data?.success === false && data?.error) {
        throw new Error(data.error.message || "Unknown error");
      }

      const responseData = data?.data || data;
      let canonicalRecordsRebuilt = false;

      try {
        const availabilityStart = new Date();
        const availabilityEnd = new Date();
        availabilityEnd.setDate(availabilityEnd.getDate() + 30);

        const { data: availabilitySyncData, error: availabilitySyncError } = await supabase.functions.invoke("benson-api", {
          body: {
            action: "fetch_availability",
            property_id: propertyId,
            start_date: formatSyncDate(availabilityStart),
            end_date: formatSyncDate(availabilityEnd),
          },
        });

        if (availabilitySyncError) throw availabilitySyncError;
        if (availabilitySyncData?.success === false && availabilitySyncData?.error) {
          throw new Error(availabilitySyncData.error.message || "Failed to rebuild Benson room and rate records");
        }

        const availabilityPayload = availabilitySyncData?.data || availabilitySyncData;
        canonicalRecordsRebuilt = Array.isArray(availabilityPayload?.room_types) && availabilityPayload.room_types.length > 0;
      } catch (availabilityErr) {
        console.warn("Benson availability rebuild warning:", availabilityErr);
      }

      let hasChanges = false;

      // Update room types from PMS
      const roomTypesArray = responseData?.room_types || responseData?.roomTypes || [];
      if (Array.isArray(roomTypesArray) && roomTypesArray.length > 0) {
        const pmsRoomTypesData = roomTypesArray.map((rt: any) => {
          const pmsSyncedFields: string[] = ["name", "pmsRoomId"];
          const roomTypeId = rt.room_type_id ?? rt.id;

          const roomData: any = {
            id: roomTypeId?.toString() || Date.now().toString(),
            name: rt.name || `Room Type ${roomTypeId}`,
            url: "",
            selected: false,
            pms_id: roomTypeId,
            pmsRoomId: roomTypeId?.toString() || "",
            pms_synced: true,
          };

          if (rt.description) {
            roomData.description = rt.description;
            pmsSyncedFields.push("description");
          }

          const maxGuests = rt.max_guests ?? rt.maxGuests ?? rt.maxPeople;
          const minGuests = rt.min_guests ?? rt.minGuests ?? rt.minPeople;

          if (maxGuests !== undefined) {
            roomData.maxPeople = maxGuests;
            roomData.maxAdults = maxGuests;
            pmsSyncedFields.push("maxPeople", "maxAdults");
          }
          if (minGuests !== undefined) {
            roomData.minGuests = minGuests;
            pmsSyncedFields.push("minGuests");
          }

          const allowChildren = rt.allow_children ?? rt.allowChildren;
          const childMinAge = rt.child_min_age ?? rt.childMinAge;
          const childMaxAge = rt.child_max_age ?? rt.childMaxAge;

          if (allowChildren !== undefined) {
            roomData.allowChildren = allowChildren;
            pmsSyncedFields.push("allowChildren");
            if (allowChildren && childMaxAge) {
              roomData.maxChildren = Math.min(maxGuests || 2, 4);
              pmsSyncedFields.push("maxChildren");
            }
            if (childMinAge !== undefined) { roomData.childMinAge = childMinAge; pmsSyncedFields.push("childMinAge"); }
            if (childMaxAge !== undefined) { roomData.childMaxAge = childMaxAge; pmsSyncedFields.push("childMaxAge"); }
          }

          const allowTeens = rt.allow_teens ?? rt.allowTeens;
          const teenMinAge = rt.teen_min_age ?? rt.teenMinAge;
          const teenMaxAge = rt.teen_max_age ?? rt.teenMaxAge;

          if (allowTeens !== undefined) {
            roomData.allowTeens = allowTeens;
            pmsSyncedFields.push("allowTeens");
            if (teenMinAge !== undefined) { roomData.teenMinAge = teenMinAge; pmsSyncedFields.push("teenMinAge"); }
            if (teenMaxAge !== undefined) { roomData.teenMaxAge = teenMaxAge; pmsSyncedFields.push("teenMaxAge"); }
          }

          const allowInfants = rt.allow_infants ?? rt.allowInfants;
          const infantMinAge = rt.infant_min_age ?? rt.infantMinAge;
          const infantMaxAge = rt.infant_max_age ?? rt.infantMaxAge;

          if (allowInfants !== undefined) {
            roomData.allowInfants = allowInfants;
            pmsSyncedFields.push("allowInfants");
            if (infantMinAge !== undefined) { roomData.infantMinAge = infantMinAge; pmsSyncedFields.push("infantMinAge"); }
            if (infantMaxAge !== undefined) { roomData.infantMaxAge = infantMaxAge; pmsSyncedFields.push("infantMaxAge"); }
          }

          const minAgeCategory = rt.min_age_category ?? rt.minAgeCategory;
          const minAdultsToOfferNonAdultRates = rt.min_adults_to_offer_non_adult_rates ?? rt.minAdultsToOfferNonAdultRates;

          if (minAgeCategory) { roomData.minAgeCategory = minAgeCategory; pmsSyncedFields.push("minAgeCategory"); }
          if (minAdultsToOfferNonAdultRates !== undefined) {
            roomData.minAdultsToOfferNonAdultRates = minAdultsToOfferNonAdultRates;
            pmsSyncedFields.push("minAdultsToOfferNonAdultRates");
          }

          const roomsAvailablePerNight = rt.rooms_available_per_night ?? rt.roomsAvailablePerNight;
          const rateTypes = rt.rate_types ?? rt.rateTypes;

          if (roomsAvailablePerNight && Array.isArray(roomsAvailablePerNight)) {
            roomData.roomsAvailablePerNight = roomsAvailablePerNight;
            pmsSyncedFields.push("roomsAvailablePerNight");
          }
          if (rateTypes && Array.isArray(rateTypes)) {
            roomData.rateTypes = rateTypes;
            pmsSyncedFields.push("rateTypes");
          }

          const linkedRateTypeIds = rt.linked_rate_type_ids ?? rt.linkedRateTypeIds;
          if (linkedRateTypeIds && Array.isArray(linkedRateTypeIds)) {
            roomData.linkedRateTypeIds = linkedRateTypeIds;
          } else if (rateTypes && Array.isArray(rateTypes)) {
            roomData.linkedRateTypeIds = rateTypes.map((rate: any) => rate.rate_type_id ?? rate.rateTypeId);
          }

          roomData.pms_synced_fields = pmsSyncedFields;
          return roomData;
        });

        // Merge with existing room types
        const updatedRoomTypes = [...roomTypes];
        let newCount = 0;
        let updatedCount = 0;

        pmsRoomTypesData.forEach((pmsRoom: any) => {
          const existingIndex = updatedRoomTypes.findIndex(
            (r) => r.pms_id === pmsRoom.pms_id || r.name.toLowerCase() === pmsRoom.name.toLowerCase(),
          );

          if (existingIndex >= 0) {
            const existing = updatedRoomTypes[existingIndex];
            const existingLinked = existing.linkedRateTypes;
            const pmsLinkedIds = pmsRoom.linkedRateTypeIds || [];
            const shouldPreserveExisting = Array.isArray(existingLinked) && existingLinked.length > 0;

            updatedRoomTypes[existingIndex] = {
              ...existing,
              ...pmsRoom,
              id: existing.id,
              url: existing.url || pmsRoom.url,
              images: existing.images || [],
              facilities: existing.facilities || [],
              amenities: existing.amenities || [],
              rate_info: existing.rate_info || [],
              availableRateTypes: pmsLinkedIds,
              linkedRateTypes: shouldPreserveExisting ? existingLinked : pmsLinkedIds,
            };
            updatedCount++;
          } else {
            updatedRoomTypes.push({
              ...pmsRoom,
              url: "",
              numRooms: 1,
              bedConfiguration: "",
              roomSize: 0,
              bathrooms: 1,
              minStay: 1,
              maxStay: 0,
              rateType: "per-unit",
              splitPercent: 0,
              images: [],
              facilities: [],
              amenities: [],
              rate_info: [],
              availableRateTypes: pmsRoom.linkedRateTypeIds || [],
              linkedRateTypes: pmsRoom.linkedRateTypeIds || [],
            });
            newCount++;
          }
        });

        if (newCount > 0 || updatedCount > 0) {
          setRoomTypes(updatedRoomTypes);
          hasChanges = true;
        }

        toast({
          title: "Room Types Synced",
          description: `Found ${roomTypesArray.length} room types. ${newCount} new, ${updatedCount} updated.`,
        });
      }

      // Store rate types
      const rateTypesArray = responseData?.rate_types || responseData?.rateTypes || [];
      if (Array.isArray(rateTypesArray) && rateTypesArray.length > 0) {
        console.log("Rate types from PMS:", rateTypesArray);

        const importedRateTypes = rateTypesArray.map((rt: any) => ({
          id: rt.rate_type_id ?? rt.id,
          name: rt.name || `Rate Type ${rt.rate_type_id ?? rt.id}`,
          description: rt.description || null,
          priceType: rt.price_type ?? rt.priceType ?? null,
          minAdvanceDays: rt.min_advance_days ?? rt.minAdvanceDays ?? null,
          maxAdvanceDays: rt.max_advance_days ?? rt.maxAdvanceDays ?? null,
          minStayDays: rt.min_stay_days ?? rt.minStayDays ?? null,
          maxStayDays: rt.max_stay_days ?? rt.maxStayDays ?? null,
          stayPayStayNights: rt.stay_pay_stay_nights ?? rt.stayPayStayNights ?? null,
          stayPayDiscountNights: rt.stay_pay_discount_nights ?? rt.stayPayDiscountNights ?? null,
          stayPayDiscountPercentage: rt.stay_pay_discount_percentage ?? rt.stayPayDiscountPercentage ?? null,
          pms_synced: true,
        }));

        const updatedRateTypes = [...pmsRateTypes];
        let newRateTypeCount = 0;
        let updatedRateTypeCount = 0;

        importedRateTypes.forEach((imported: any) => {
          const existingIndex = updatedRateTypes.findIndex(
            (rt) => rt.id === imported.id || rt.name.toLowerCase() === imported.name.toLowerCase(),
          );

          if (existingIndex >= 0) {
            updatedRateTypes[existingIndex] = { ...updatedRateTypes[existingIndex], ...imported };
            updatedRateTypeCount++;
          } else {
            updatedRateTypes.push(imported);
            newRateTypeCount++;
          }
        });

        setPmsRateTypes(updatedRateTypes);
        hasChanges = true;
        toast({
          title: "Rate Types Synced",
          description: `Found ${rateTypesArray.length} rate types. ${newRateTypeCount} new, ${updatedRateTypeCount} updated.`,
        });
      }

      // Store rates per room type
      const availabilityData = responseData?.availability || [];
      if (Array.isArray(availabilityData) && availabilityData.length > 0) {
        console.log("Availability data from PMS:", availabilityData.length, "room type entries");

        const allRates: any[] = [];
        availabilityData.forEach((roomType: any) => {
          const roomTypeId = roomType.roomTypeId;
          const rateTypes = roomType.rateTypes || [];
          rateTypes.forEach((rateType: any) => {
            const rates = rateType.rates || [];
            rates.forEach((rate: any) => {
              allRates.push({
                roomTypeId,
                rateTypeId: rateType.rateTypeId,
                rateTypeName: rateType.name,
                date: rate.date,
                roomAmount: rate.roomAmount,
                adultAmount1: rate.adultAmount1,
                adultAmount2: rate.adultAmount2,
                teenAmount: rate.teenAmount,
                childAmount: rate.childAmount,
                infantAmount: rate.infantAmount,
              });
            });
          });
        });

        if (allRates.length > 0) {
          const ratesByRoomType: Record<number, any[]> = {};
          allRates.forEach((rate: any) => {
            if (!ratesByRoomType[rate.roomTypeId]) {
              ratesByRoomType[rate.roomTypeId] = [];
            }
            ratesByRoomType[rate.roomTypeId].push(rate);
          });

          setRoomTypes((prev) =>
            prev.map((room) => {
              const pmsId = room.pms_id;
              if (pmsId && ratesByRoomType[pmsId]) {
                return {
                  ...room,
                  pms_rates: ratesByRoomType[pmsId],
                  pms_rates_synced_at: new Date().toISOString(),
                };
              }
              return room;
            }),
          );

          hasChanges = true;
          toast({
            title: "Rates Synced",
            description: `Stored ${allRates.length} rate entries across ${Object.keys(ratesByRoomType).length} room types.`,
          });
        }
      }

      if (hasChanges) {
        setIsDirty(true);
        toast({
          title: "Changes Detected",
          description: canonicalRecordsRebuilt
            ? "PMS data updated and live room/rate records rebuilt. Save to persist editor changes."
            : "PMS data has been updated. Save to persist changes.",
          variant: "default",
        });
      } else if (canonicalRecordsRebuilt) {
        toast({
          title: "Benson Sync Complete",
          description: "Live room and rate records were rebuilt from Benson.",
        });
      }

      setLastPmsSync(new Date());
    } catch (err: any) {
      console.error("Error syncing from Benson:", err);
      toast({
        title: "Sync Failed",
        description: err.message || "Failed to sync from Benson. Check API credentials.",
        variant: "destructive",
      });
    } finally {
      setIsSyncingPms(false);
    }
  };

  // Load available PMS systems
  useEffect(() => {
    const fetchActivePMSSystems = async () => {
      const { data: activeCredentials } = await supabase
        .from("pms_credentials")
        .select("system_type")
        .eq("is_active", true);

      const activeSystemTypes = new Set(activeCredentials?.map((c) => c.system_type) || []);

      if (roomsonlineActive) {
        activeSystemTypes.add("roomsonline");
      }

      if (selectedPMS) {
        activeSystemTypes.add(selectedPMS);
      }

      const { getPropertyFormPMSSystems } = await import("@/lib/pmsSystemsConfig");
      const allSystems = getPropertyFormPMSSystems();
      const filteredSystems = allSystems.filter((s) => activeSystemTypes.has(s.system_type));

      setAvailablePMSSystems(filteredSystems);
    };

    fetchActivePMSSystems();
  }, [roomsonlineActive, selectedPMS]);

  return {
    // PMS selection
    selectedPMS,
    setSelectedPMS,
    availablePMSSystems,

    // PMS-specific property codes
    bensonPropertyCode,
    setBensonPropertyCode,
    bensonEnvironment,
    setBensonEnvironment,
    cloudbedsPropertyId,
    setCloudbedsPropertyId,
    littlehotelierChannelCode,
    setLittlehotelierChannelCode,
    littlehotelierRegion,
    setLittlehotelierRegion,
    hotelbedsHotelCode,
    setHotelbedsHotelCode,
    hostfullyPropertyUid,
    setHostfullyPropertyUid,

    // Sync state
    isSyncingPms,
    lastPmsSync,
    isSyncEditorialDialogOpen,
    setIsSyncEditorialDialogOpen,

    // External IDs
    existingExternalIds,
    setExistingExternalIds,
    tripadvisorId,
    setTripadvisorId,
    googlePlaceId,
    setGooglePlaceId,
    existingBensonPropertyCode,
    setExistingBensonPropertyCode,
    existingCloudbedsPropertyId,
    setExistingCloudbedsPropertyId,
    existingLittlehotelierChannelCode,
    setExistingLittlehotelierChannelCode,
    existingLittlehotelierRegion,
    setExistingLittlehotelierRegion,
    existingHotelbedsHotelCode,
    setExistingHotelbedsHotelCode,
    existingHostfullyPropertyUid,
    setExistingHostfullyPropertyUid,

    // Hostfully states
    ownerPmsCredentialId,
    setOwnerPmsCredentialId,
    hostfullyRoomCount,
    setHostfullyRoomCount,
    importingHostfullyRooms,
    showHostfullyWarning,
    setShowHostfullyWarning,
    previousPMS,
    setPreviousPMS,
    syncingRoomId,
    fullSyncingHostfully,
    syncProgress,

    // Sync functions
    handleImportHostfullyRooms,
    syncRoomFromHostfully,
    handleFullHostfullySync,
    syncFromBenson,

    // Helper functions (exported for JSX use)
    isPMSFullyIntegrated,
    getPMSIntegrationLevel,
    getPMSIcon,
  };
}
