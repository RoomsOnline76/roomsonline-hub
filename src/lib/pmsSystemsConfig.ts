// Centralized configuration for all PMS and API systems
// This ensures consistency between API Keys page and Property Form dropdown

export type DeploymentStatus = 'deployed' | 'ready' | 'in_development' | 'planned';

export interface PMSSystemConfig {
  key: string;
  name: string;
  description: string;
  isInternal?: boolean; // RoomsOnline API is internal
  hasCustomCard?: boolean; // Systems with custom UI cards in AdminKeys
  deploymentStatus: DeploymentStatus;
}

// All available PMS and API systems - sorted alphabetically by name
export const ALL_PMS_SYSTEMS: PMSSystemConfig[] = [
  // B
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
    deploymentStatus: 'planned',
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
    key: 'hotelbeds',
    name: 'HotelBeds',
    description: 'Global bedbank and travel distribution platform for hotels',
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
  },
  // M
  {
    key: 'mews',
    name: 'Mews',
    description: 'Cloud-based property management system for hotels',
    deploymentStatus: 'planned',
  },
  // N
  {
    key: 'nightsbridge',
    name: 'NightsBridge',
    description: 'South African booking and channel management platform',
    hasCustomCard: true,
    deploymentStatus: 'deployed',
  },
  // R
  {
    key: 'rentalsunited',
    name: 'Rentals United',
    description: 'Channel manager and distribution platform for vacation rentals',
    hasCustomCard: true,
    deploymentStatus: 'in_development',
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
    name: 'RoomsOnline',
    description: "RoomsOnline's proprietary API for direct property management",
    isInternal: true,
    hasCustomCard: true,
    deploymentStatus: 'deployed',
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

// Get total count of all systems
export const TOTAL_PMS_SYSTEMS_COUNT = ALL_PMS_SYSTEMS.length;

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
    case 'ready':
      return { label: 'Ready', variant: 'secondary' as const, className: '' };
    case 'in_development':
      return { label: 'In Development', variant: 'outline' as const, className: 'text-amber-600 border-amber-500/30' };
    case 'planned':
      return { label: 'Planned', variant: 'outline' as const, className: 'text-muted-foreground' };
  }
};
