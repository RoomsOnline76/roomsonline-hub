/**
 * Internal Field Mapping Structure
 * 
 * This tree structure maps the application hierarchy:
 * Page → Tab → Sub-Tab → Section → Field
 * 
 * Used for:
 * - Linking external data to specific fields
 * - PMS field mapping references
 * - Navigation/breadcrumb generation
 * - Data validation and schema reference
 */

export interface FieldDefinition {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'textarea' | 'array' | 'object' | 'image' | 'toggle' | 'time' | 'currency';
  required?: boolean;
  pmsPopulatable?: boolean; // Can this field be populated by a PMS?
  pmsSystems?: string[]; // Which PMS systems can populate this field?
  description?: string;
}

export interface SectionDefinition {
  id: string;
  label: string;
  description?: string;
  fields?: FieldDefinition[];
  sections?: SectionDefinition[]; // Nested sections
}

export interface SubTabDefinition {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  sections?: SectionDefinition[];
  fields?: FieldDefinition[];
}

export interface TabDefinition {
  id: string;
  label: string;
  icon?: string;
  subTabs?: SubTabDefinition[];
  sections?: SectionDefinition[];
  fields?: FieldDefinition[];
}

export interface PageDefinition {
  id: string;
  path: string;
  label: string;
  description?: string;
  tabs?: TabDefinition[];
  sections?: SectionDefinition[];
}

export interface InternalFieldMap {
  pages: PageDefinition[];
}

