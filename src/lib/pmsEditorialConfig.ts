/**
 * PMS Editorial Sync Capability Configuration
 * Defines what editorial data each PMS can sync and how it should be handled.
 */

export type FieldAuthority = 'authoritative' | 'seed_only' | 'partial' | 'not_available';

export interface PMSEditorialFields {
  name?: FieldAuthority;
  description?: FieldAuthority;
  location?: FieldAuthority;
  images?: FieldAuthority;
  amenities?: FieldAuthority;
  rooms?: FieldAuthority;
  rates?: FieldAuthority;
}

export interface PMSEditorialCapability {
  key: string;
  displayName: string;
  supportsEditorialSync: boolean;
  editorialFields: PMSEditorialFields;
  syncButtonLabel: string;
  syncDescription: string;
  notes?: string;
}

export const PMS_EDITORIAL_CAPABILITIES: Record<string, PMSEditorialCapability> = {
  benson: {
    key: 'benson',
    displayName: 'Benson',
    supportsEditorialSync: true,
    editorialFields: {
      name: 'authoritative',
      rooms: 'authoritative',
      rates: 'authoritative',
    },
    syncButtonLabel: 'Sync from Benson',
    syncDescription: 'Syncs room types and rate types. Operational PMS data only.',
    notes: 'Production environment only.',
  },
  hostfully: {
    key: 'hostfully',
    displayName: 'Hostfully',
    supportsEditorialSync: true,
    editorialFields: {
      name: 'authoritative',
      description: 'authoritative',
      location: 'authoritative',
      images: 'authoritative',
      amenities: 'partial',
      rooms: 'authoritative',
    },
    syncButtonLabel: 'Sync from Hostfully',
    syncDescription: 'Full editorial sync: name, description, location, images, and amenities.',
    notes: 'Best hybrid PMS with rich content.',
  },
  cloudbeds: {
    key: 'cloudbeds',
    displayName: 'Cloudbeds',
    supportsEditorialSync: true,
    editorialFields: {
      name: 'authoritative',
      description: 'authoritative',
      location: 'authoritative',
      images: 'authoritative',
      amenities: 'partial',
      rooms: 'authoritative',
      rates: 'authoritative',
    },
    syncButtonLabel: 'Sync from Cloudbeds',
    syncDescription: 'Full editorial sync including GPS coordinates and star rating.',
    notes: 'Gold standard PMS.',
  },
  littlehotelier: {
    key: 'littlehotelier',
    displayName: 'Little Hotelier',
    supportsEditorialSync: true,
    editorialFields: {
      name: 'authoritative',
      description: 'authoritative',
      location: 'authoritative',
      images: 'partial',
      rooms: 'authoritative',
      rates: 'authoritative',
    },
    syncButtonLabel: 'Sync from Little Hotelier',
    syncDescription: 'Syncs name, description, and location. Images merged with existing.',
    notes: 'Room images may be unreliable.',
  },
  checkfront: {
    key: 'checkfront',
    displayName: 'Checkfront',
    supportsEditorialSync: true,
    editorialFields: {
      name: 'authoritative',
      description: 'seed_only',
      rooms: 'authoritative',
    },
    syncButtonLabel: 'Sync from Checkfront',
    syncDescription: 'Syncs room types. Description only seeded if empty.',
    notes: 'Descriptions may be inconsistent.',
  },
  hotelbeds: {
    key: 'hotelbeds',
    displayName: 'HotelBeds',
    supportsEditorialSync: true,
    editorialFields: {
      name: 'authoritative',
      description: 'authoritative',
      location: 'authoritative',
      images: 'authoritative',
      amenities: 'partial',
    },
    syncButtonLabel: 'Sync from HotelBeds',
    syncDescription: 'Syncs name, description, location, and images from Content API.',
    notes: 'B2B supplier with rich content.',
  },
  nightsbridge: {
    key: 'nightsbridge',
    displayName: 'NightsBridge',
    supportsEditorialSync: false, // Explicitly disabled per existing memory
    editorialFields: {
      name: 'authoritative',
    },
    syncButtonLabel: 'Sync from NightsBridge',
    syncDescription: 'Editorial sync disabled for NightsBridge properties.',
    notes: 'Content maintained externally.',
  },
  siteminder: {
    key: 'siteminder',
    displayName: 'SiteMinder',
    supportsEditorialSync: false,
    editorialFields: {},
    syncButtonLabel: 'Sync from SiteMinder',
    syncDescription: 'Editorial sync not available for SiteMinder.',
    notes: 'Channel manager only.',
  },
};

/**
 * Get editorial capability for a PMS by key
 */
export function getPMSEditorialCapability(pmsKey: string | null | undefined): PMSEditorialCapability | null {
  if (!pmsKey) return null;
  const normalized = pmsKey.toLowerCase().replace(/[_\s-]/g, '');
  return PMS_EDITORIAL_CAPABILITIES[normalized] || null;
}

/**
 * Check if a PMS supports editorial sync
 */
export function canSyncEditorial(pmsKey: string | null | undefined): boolean {
  const capability = getPMSEditorialCapability(pmsKey);
  return capability?.supportsEditorialSync ?? false;
}

/**
 * Get human-readable field authority label
 */
export function getAuthorityLabel(authority: FieldAuthority): string {
  switch (authority) {
    case 'authoritative':
      return 'overwrites existing';
    case 'seed_only':
      return 'only if empty';
    case 'partial':
      return 'merged with existing';
    case 'not_available':
      return 'not synced';
    default:
      return '';
  }
}

/**
 * Get syncable fields for display
 */
export function getSyncableFields(capability: PMSEditorialCapability): Array<{ field: string; authority: FieldAuthority }> {
  return Object.entries(capability.editorialFields)
    .filter(([_, authority]) => authority && authority !== 'not_available')
    .map(([field, authority]) => ({
      field: field.charAt(0).toUpperCase() + field.slice(1),
      authority: authority as FieldAuthority,
    }));
}
