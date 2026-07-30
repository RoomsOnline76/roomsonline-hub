// Centralized configuration for all PMS and API systems
// This ensures consistency between API Keys page and Property Form dropdown

export type DeploymentStatus = 'deployed' | 'in_testing' | 'ready' | 'in_development' | 'planned';

// Maps pms_tracker_status.integration_status to display status
export type IntegrationStatus = 'deployed' | 'in_testing' | 'in_development' | 'coming_soon' | 'parked';

export type PMSCategory = 'pms' | 'channel_manager' | 'financial';

export interface PMSSystemConfig {
  key: string;
  name: string;
  description: string;
  category?: PMSCategory; // Defaults to 'pms' if not set
  isInternal?: boolean; // RoomsOnline API is internal
  hasCustomCard?: boolean; // Systems with custom UI cards in AdminKeys
  deploymentStatus: DeploymentStatus;
  isWidgetOnly?: boolean; // NightsBridge uses widget, no API
  hidden?: boolean; // Hide from UI without removing config
}

// Get integration status badge info (from pms_tracker_status)
export const getIntegrationStatusInfo = (status: IntegrationStatus | string | null) => {
  switch (status) {
    case 'deployed':
      return { label: 'Deployed', variant: 'default' as const, className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
    case 'in_testing':
      return { label: 'In Testing', variant: 'secondary' as const, className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
    case 'in_development':
      return { label: 'In Development', variant: 'outline' as const, className: 'text-amber-600 border-amber-500/30' };
    case 'coming_soon':
      return { label: 'Coming Soon', variant: 'outline' as const, className: 'text-muted-foreground' };
    case 'parked':
      return { label: 'Parked', variant: 'outline' as const, className: 'text-muted-foreground' };
    default:
      return { label: 'Unknown', variant: 'outline' as const, className: 'text-muted-foreground' };
  }
};

// All available PMS and API systems - sorted alphabetically by name
export const ALL_PMS_SYSTEMS: PMSSystemConfig[] = [
  // A
  {
    key: 'agoda',
    name: 'Agoda',
    description: 'Agoda OTA — rates, availability, and reservation distribution',
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  {
    key: 'airbnb',
    name: 'Airbnb',
    description: 'Airbnb listing data via SearchAPI.io — availability, pricing, reviews (read-only)',
    category: 'channel_manager',
    deploymentStatus: 'in_development',
  },
  {
    key: 'beds24',
    name: 'Beds24',
    description: 'Cloud-based PMS and channel manager — REST API v2 (api.beds24.com/v2)',
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  {
    key: 'ebeds',
    name: 'eBeds',
    description: 'Channel manager and distribution platform — API credentials pending',
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  {
    key: 'easyota',
    name: 'EasyOTA',
    description: 'Channel manager connecting properties to multiple OTAs — API credentials pending',
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  // B
  {
    key: 'booking_com',
    name: 'Booking.com',
    description: 'Global OTA — rates, availability, and reservation sync',
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  {
    key: 'benson',
    name: 'Benson',
    description: 'Property management system with HTTP Basic Auth',
    hasCustomCard: true,
    deploymentStatus: 'deployed',
  },
  // C
  {
    key: 'checkfront',
    name: 'Checkfront',
    description: 'Online booking and reservation management system',
    hasCustomCard: true,
    deploymentStatus: 'ready',
  },
  {
    key: 'channex',
    name: 'Channex.io',
    description: 'Channel manager and PMS connectivity platform with open API for property distribution',
    category: 'channel_manager',
    deploymentStatus: 'in_development',
  },
  {
    key: 'cloudbeds',
    name: 'Cloudbeds',
    description: 'All-in-one hospitality management platform for hotels and accommodation providers',
    hasCustomCard: true,
    deploymentStatus: 'in_development',
  },
  // G
  {
    key: 'guesty',
    name: 'Guesty',
    description: 'Property management and guest experience platform for vacation rentals',
    deploymentStatus: 'in_development',
  },
  // H
  {
    key: 'hostfully',
    name: 'Hostfully',
    description: 'Property management platform for vacation rental managers',
    hasCustomCard: true,
    deploymentStatus: 'deployed',
  },
  {
    key: 'hyperguest',
    name: 'HyperGuest',
    description: 'Distribution channel connectivity — enables ROLOS → HG → Booking.com and other OTAs',
    category: 'channel_manager',
    hasCustomCard: true,
    deploymentStatus: 'in_development',
  },
  {
    key: 'hotelbeds',
    name: 'HotelBeds',
    description: 'Global bedbank and travel distribution platform for hotels',
    category: 'channel_manager',
    hasCustomCard: true,
    deploymentStatus: 'ready',
  },
  // L
  {
    key: 'littlehotelier',
    name: 'Little Hotelier',
    description: 'Cloud-based property management system designed for small hotels, B&Bs, and guest houses',
    hasCustomCard: true,
    deploymentStatus: 'in_development',
    hidden: true, // No longer required
  },
  // M
  {
    key: 'mews',
    name: 'Mews',
    description: 'Cloud-based property management system for hotels',
    deploymentStatus: 'planned',
  },
  // E
  {
    key: 'expedia',
    name: 'Expedia',
    description: 'Expedia Group Rapid API — lodging availability, rates, and booking management',
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  // G
  {
    key: 'google_hotels',
    name: 'Google Hotels',
    description: 'Google Hotel Ads — surface rates on Google Search & Maps',
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  // L
  {
    key: 'lekkeslaap',
    name: 'Lekkeslaap',
    description: "South Africa's leading accommodation platform",
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  // N
  {
    key: 'nightsbridge',
    name: 'NightsBridge',
    description: 'Deployed via widget integration (no API access)',
    category: 'channel_manager',
    hasCustomCard: true,
    deploymentStatus: 'deployed',
    isWidgetOnly: true,
  },
  // P
  {
    key: 'pricelabs',
    name: 'PriceLabs',
    description: 'Dynamic pricing and revenue management — REST API (https://api.pricelabs.co)',
    category: 'financial',
    deploymentStatus: 'planned',
  },
  {
    key: 'profitroom',
    name: 'ProfitRoom',
    description: 'Hotel management platform with booking engine, channel manager, and CRS',
    category: 'channel_manager',
    hasCustomCard: true,
    deploymentStatus: 'in_development',
  },

  // R
  {
    key: 'rentalsunited',
    name: 'Rentals United',
    description: 'Channel manager and distribution platform — XML API + GC API (live credentials, certification in progress)',
    category: 'channel_manager',
    hasCustomCard: true,
    deploymentStatus: 'in_testing',
  },
  {
    key: 'roomkey',
    name: 'RoomKey',
    description: 'Hotel booking platform with direct connections to major hotel chains',
    deploymentStatus: 'planned',
  },
  {
    key: 'roomracoon',
    name: 'RoomRaccoon',
    description: 'All-in-one hotel management system with channel manager',
    deploymentStatus: 'planned',
  },
  {
    key: 'roomsonline',
    name: "ROL'OS",
    description: "RoomsOnline's proprietary operating system API",
    isInternal: true,
    hasCustomCard: true,
    deploymentStatus: 'in_development',
  },
  // T
  {
    key: 'tourplan',
    name: 'TourPlan',
    description: 'Tour operator and travel reservation platform — inventory, rates, and booking distribution (API integration planned)',
    category: 'channel_manager',
    deploymentStatus: 'planned',
  },
  // S
  // W
  {
    key: 'wetu',
    name: 'WETU',
    description: 'Travel content portal — property descriptions, images, rooms, and features (read-only content API)',
    deploymentStatus: 'in_development',
  },
  // S
  {
    key: 'semper',
    name: 'Semper',
    description: 'Property management and channel management system',
    deploymentStatus: 'planned',
  },
  {
    key: 'siteminder',
    name: 'SiteMinder',
    description: 'Hotel commerce platform with channel management',
    deploymentStatus: 'planned',
  },
];

// Get only visible systems (excludes hidden)
export const VISIBLE_PMS_SYSTEMS = ALL_PMS_SYSTEMS.filter(s => !s.hidden);

// Get channel manager systems (visible only)
export const CHANNEL_MANAGER_SYSTEMS = VISIBLE_PMS_SYSTEMS.filter(s => s.category === 'channel_manager');

// Get financial / revenue-management systems (visible only)
export const FINANCIAL_SYSTEMS = VISIBLE_PMS_SYSTEMS.filter(s => s.category === 'financial');

// Get PMS-only systems (visible, non-channel-manager, non-financial)
export const PMS_CATEGORY_SYSTEMS = VISIBLE_PMS_SYSTEMS.filter(
  s => s.category !== 'channel_manager' && s.category !== 'financial'
);

// Get total count of visible systems (used for milestones)
export const TOTAL_PMS_SYSTEMS_COUNT = VISIBLE_PMS_SYSTEMS.length;

// Get only PMS systems (excluding internal RoomsOnline API)
export const PMS_ONLY_SYSTEMS = ALL_PMS_SYSTEMS.filter(s => !s.isInternal);

// Get only active/implemented PMS systems (those with custom cards)
export const ACTIVE_PMS_SYSTEMS = ALL_PMS_SYSTEMS.filter(
  s => !s.isInternal && s.hasCustomCard
);

// Get deployed systems
export const DEPLOYED_PMS_SYSTEMS = ALL_PMS_SYSTEMS.filter(
  s => s.deploymentStatus === 'deployed'
);

// Get systems for property form dropdown (all systems)
export const getPropertyFormPMSSystems = () => 
  ALL_PMS_SYSTEMS.map(s => ({
    key_name: s.key,
    name: s.name,
    system_type: s.key,
  }));

// Get system by key
export const getPMSSystemByKey = (key: string): PMSSystemConfig | undefined =>
  ALL_PMS_SYSTEMS.find(s => s.key === key);

// Check if a system has a custom card in AdminKeys
export const hasCustomCard = (key: string): boolean =>
  ALL_PMS_SYSTEMS.find(s => s.key === key)?.hasCustomCard ?? false;

// Get deployment status badge info
export const getDeploymentStatusInfo = (status: DeploymentStatus) => {
  switch (status) {
    case 'deployed':
      return { label: 'Deployed', variant: 'default' as const, className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
    case 'in_testing':
      return { label: 'In Testing', variant: 'outline' as const, className: 'text-sky-600 border-sky-500/30' };
    case 'ready':
      return { label: 'Ready', variant: 'secondary' as const, className: '' };
    case 'in_development':
      return { label: 'In Development', variant: 'outline' as const, className: 'text-amber-600 border-amber-500/30' };
    case 'planned':
      return { label: 'Planned', variant: 'outline' as const, className: 'text-muted-foreground' };
  }
};