export const internalFieldMap: InternalFieldMap = {
  pages: [
    // =====================
    // PROPERTY FORM
    // =====================
    {
      id: 'property-form',
      path: '/admin/properties/:slug',
      label: 'Property Form',
      description: 'Create and edit property details',
      tabs: [
        {
          id: 'general',
          label: 'General',
          icon: 'Settings',
          sections: [
            {
              id: 'property-basics',
              label: 'Property Basics',
              fields: [
                { id: 'name', label: 'Property Name', type: 'text', required: true, pmsPopulatable: true, pmsSystems: ['benson', 'nightsbridge', 'checkfront'] },
                { id: 'slug', label: 'URL Slug', type: 'text', required: true },
                { id: 'property_type', label: 'Property Type', type: 'select', required: true },
                { id: 'star_rating', label: 'Star Rating', type: 'select', pmsPopulatable: true, pmsSystems: ['benson'] },
                { id: 'description', label: 'Description', type: 'textarea', pmsPopulatable: true, pmsSystems: ['benson', 'nightsbridge'] },
              ]
            },
            {
              id: 'pms-connection',
              label: 'PMS Connection',
              fields: [
                { id: 'external_system', label: 'Connected PMS', type: 'select' },
                { id: 'benson_property_code', label: 'Benson Property Code', type: 'text' },
                { id: 'checkfront_property_code', label: 'Checkfront Property Code', type: 'text' },
                { id: 'siteminder_property_code', label: 'SiteMinder Property Code', type: 'text' },
                { id: 'external_id', label: 'External ID', type: 'text' },
              ]
            },
            {
              id: 'ownership',
              label: 'Ownership',
              fields: [
                { id: 'owner_name', label: 'Owner Name', type: 'select', required: true },
                { id: 'owner_email', label: 'Owner Email', type: 'text' },
              ]
            }
          ]
        },
        {
          id: 'house-style',
          label: 'House Style',
          icon: 'Palette',
          sections: [
            {
              id: 'branding',
              label: 'Branding',
              fields: [
                { id: 'amenities.primary_color', label: 'Primary Color', type: 'text' },
                { id: 'amenities.secondary_color', label: 'Secondary Color', type: 'text' },
                { id: 'amenities.logo_url', label: 'Logo URL', type: 'text' },
              ]
            }
          ]
        },
        {
          id: 'location',
          label: 'Location',
          icon: 'MapPin',
          sections: [
            {
              id: 'address',
              label: 'Address',
              fields: [
                { id: 'address', label: 'Street Address', type: 'text', required: true, pmsPopulatable: true, pmsSystems: ['benson'] },
                { id: 'city', label: 'City', type: 'text', required: true, pmsPopulatable: true, pmsSystems: ['benson'] },
                { id: 'country', label: 'Country', type: 'text', required: true, pmsPopulatable: true, pmsSystems: ['benson'] },
                { id: 'amenities.postal_code', label: 'Postal Code', type: 'text', pmsPopulatable: true, pmsSystems: ['benson'] },
              ]
            },
            {
              id: 'coordinates',
              label: 'Coordinates',
              fields: [
                { id: 'latitude', label: 'Latitude', type: 'number' },
                { id: 'longitude', label: 'Longitude', type: 'number' },
                { id: 'amenities.google_maps_pin', label: 'Google Maps Pin URL', type: 'text' },
              ]
            }
          ]
        },
        {
          id: 'property-info',
          label: 'Property Info & Facilities',
          icon: 'Building',
          sections: [
            {
              id: 'capacity',
              label: 'Capacity',
              fields: [
                { id: 'max_guests', label: 'Maximum Guests', type: 'number', required: true },
                { id: 'bedrooms', label: 'Bedrooms', type: 'number' },
                { id: 'bathrooms', label: 'Bathrooms', type: 'number' },
              ]
            },
            {
              id: 'check-times',
              label: 'Check-in/Check-out Times',
              fields: [
                { id: 'amenities.check_in_from', label: 'Check-in From', type: 'time', pmsPopulatable: true, pmsSystems: ['benson'] },
                { id: 'amenities.check_in_to', label: 'Check-in To', type: 'time', pmsPopulatable: true, pmsSystems: ['benson'] },
                { id: 'amenities.check_out_from', label: 'Check-out From', type: 'time', pmsPopulatable: true, pmsSystems: ['benson'] },
                { id: 'amenities.check_out_to', label: 'Check-out To', type: 'time', pmsPopulatable: true, pmsSystems: ['benson'] },
              ]
            },
            {
              id: 'facilities',
              label: 'Facilities & Amenities',
              fields: [
                { id: 'amenities.facilities', label: 'Facilities', type: 'array', description: 'List of available facilities' },
                { id: 'amenities.parking', label: 'Parking', type: 'toggle' },
                { id: 'amenities.wifi', label: 'WiFi', type: 'toggle' },
                { id: 'amenities.pool', label: 'Pool', type: 'toggle' },
                { id: 'amenities.restaurant', label: 'Restaurant', type: 'toggle' },
                { id: 'amenities.spa', label: 'Spa', type: 'toggle' },
              ]
            }
          ]
        },
        {
          id: 'house-rules',
          label: 'House Rules',
          icon: 'ScrollText',
          sections: [
            {
              id: 'policies',
              label: 'Policies',
              fields: [
                { id: 'amenities.pets_allowed', label: 'Pets Allowed', type: 'toggle' },
                { id: 'amenities.smoking_allowed', label: 'Smoking Allowed', type: 'toggle' },
                { id: 'amenities.events_allowed', label: 'Events Allowed', type: 'toggle' },
                { id: 'amenities.children_allowed', label: 'Children Allowed', type: 'toggle' },
                { id: 'amenities.house_rules_text', label: 'House Rules Text', type: 'textarea' },
              ]
            },
            {
              id: 'cancellation',
              label: 'Cancellation Policy',
              fields: [
                { id: 'amenities.cancellation_policy', label: 'Cancellation Policy', type: 'select' },
                { id: 'amenities.cancellation_days', label: 'Cancellation Days', type: 'number' },
              ]
            }
          ]
        },
        {
          id: 'offerings',
          label: 'Offerings',
          icon: 'Package',
          sections: [
            {
              id: 'offering-types',
              label: 'Offering Types',
              fields: [
                { id: 'amenities.accommodation', label: 'Accommodation', type: 'toggle' },
                { id: 'amenities.event_wedding', label: 'Event/Wedding', type: 'toggle' },
                { id: 'amenities.conference', label: 'Conference', type: 'toggle' },
              ]
            },
            {
              id: 'meal-options',
              label: 'Meal Options',
              fields: [
                { id: 'amenities.meal_types', label: 'Meal Types', type: 'array', description: 'Available meal packages' },
              ]
            }
          ]
        },
        {
          id: 'room-information',
          label: 'Room Information',
          icon: 'Bed',
          sections: [
            {
              id: 'room-types',
              label: 'Room Types',
              description: 'Array of room type configurations',
              sections: [
                {
                  id: 'room-type-item',
                  label: 'Room Type',
                  fields: [
                    { id: 'amenities.room_types[].name', label: 'Room Name', type: 'text', required: true, pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].pmsRoomType', label: 'PMS Room Type', type: 'text', pmsPopulatable: true, pmsSystems: ['benson', 'nightsbridge', 'checkfront'] },
                    { id: 'amenities.room_types[].pmsRoomId', label: 'PMS Room ID', type: 'text', pmsPopulatable: true, pmsSystems: ['benson', 'nightsbridge', 'checkfront'] },
                    { id: 'amenities.room_types[].description', label: 'Description', type: 'textarea', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].numRooms', label: 'Number of Rooms', type: 'number' },
                    { id: 'amenities.room_types[].maxPeople', label: 'Max People', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].maxAdults', label: 'Max Adults', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].maxChildren', label: 'Max Children', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].minStay', label: 'Minimum Stay', type: 'number' },
                    { id: 'amenities.room_types[].maxStay', label: 'Maximum Stay', type: 'number' },
                    { id: 'amenities.room_types[].bedConfiguration', label: 'Bed Configuration', type: 'text' },
                    { id: 'amenities.room_types[].roomSize', label: 'Room Size', type: 'text' },
                    { id: 'amenities.room_types[].floor', label: 'Floor', type: 'number' },
                    { id: 'amenities.room_types[].bathrooms', label: 'Bathrooms', type: 'number' },
                    { id: 'amenities.room_types[].images', label: 'Room Images', type: 'array' },
                  ]
                },
                {
                  id: 'room-rate-info',
                  label: 'Rate Information',
                  fields: [
                    { id: 'amenities.room_types[].rate_info[].rateType', label: 'Rate Type', type: 'text', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].rate_info[].rateId', label: 'Rate ID', type: 'text', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].rate_info[].mealTypes', label: 'Meal Types', type: 'array' },
                  ]
                },
                {
                  id: 'room-guest-config',
                  label: 'Guest Configuration',
                  fields: [
                    { id: 'amenities.room_types[].minGuests', label: 'Min Guests', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].allowTeens', label: 'Allow Teens', type: 'toggle', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].teenMinAge', label: 'Teen Min Age', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].teenMaxAge', label: 'Teen Max Age', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].allowChildren', label: 'Allow Children', type: 'toggle', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].childMinAge', label: 'Child Min Age', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].childMaxAge', label: 'Child Max Age', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].allowInfants', label: 'Allow Infants', type: 'toggle', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].infantMinAge', label: 'Infant Min Age', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                    { id: 'amenities.room_types[].infantMaxAge', label: 'Infant Max Age', type: 'number', pmsPopulatable: true, pmsSystems: ['benson'] },
                  ]
                }
              ]
            }
          ]
        },
        {
          id: 'rate-breakdown',
          label: 'Rate Breakdown',
          icon: 'Calculator',
          subTabs: [
            {
              id: 'seasons',
              label: 'Seasons',
              fields: [
                { id: 'amenities.seasons[].name', label: 'Season Name', type: 'text', required: true },
                { id: 'amenities.seasons[].startDate', label: 'Start Date', type: 'date', required: true },
                { id: 'amenities.seasons[].endDate', label: 'End Date', type: 'date', required: true },
              ]
            },
            {
              id: 'rate-breakdown-config',
              label: 'Rate Breakdown',
              sections: [
                {
                  id: 'rate-matrix',
                  label: 'Rate Matrix',
                  description: 'Room Type × Season × Meal Type rates',
                  fields: [
                    { id: 'amenities.rate_breakdown[].roomTypeId', label: 'Room Type', type: 'select' },
                    { id: 'amenities.rate_breakdown[].seasonId', label: 'Season', type: 'select' },
                    { id: 'amenities.rate_breakdown[].mealType', label: 'Meal Type', type: 'select' },
                    { id: 'amenities.rate_breakdown[].unitRate', label: 'Unit Rate', type: 'currency' },
                    { id: 'amenities.rate_breakdown[].weekendRate', label: 'Weekend Rate', type: 'currency' },
                  ]
                }
              ]
            },
            {
              id: 'rate-overview',
              label: 'Overview',
              description: 'Summary view of all configured rates'
            }
          ]
        },
        {
          id: 'property-images',
          label: 'Property Images',
          icon: 'Image',
          sections: [
            {
              id: 'image-gallery',
              label: 'Image Gallery',
              fields: [
                { id: 'images', label: 'Property Images', type: 'array', description: 'Array of image URLs' },
              ]
            }
          ]
        },
        {
          id: 'invoicing',
          label: 'Property & Banking Details',
          icon: 'Receipt',
          sections: [
            {
              id: 'company-details',
              label: 'Company Details',
              fields: [
                { id: 'amenities.company_name', label: 'Company Name', type: 'text' },
                { id: 'amenities.registration_number', label: 'Registration Number', type: 'text' },
                { id: 'amenities.has_vat', label: 'Has VAT Number', type: 'toggle' },
                { id: 'amenities.vat_number', label: 'VAT Number', type: 'text' },
              ]
            },
            {
              id: 'banking',
              label: 'Banking Details',
              fields: [
                { id: 'amenities.bank_name', label: 'Bank Name', type: 'text' },
                { id: 'amenities.account_holder', label: 'Account Holder', type: 'text' },
                { id: 'amenities.account_number', label: 'Account Number', type: 'text' },
                { id: 'amenities.branch_code', label: 'Branch Code', type: 'text' },
              ]
            }
          ]
        }
      ]
    },

    // =====================
    // CALENDAR
    // =====================
    {
      id: 'calendar',
      path: '/admin/calendar',
      label: 'Calendar',
      description: 'Manage availability, rates, and restrictions',
      tabs: [
        {
          id: 'accommodation',
          label: 'Accommodation',
          icon: 'Bed',
          sections: [
            {
              id: 'display-options',
              label: 'Display Options',
              fields: [
                { id: 'showRates', label: 'Show Rates', type: 'toggle' },
                { id: 'showStopSell', label: 'Show Stop Sell', type: 'toggle' },
                { id: 'showLeadDaysAdvance', label: 'Show Lead Days Advance', type: 'toggle' },
                { id: 'showLeadDaysPost', label: 'Show Lead Days Post', type: 'toggle' },
                { id: 'showMinStay', label: 'Show Min Stay', type: 'toggle' },
                { id: 'showMaxStay', label: 'Show Max Stay', type: 'toggle' },
              ]
            },
            {
              id: 'calendar-grid',
              label: 'Calendar Grid',
              description: 'Date-based grid showing room availability and rates',
              sections: [
                {
                  id: 'room-row',
                  label: 'Room Row',
                  fields: [
                    { id: 'availability', label: 'Available Units', type: 'number' },
                    { id: 'stopSell', label: 'Stop Sell', type: 'toggle' },
                    { id: 'leadDaysAdvance', label: 'Lead Days Advance', type: 'number' },
                    { id: 'leadDaysPost', label: 'Lead Days Post', type: 'number' },
                    { id: 'minStay', label: 'Minimum Stay', type: 'number' },
                    { id: 'maxStay', label: 'Maximum Stay', type: 'number' },
                  ]
                },
                {
                  id: 'rate-row',
                  label: 'Rate Row',
                  fields: [
                    { id: 'rateAmount', label: 'Rate Amount', type: 'currency' },
                    { id: 'mealType', label: 'Meal Type', type: 'text' },
                  ]
                }
              ]
            }
          ]
        },
        {
          id: 'event-wedding',
          label: 'Event/Wedding',
          icon: 'PartyPopper',
          sections: [
            {
              id: 'event-calendar',
              label: 'Event Calendar',
              description: 'Calendar for event and wedding bookings'
            }
          ]
        },
        {
          id: 'conference',
          label: 'Conference',
          icon: 'Users',
          sections: [
            {
              id: 'conference-calendar',
              label: 'Conference Calendar',
              description: 'Calendar for conference room bookings'
            }
          ]
        }
      ]
    },

    // =====================
    // BOOKINGS
    // =====================
    {
      id: 'bookings',
      path: '/admin/bookings',
      label: 'Bookings',
      description: 'View and manage reservations',
      sections: [
        {
          id: 'booking-list',
          label: 'Booking List',
          fields: [
            { id: 'guest_name', label: 'Guest Name', type: 'text' },
            { id: 'guest_email', label: 'Guest Email', type: 'text' },
            { id: 'guest_phone', label: 'Guest Phone', type: 'text' },
            { id: 'check_in_date', label: 'Check-in Date', type: 'date' },
            { id: 'check_out_date', label: 'Check-out Date', type: 'date' },
            { id: 'adults', label: 'Adults', type: 'number' },
            { id: 'children', label: 'Children', type: 'number' },
            { id: 'infants', label: 'Infants', type: 'number' },
            { id: 'total_price', label: 'Total Price', type: 'currency' },
            { id: 'status', label: 'Status', type: 'select' },
            { id: 'special_requests', label: 'Special Requests', type: 'textarea' },
          ]
        }
      ]
    },

    // =====================
    // DASHBOARD / REPORTS
    // =====================
    {
      id: 'dashboard',
      path: '/dashboard/reports',
      label: 'Dashboard',
      description: 'Analytics and reporting',
      sections: [
        {
          id: 'kpi-cards',
          label: 'KPI Cards',
          fields: [
            { id: 'totalBookings', label: 'Total Bookings', type: 'number' },
            { id: 'cancellations', label: 'Cancellations', type: 'number' },
            { id: 'totalRevenue', label: 'Total Revenue', type: 'currency' },
            { id: 'propertiesCount', label: 'Properties Count', type: 'number' },
            { id: 'adr', label: 'ADR (Average Daily Rate)', type: 'currency' },
            { id: 'revpar', label: 'RevPAR', type: 'currency' },
            { id: 'occupancy', label: 'Occupancy %', type: 'number' },
          ]
        },
        {
          id: 'charts',
          label: 'Charts',
          fields: [
            { id: 'bookingsOverview', label: 'Bookings Overview', type: 'object' },
            { id: 'revenueTrend', label: 'Revenue Trend', type: 'object' },
            { id: 'propertyBreakdown', label: 'Property Breakdown', type: 'object' },
          ]
        }
      ]
    },

    // =====================
    // BENSON CONFIG
    // =====================
    {
      id: 'benson-config',
      path: '/admin/benson-config',
      label: 'Benson Configuration',
      description: 'Map Benson field IDs to internal system',
      tabs: [
        {
          id: 'room-types',
          label: 'Room Types',
          sections: [
            {
              id: 'room-type-mappings',
              label: 'Room Type Mappings',
              fields: [
                { id: 'external_id', label: 'Benson Room Type ID', type: 'text' },
                { id: 'external_name', label: 'Benson Room Type Name', type: 'text' },
                { id: 'internal_id', label: 'Internal Room Type ID', type: 'text' },
                { id: 'internal_name', label: 'Internal Room Type Name', type: 'text' },
              ]
            }
          ]
        },
        {
          id: 'rate-types',
          label: 'Rate Types',
          sections: [
            {
              id: 'rate-type-mappings',
              label: 'Rate Type Mappings',
              fields: [
                { id: 'external_id', label: 'Benson Rate Type ID', type: 'text' },
                { id: 'external_name', label: 'Benson Rate Type Name', type: 'text' },
                { id: 'internal_id', label: 'Internal Rate Type ID', type: 'text' },
                { id: 'internal_name', label: 'Internal Rate Type Name', type: 'text' },
              ]
            }
          ]
        },
        {
          id: 'charge-types',
          label: 'Charge Types',
          sections: [
            {
              id: 'charge-type-mappings',
              label: 'Charge Type Mappings',
              fields: [
                { id: 'external_id', label: 'Benson Charge Type ID', type: 'text' },
                { id: 'external_name', label: 'Benson Charge Type Name', type: 'text' },
                { id: 'internal_id', label: 'Internal Charge Type ID', type: 'text' },
                { id: 'internal_name', label: 'Internal Charge Type Name', type: 'text' },
              ]
            }
          ]
        },
        {
          id: 'payment-types',
          label: 'Payment Types',
          sections: [
            {
              id: 'payment-type-mappings',
              label: 'Payment Type Mappings',
              fields: [
                { id: 'external_id', label: 'Benson Payment Type ID', type: 'text' },
                { id: 'external_name', label: 'Benson Payment Type Name', type: 'text' },
                { id: 'internal_id', label: 'Internal Payment Type ID', type: 'text' },
                { id: 'internal_name', label: 'Internal Payment Type Name', type: 'text' },
              ]
            }
          ]
        }
      ]
    },

    // =====================
    // ADMIN API KEYS
    // =====================
    {
      id: 'admin-keys',
      path: '/admin/keys',
      label: 'API Keys',
      description: 'Manage PMS credentials and service API keys',
      sections: [
        {
          id: 'pms-systems',
          label: 'Property Management Systems',
          sections: [
            {
              id: 'benson',
              label: 'Benson',
              fields: [
                { id: 'username', label: 'Username', type: 'text' },
                { id: 'password', label: 'Password', type: 'text' },
                { id: 'environment', label: 'Environment', type: 'select' },
                { id: 'property_code', label: 'Property Code', type: 'text' },
                { id: 'property_name', label: 'Property Name', type: 'text' },
                { id: 'base_url', label: 'Base URL', type: 'text' },
              ]
            },
            {
              id: 'nightsbridge',
              label: 'NightsBridge',
              fields: [
                { id: 'api_key', label: 'API Key', type: 'text' },
                { id: 'agent_code', label: 'Agent Code', type: 'text' },
                { id: 'environment', label: 'Environment', type: 'select' },
              ]
            },
            {
              id: 'checkfront',
              label: 'Checkfront',
              fields: [
                { id: 'auth_mode', label: 'Auth Mode', type: 'select' },
                { id: 'api_key', label: 'API Key', type: 'text' },
                { id: 'api_secret', label: 'API Secret', type: 'text' },
                { id: 'username', label: 'Username', type: 'text' },
                { id: 'password', label: 'Password', type: 'text' },
                { id: 'host', label: 'Host', type: 'text' },
              ]
            }
          ]
        },
        {
          id: 'additional-services',
          label: 'Additional Services',
          sections: [
            {
              id: 'google-maps',
              label: 'Google Maps',
              fields: [
                { id: 'google_maps_api_key', label: 'API Key', type: 'text' },
              ]
            },
            {
              id: 'resend',
              label: 'Resend Email',
              fields: [
                { id: 'RESEND_API_KEY', label: 'API Key', type: 'text' },
                { id: 'RESEND_FROM_EMAIL', label: 'From Email', type: 'text' },
                { id: 'RESEND_TO_EMAIL', label: 'Admin Notification Email', type: 'text' },
              ]
            }
          ]
        }
      ]
    }
  ]
};

