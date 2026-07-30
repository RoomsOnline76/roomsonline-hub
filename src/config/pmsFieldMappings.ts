// Centralized field mapping definitions for all PMS systems

export interface PMSFieldDefinition {
  externalField: string;
  externalLabel: string;
  description: string;
  internalField: string;
  internalLabel: string;
}

export interface PMSDataCategory {
  id: string;
  label: string;
  description: string;
  fields: PMSFieldDefinition[];
}

export interface PMSFieldConfig {
  displayName: string;
  edgeFunctionName: string;
  propertyCodeField: string; // Which field in properties table holds the PMS code
  categories: PMSDataCategory[];
}

// All available internal fields for custom mapping
export const availableInternalFields = [
  { path: "amenities.room_types[].pmsRoomId", label: "PMS Room ID" },
  { path: "amenities.room_types[].pmsRoomType", label: "PMS Room Type" },
  { path: "amenities.room_types[].name", label: "Room Name" },
  { path: "amenities.room_types[].description", label: "Room Description" },
  { path: "amenities.room_types[].maxPeople", label: "Max People" },
  { path: "amenities.room_types[].maxAdults", label: "Max Adults" },
  { path: "amenities.room_types[].maxChildren", label: "Max Children" },
  { path: "amenities.room_types[].minGuests", label: "Min Guests" },
  { path: "amenities.room_types[].numRooms", label: "Number of Rooms" },
  { path: "amenities.room_types[].roomSize", label: "Room Size" },
  { path: "amenities.room_types[].floor", label: "Floor" },
  { path: "amenities.room_types[].bathrooms", label: "Bathrooms" },
  { path: "amenities.room_types[].bedConfiguration", label: "Bed Configuration" },
  { path: "amenities.room_types[].minStay", label: "Minimum Stay" },
  { path: "amenities.room_types[].maxStay", label: "Maximum Stay" },
  { path: "amenities.room_types[].allowTeens", label: "Allow Teens" },
  { path: "amenities.room_types[].teenMinAge", label: "Teen Min Age" },
  { path: "amenities.room_types[].teenMaxAge", label: "Teen Max Age" },
  { path: "amenities.room_types[].allowChildren", label: "Allow Children" },
  { path: "amenities.room_types[].childMinAge", label: "Child Min Age" },
  { path: "amenities.room_types[].childMaxAge", label: "Child Max Age" },
  { path: "amenities.room_types[].allowInfants", label: "Allow Infants" },
  { path: "amenities.room_types[].infantMinAge", label: "Infant Min Age" },
  { path: "amenities.room_types[].infantMaxAge", label: "Infant Max Age" },
  { path: "amenities.room_types[].rate_info[].pmsRateId", label: "PMS Rate ID" },
  { path: "amenities.room_types[].rate_info[].name", label: "Rate Name" },
  { path: "amenities.room_types[].rate_info[].description", label: "Rate Description" },
  { path: "amenities.room_types[].rate_info[].mealTypes", label: "Meal Types" },
  { path: "amenities.room_types[].rate_info[].amount", label: "Rate Amount" },
];

