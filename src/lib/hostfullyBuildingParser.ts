/**
 * Hostfully Building Parser
 * 
 * Parses Hostfully property names that follow the pattern:
 * [Building] [Room#] [Type]
 * Example: "EIGHTY2onM 101 Studio" -> Building: "EIGHTY2onM", Room: "101", Type: "Studio"
 */

export interface HostfullyUnit {
  id: string;           // Hostfully property UID
  name: string;         // Full name "EIGHTY2onM 101 Studio"
  room_number: string;  // "101"
  room_type: string;    // "Studio"
}

export interface RoomTypeGroup {
  type_name: string;        // "Compact Studio", "Studio", etc.
  unit_count: number;       // 17
  unit_ids: string[];       // Hostfully UIDs
  unit_numbers: string[];   // "104", "108", etc.
}

export interface ParsedBuilding {
  building_name: string;           // "EIGHTY2onM"
  units: HostfullyUnit[];          // All units in this building
  unit_count: number;
  sample_hostfully_uid: string;    // First unit's UID for reference
}

interface RawHostfullyProperty {
  id: string;
  name: string;
}

/**
 * Sanitizes a property name by removing all types of whitespace anomalies
 */
function sanitizeName(name: string): string {
  return name
    // Replace all unicode whitespace variants with regular space
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\t\r\n]/g, ' ')
    // Collapse multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim();
}

/**
 * Parses a single property name into building, room number, and room type
 * Pattern: [Building Name] [Room Number] [Room Type...]
 * 
 * Examples:
 * - "EIGHTY2onM 101 Studio" -> { building: "EIGHTY2onM", room: "101", type: "Studio" }
 * - "The Parklands 2A Two Bedroom Suite" -> { building: "The Parklands", room: "2A", type: "Two Bedroom Suite" }
 * - "Sandton Views 305 Deluxe Room" -> { building: "Sandton Views", room: "305", type: "Deluxe Room" }
 */
export function parsePropertyName(name: string): { building: string; room: string; type: string } | null {
  if (!name || typeof name !== 'string') {
    return null;
  }

  // Aggressive sanitization to handle messy human input
  const sanitized = sanitizeName(name);
  
  if (!sanitized) {
    return null;
  }

  const parts = sanitized.split(' ');
  
  if (parts.length < 2) {
    // Can't parse, return whole name as building
    return { building: name, room: '', type: '' };
  }

  // Find the room number - it's the first part that starts with a digit
  // or is alphanumeric like "2A", "101", "305"
  let roomIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // Match patterns like: 101, 2A, 305, A101, 1B, etc.
    if (/^\d+[A-Za-z]?$|^[A-Za-z]?\d+$/.test(part)) {
      roomIndex = i;
      break;
    }
  }

  if (roomIndex === -1) {
    // No room number found, treat entire name as building
    return { building: name, room: '', type: '' };
  }

  const building = parts.slice(0, roomIndex).join(' ');
  const room = parts[roomIndex];
  const type = parts.slice(roomIndex + 1).join(' ');

  return {
    building: building || 'Unknown Building',
    room,
    type: type || 'Standard',
  };
}

/**
 * Groups Hostfully properties by building name (case-insensitive)
 * Returns an array of ParsedBuilding objects
 */
export function parseHostfullyProperties(properties: RawHostfullyProperty[]): ParsedBuilding[] {
  if (!properties || !Array.isArray(properties)) {
    return [];
  }

  // Group properties by NORMALIZED (uppercase) building name for case-insensitive matching
  const buildingMap = new Map<string, { displayName: string; units: HostfullyUnit[] }>();

  for (const prop of properties) {
    const parsed = parsePropertyName(prop.name);
    
    if (!parsed || !parsed.building) continue;

    // Normalize to uppercase for grouping key
    const normalizedKey = parsed.building.toUpperCase();
    
    const unit: HostfullyUnit = {
      id: prop.id,
      name: sanitizeName(prop.name),
      room_number: parsed.room,
      room_type: parsed.type,
    };

    if (!buildingMap.has(normalizedKey)) {
      buildingMap.set(normalizedKey, {
        displayName: parsed.building, // Keep first occurrence's casing
        units: []
      });
    }
    buildingMap.get(normalizedKey)!.units.push(unit);
  }

  // Convert map to array of ParsedBuilding objects
  const buildings: ParsedBuilding[] = [];
  
  for (const [, { displayName, units }] of buildingMap) {
    // Sort units by room number
    units.sort((a, b) => {
      // Try numeric comparison first
      const numA = parseInt(a.room_number);
      const numB = parseInt(b.room_number);
      
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      
      // Fall back to string comparison
      return a.room_number.localeCompare(b.room_number);
    });

    buildings.push({
      building_name: displayName,
      units,
      unit_count: units.length,
      sample_hostfully_uid: units[0]?.id || '',
    });
  }

  // Sort buildings by name
  buildings.sort((a, b) => a.building_name.localeCompare(b.building_name));

  return buildings;
}

/**
 * Get unique room types across all buildings
 */
export function getUniqueRoomTypes(buildings: ParsedBuilding[]): string[] {
  const types = new Set<string>();
  
  for (const building of buildings) {
    for (const unit of building.units) {
      if (unit.room_type) {
        types.add(unit.room_type);
      }
    }
  }
  
  return Array.from(types).sort();
}