// =====================
// UTILITY FUNCTIONS
// =====================

/**
 * Get a field path string for a nested field
 * Example: getFieldPath('property-form', 'room-information', 'room-types', 'amenities.room_types[].name')
 * Returns: "property-form.room-information.room-types.amenities.room_types[].name"
 */
export function getFieldPath(...segments: string[]): string {
  return segments.join('.');
}

/**
 * Find a page definition by ID
 */
export function findPage(pageId: string): PageDefinition | undefined {
  return internalFieldMap.pages.find(p => p.id === pageId);
}

/**
 * Find a tab within a page
 */
export function findTab(pageId: string, tabId: string): TabDefinition | undefined {
  const page = findPage(pageId);
  return page?.tabs?.find(t => t.id === tabId);
}

/**
 * Find a section within a page or tab
 */
export function findSection(pageId: string, tabId: string | null, sectionId: string): SectionDefinition | undefined {
  const page = findPage(pageId);
  if (tabId) {
    const tab = findTab(pageId, tabId);
    return tab?.sections?.find(s => s.id === sectionId);
  }
  return page?.sections?.find(s => s.id === sectionId);
}

/**
 * Find a field definition by its full path
 */
export function findField(fieldId: string): FieldDefinition | undefined {
  for (const page of internalFieldMap.pages) {
    // Check page-level fields
    for (const section of page.sections || []) {
      const field = section.fields?.find(f => f.id === fieldId);
      if (field) return field;
    }
    
    // Check tab-level fields
    for (const tab of page.tabs || []) {
      for (const section of tab.sections || []) {
        const field = section.fields?.find(f => f.id === fieldId);
        if (field) return field;
        
        // Check nested sections
        for (const nestedSection of section.sections || []) {
          const nestedField = nestedSection.fields?.find(f => f.id === fieldId);
          if (nestedField) return nestedField;
        }
      }
      
      // Check sub-tabs
      for (const subTab of tab.subTabs || []) {
        for (const section of subTab.sections || []) {
          const field = section.fields?.find(f => f.id === fieldId);
          if (field) return field;
        }
        const directField = subTab.fields?.find(f => f.id === fieldId);
        if (directField) return directField;
      }
    }
  }
  return undefined;
}

