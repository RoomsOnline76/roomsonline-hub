// PMS Capabilities Data for Comparison Page
// Source of truth for PMS integration capabilities

export interface PMSCapability {
  key: string;
  name: string;
  liveAvailability: boolean;
  rateFetching: boolean;
  createBooking: boolean;
  modifyBooking: boolean;
  cancelBooking: boolean;
  webhooks: boolean;
  bestFor: string;
  regionalFocus: string;
  integrationStatus: 'production' | 'development' | 'planned';
  note?: string;
  pros: string[];
  cons: string[];
  description: string;
}

export const pmsCapabilities: PMSCapability[] = [
  {
    key: 'benson',
    name: 'Benson',
    liveAvailability: true,
    rateFetching: true,
    createBooking: true,
    modifyBooking: true,
    cancelBooking: true,
    webhooks: false,
    bestFor: 'Full-service hotels',
    regionalFocus: 'South Africa',
    integrationStatus: 'production',
    pros: ['Full booking lifecycle', 'Live availability checks', 'Best SA integration', 'Modify & cancel support'],
    cons: ['No webhooks for push updates', 'Polling required for sync'],
    description: 'Benson is the most fully integrated PMS in the RoomsOnline ecosystem, supporting the complete booking lifecycle from availability checks through modifications and cancellations.'
  },
  {
    key: 'nightsbridge',
    name: 'NightsBridge',
    liveAvailability: false,
    rateFetching: false,
    createBooking: false,
    modifyBooking: false,
    cancelBooking: false,
    webhooks: false,
    bestFor: 'Widget-based bookings',
    regionalFocus: 'South Africa',
    integrationStatus: 'production',
    note: 'Uses widget-based redirects rather than direct API calls',
    pros: ['Minimal setup required', 'Established SA presence', 'Widget handles complexity'],
    cons: ['No direct API access', 'Limited customization', 'Redirect-based flow'],
    description: 'NightsBridge integration uses an iframe widget approach, redirecting guests to the NightsBridge booking flow while maintaining session tracking for attribution.'
  },
  {
    key: 'cloudbeds',
    name: 'Cloudbeds',
    liveAvailability: true,
    rateFetching: true,
    createBooking: true,
    modifyBooking: false,
    cancelBooking: false,
    webhooks: false,
    bestFor: 'Boutique hotels',
    regionalFocus: 'Global',
    integrationStatus: 'production',
    pros: ['Cloud-based management', 'Multi-property support', 'Rich availability data'],
    cons: ['Create-only bookings', 'No modification support'],
    description: 'Cloudbeds offers a robust cloud-based PMS with excellent availability and rate fetching capabilities. Booking creation is supported but modifications must be done in Cloudbeds directly.'
  },
  {
    key: 'checkfront',
    name: 'Checkfront',
    liveAvailability: true,
    rateFetching: true,
    createBooking: true,
    modifyBooking: false,
    cancelBooking: false,
    webhooks: false,
    bestFor: 'Activity-focused rentals',
    regionalFocus: 'Global',
    integrationStatus: 'production',
    pros: ['Activity booking support', 'Good rate management', 'Flexible inventory'],
    cons: ['No modification support', 'No cancellation API'],
    description: 'Checkfront excels at managing activity-based and tour bookings alongside accommodation, making it ideal for lodges and experience-focused properties.'
  },
  {
    key: 'littlehotelier',
    name: 'Little Hotelier',
    liveAvailability: true,
    rateFetching: true,
    createBooking: true,
    modifyBooking: false,
    cancelBooking: false,
    webhooks: false,
    bestFor: 'Small properties',
    regionalFocus: 'AU/EU/US',
    integrationStatus: 'production',
    pros: ['Built for small hotels', 'Simple interface', 'Good rate management'],
    cons: ['Limited to creation only', 'No SA-specific features'],
    description: 'Little Hotelier is designed specifically for small accommodation providers, offering a streamlined interface with solid availability and booking creation support.'
  },
  {
    key: 'hotelbeds',
    name: 'HotelBeds',
    liveAvailability: true,
    rateFetching: true,
    createBooking: true,
    modifyBooking: false,
    cancelBooking: true,
    webhooks: false,
    bestFor: 'B2B distribution',
    regionalFocus: 'Global',
    integrationStatus: 'production',
    pros: ['B2B distribution network', 'Cancellation support', 'Large inventory access'],
    cons: ['No modification support', 'B2B focused'],
    description: 'HotelBeds provides access to a vast B2B distribution network with support for booking creation and cancellation, ideal for properties seeking wholesale distribution.'
  },
  {
    key: 'hostfully',
    name: 'Hostfully',
    liveAvailability: true,
    rateFetching: true,
    createBooking: false,
    modifyBooking: false,
    cancelBooking: false,
    webhooks: false,
    bestFor: 'Vacation rentals',
    regionalFocus: 'Global',
    integrationStatus: 'production',
    pros: ['Rich property data sync', 'Great for vacation rentals', 'Editorial content sync'],
    cons: ['Read-only (no booking creation)', 'Requires external booking'],
    description: 'Hostfully integration focuses on rich property data synchronization, pulling detailed descriptions, amenities, and images. Bookings are managed through Hostfully\'s own channels.'
  },
  {
    key: 'rentalsunited',
    name: 'Rentals United',
    liveAvailability: false,
    rateFetching: false,
    createBooking: false,
    modifyBooking: false,
    cancelBooking: false,
    webhooks: false,
    bestFor: 'Channel distribution',
    regionalFocus: 'Global',
    integrationStatus: 'development',
    pros: ['Wide channel distribution', 'Multi-platform reach'],
    cons: ['In development', 'Not yet available'],
    description: 'Rentals United integration is currently in development. It will provide channel management and distribution capabilities for vacation rental properties.'
  },
  {
    key: 'roomsonline',
    name: 'RoomsOnline Native',
    liveAvailability: true,
    rateFetching: true,
    createBooking: true,
    modifyBooking: true,
    cancelBooking: true,
    webhooks: true,
    bestFor: 'Properties without PMS',
    regionalFocus: 'Global',
    integrationStatus: 'production',
    pros: ['Full control', 'Direct cache updates', 'No external dependencies', 'Webhooks support'],
    cons: ['No external PMS sync', 'Manual inventory management'],
    description: 'RoomsOnline Native is the built-in inventory system for properties that don\'t use an external PMS. It provides full booking lifecycle support with real-time webhooks.'
  }
];

export const getCapabilityCount = (capability: keyof Omit<PMSCapability, 'key' | 'name' | 'bestFor' | 'regionalFocus' | 'integrationStatus' | 'note' | 'pros' | 'cons' | 'description'>) => {
  return pmsCapabilities.filter(pms => pms[capability] === true).length;
};