// Field mapping definitions for each PMS system
export const pmsFieldDefinitions: Record<string, PMSFieldConfig> = {
  hostfully: {
    displayName: "Hostfully",
    edgeFunctionName: "hostfully-api",
    propertyCodeField: "hostfully_property_code",
    categories: [
      {
        id: "properties",
        label: "Properties",
        description: "Property definitions from Hostfully",
        fields: [
          { externalField: "uid", externalLabel: "Property UID", description: "Unique property identifier", internalField: "external_id", internalLabel: "External ID" },
          { externalField: "name", externalLabel: "Property Name", description: "Display name of the property", internalField: "name", internalLabel: "Property Name" },
          { externalField: "bedrooms", externalLabel: "Bedrooms", description: "Number of bedrooms", internalField: "bedrooms", internalLabel: "Bedrooms" },
          { externalField: "bathrooms", externalLabel: "Bathrooms", description: "Number of bathrooms", internalField: "bathrooms", internalLabel: "Bathrooms" },
          { externalField: "maxGuests", externalLabel: "Max Guests", description: "Maximum guest capacity", internalField: "max_guests", internalLabel: "Max Guests" },
        ],
      },
      {
        id: "reservations",
        label: "Reservations",
        description: "Booking data mappings",
        fields: [
          { externalField: "checkInDate", externalLabel: "Check-In Date", description: "Arrival date", internalField: "check_in_date", internalLabel: "Check In" },
          { externalField: "checkOutDate", externalLabel: "Check-Out Date", description: "Departure date", internalField: "check_out_date", internalLabel: "Check Out" },
          { externalField: "guestName", externalLabel: "Guest Name", description: "Primary guest name", internalField: "guest_name", internalLabel: "Guest Name" },
          { externalField: "totalPrice", externalLabel: "Total Price", description: "Total booking amount", internalField: "total_price", internalLabel: "Total Price" },
        ],
      },
    ],
  },
  nightsbridge: {
    displayName: "NightsBridge",
    edgeFunctionName: "nightsbridge-api",
    propertyCodeField: "external_id",
    categories: [
      {
        id: "room_types",
        label: "Room Types",
        description: "Room type definitions from NightsBridge",
        fields: [
          { externalField: "roomTypeId", externalLabel: "Room Type ID", description: "Unique room type identifier", internalField: "amenities.room_types[].pmsRoomId", internalLabel: "PMS Room ID" },
          { externalField: "name", externalLabel: "Room Name", description: "Display name of the room", internalField: "amenities.room_types[].name", internalLabel: "Room Name" },
          { externalField: "maxOccupancy", externalLabel: "Max Occupancy", description: "Maximum guest capacity", internalField: "amenities.room_types[].maxPeople", internalLabel: "Max People" },
        ],
      },
      {
        id: "rate_types",
        label: "Rate Types",
        description: "Rate definitions from NightsBridge",
        fields: [
          { externalField: "rateId", externalLabel: "Rate ID", description: "Unique rate identifier", internalField: "amenities.room_types[].rate_info[].pmsRateId", internalLabel: "PMS Rate ID" },
          { externalField: "rateName", externalLabel: "Rate Name", description: "Display name of the rate", internalField: "amenities.room_types[].rate_info[].name", internalLabel: "Rate Name" },
        ],
      },
    ],
  },
  checkfront: {
    displayName: "Checkfront",
    edgeFunctionName: "checkfront-api",
    propertyCodeField: "checkfront_property_code",
    categories: [
      {
        id: "items",
        label: "Items",
        description: "Bookable items from Checkfront",
        fields: [
          { externalField: "item_id", externalLabel: "Item ID", description: "Unique item identifier", internalField: "amenities.room_types[].pmsRoomId", internalLabel: "PMS Room ID" },
          { externalField: "name", externalLabel: "Item Name", description: "Display name of the item", internalField: "amenities.room_types[].name", internalLabel: "Room Name" },
          { externalField: "sku", externalLabel: "SKU", description: "Stock keeping unit", internalField: "amenities.room_types[].pmsRoomType", internalLabel: "PMS Room Type" },
        ],
      },
      {
        id: "rates",
        label: "Rates",
        description: "Rate definitions from Checkfront",
        fields: [
          { externalField: "rate_id", externalLabel: "Rate ID", description: "Unique rate identifier", internalField: "amenities.room_types[].rate_info[].pmsRateId", internalLabel: "PMS Rate ID" },
          { externalField: "rate_name", externalLabel: "Rate Name", description: "Display name of the rate", internalField: "amenities.room_types[].rate_info[].name", internalLabel: "Rate Name" },
        ],
      },
    ],
  },
  cloudbeds: {
    displayName: "Cloudbeds",
    edgeFunctionName: "cloudbeds-api",
    propertyCodeField: "cloudbeds_property_id",
    categories: [
      {
        id: "room_types",
        label: "Room Types",
        description: "Room type definitions from Cloudbeds",
        fields: [
          { externalField: "roomTypeID", externalLabel: "Room Type ID", description: "Unique room type identifier", internalField: "amenities.room_types[].pmsRoomId", internalLabel: "PMS Room ID" },
          { externalField: "roomTypeName", externalLabel: "Room Type Name", description: "Display name of the room", internalField: "amenities.room_types[].name", internalLabel: "Room Name" },
          { externalField: "maxGuests", externalLabel: "Max Guests", description: "Maximum guest capacity", internalField: "amenities.room_types[].maxPeople", internalLabel: "Max People" },
          { externalField: "roomTypeDescription", externalLabel: "Description", description: "Room description", internalField: "amenities.room_types[].description", internalLabel: "Room Description" },
        ],
      },
      {
        id: "rate_plans",
        label: "Rate Plans",
        description: "Rate plan definitions from Cloudbeds",
        fields: [
          { externalField: "ratePlanID", externalLabel: "Rate Plan ID", description: "Unique rate plan identifier", internalField: "amenities.room_types[].rate_info[].pmsRateId", internalLabel: "PMS Rate ID" },
          { externalField: "ratePlanName", externalLabel: "Rate Plan Name", description: "Display name of the rate plan", internalField: "amenities.room_types[].rate_info[].name", internalLabel: "Rate Name" },
        ],
      },
    ],
  },
  littlehotelier: {
    displayName: "Little Hotelier",
    edgeFunctionName: "little-hotelier-api",
    propertyCodeField: "littlehotelier_channel_code",
    categories: [
      {
        id: "room_types",
        label: "Room Types",
        description: "Room type definitions from Little Hotelier",
        fields: [
          { externalField: "room_type_id", externalLabel: "Room Type ID", description: "Unique room type identifier", internalField: "amenities.room_types[].pmsRoomId", internalLabel: "PMS Room ID" },
          { externalField: "room_type_name", externalLabel: "Room Type Name", description: "Display name of the room", internalField: "amenities.room_types[].name", internalLabel: "Room Name" },
          { externalField: "max_occupancy", externalLabel: "Max Occupancy", description: "Maximum guest capacity", internalField: "amenities.room_types[].maxPeople", internalLabel: "Max People" },
        ],
      },
      {
        id: "rate_plans",
        label: "Rate Plans",
        description: "Rate plan definitions from Little Hotelier",
        fields: [
          { externalField: "rate_plan_id", externalLabel: "Rate Plan ID", description: "Unique rate plan identifier", internalField: "amenities.room_types[].rate_info[].pmsRateId", internalLabel: "PMS Rate ID" },
          { externalField: "rate_plan_name", externalLabel: "Rate Plan Name", description: "Display name of the rate plan", internalField: "amenities.room_types[].rate_info[].name", internalLabel: "Rate Name" },
        ],
      },
    ],
  },
  hotelbeds: {
    displayName: "HotelBeds",
    edgeFunctionName: "hotelbeds-api",
    propertyCodeField: "hotelbeds_hotel_code",
    categories: [
      {
        id: "rooms",
        label: "Rooms",
        description: "Room definitions from HotelBeds",
        fields: [
          { externalField: "roomCode", externalLabel: "Room Code", description: "Unique room code", internalField: "amenities.room_types[].pmsRoomId", internalLabel: "PMS Room ID" },
          { externalField: "roomName", externalLabel: "Room Name", description: "Display name of the room", internalField: "amenities.room_types[].name", internalLabel: "Room Name" },
          { externalField: "maxPax", externalLabel: "Max Pax", description: "Maximum guest capacity", internalField: "amenities.room_types[].maxPeople", internalLabel: "Max People" },
        ],
      },
      {
        id: "boards",
        label: "Board Types",
        description: "Meal plan definitions from HotelBeds",
        fields: [
          { externalField: "boardCode", externalLabel: "Board Code", description: "Unique board/meal code", internalField: "amenities.room_types[].rate_info[].pmsRateId", internalLabel: "PMS Rate ID" },
          { externalField: "boardName", externalLabel: "Board Name", description: "Display name of the board type", internalField: "amenities.room_types[].rate_info[].mealTypes", internalLabel: "Meal Types" },
        ],
      },
    ],
  },
};

// Get PMS configuration by system type
export const getPMSFieldConfig = (systemType: string): PMSFieldConfig | undefined => {
  return pmsFieldDefinitions[systemType.toLowerCase()];
};

// Get all supported PMS systems with field mappings
export const getSupportedPMSSystems = (): string[] => {
  return Object.keys(pmsFieldDefinitions);
};
