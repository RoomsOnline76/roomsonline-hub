// Centralized configuration for all PMS and API systems
// This ensures consistency between API Keys page and Property Form dropdown

export interface PMSSystemConfig {
  key: string;
  name: string;
  description: string;
  isInternal?: boolean; // RoomsOnline API is internal
  hasCustomCard?: boolean; // Systems with custom UI cards in AdminKeys
}

// All available PMS and API systems - 9 PMS + 1 API = 10 total
export const ALL_PMS_SYSTEMS: PMSSystemConfig[] = [
  // Internal API
  {
    key: 'roomsonline',
    name: 'RoomsOnline',
    description: "RoomsOnline's proprietary API for direct property management",
    isInternal: true,
    hasCustomCard: true,
  },
  // PMS Systems with custom cards
  {
    key: 'benson',
    name: 'Benson',
    description: 'Property management system with HTTP Basic Auth',
    hasCustomCard: true,
  },
  {
    key: 'nightsbridge',
    name: 'NightsBridge',
    description: 'South African booking and channel management platform',
    hasCustomCard: true,
  },
  {
    key: 'checkfront',
    name: 'Checkfront',
    description: 'Online booking and reservation management system',
    hasCustomCard: true,
  },
  // PMS Systems - placeholders/future
  {
    key: 'littlehotelier',
    name: 'Little Hotelier',
    description: 'Cloud-based property management system designed for small hotels, B&Bs, and guest houses',
    hasCustomCard: true,
  },
  {
    key: 'cloudbeds',
    name: 'Cloudbeds',
    description: 'All-in-one hospitality management platform for hotels and accommodation providers',
    hasCustomCard: true,
  },
  {
    key: 'smoobu',
    name: 'Smoobu',
    description: 'Channel manager and vacation rental software for property managers',
  },
  {
    key: 'hostfully',
    name: 'Hostfully',
    description: 'Property management platform for vacation rental managers',
    hasCustomCard: true,
  },
  {
    key: 'siteminder',
    name: 'SiteMinder',
    description: 'Hotel commerce platform with channel management and booking engine',
  },
  {
    key: 'mews',
    name: 'Mews',
    description: 'Cloud-based property management system for hotels',
  },
  // Future PMS systems
  {
    key: 'guestly',
    name: 'Guestly',
    description: 'Property management and guest experience platform for vacation rentals',
  },
  {
    key: 'hotelbeds',
    name: 'HotelBeds',
    description: 'Global bedbank and travel distribution platform for hotels',
  },
  {
    key: 'roomkey',
    name: 'RoomKey',
    description: 'Hotel booking platform with direct connections to major hotel chains',
  },
  {
    key: 'roomracoon',
    name: 'RoomRaccoon',
    description: 'All-in-one hotel management system with channel manager and booking engine',
  },
];

// Get total count of all systems
export const TOTAL_PMS_SYSTEMS_COUNT = ALL_PMS_SYSTEMS.length;

// Get only PMS systems (excluding internal RoomsOnline API)
export const PMS_ONLY_SYSTEMS = ALL_PMS_SYSTEMS.filter(s => !s.isInternal);

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