/**
 * Get all fields that can be populated by a specific PMS
 */
export function getFieldsPopulatableByPMS(pmsSystem: string): FieldDefinition[] {
  const fields: FieldDefinition[] = [];
  
  for (const page of internalFieldMap.pages) {
    const collectFields = (sections: SectionDefinition[] | undefined) => {
      for (const section of sections || []) {
        for (const field of section.fields || []) {
          if (field.pmsPopulatable && field.pmsSystems?.includes(pmsSystem)) {
            fields.push(field);
          }
        }
        collectFields(section.sections);
      }
    };
    
    collectFields(page.sections);
    for (const tab of page.tabs || []) {
      collectFields(tab.sections);
      for (const subTab of tab.subTabs || []) {
        collectFields(subTab.sections);
      }
    }
  }
  
  return fields;
}

/**
 * Get the breadcrumb path for a field
 */
export function getFieldBreadcrumb(fieldId: string): string[] {
  for (const page of internalFieldMap.pages) {
    for (const tab of page.tabs || []) {
      for (const section of tab.sections || []) {
        if (section.fields?.some(f => f.id === fieldId)) {
          return [page.label, tab.label, section.label];
        }
        for (const nestedSection of section.sections || []) {
          if (nestedSection.fields?.some(f => f.id === fieldId)) {
            return [page.label, tab.label, section.label, nestedSection.label];
          }
        }
      }
    }
  }
  return [];
}

export default internalFieldMap;
