/**
 * ROLOS-only facilities: legacy property-level options that have NO Rentals United
 * equivalent. They stay available for the ROLOS website/showcase but are never part
 * of the channel payload — everything channel-facing now comes from the RU catalogue
 * (see `RUAmenityPicker`, scope="property").
 */
export interface RolosOnlyFacilityGroup {
  title: string;
  items: string[];
}

export const ROLOS_ONLY_FACILITY_GROUPS: RolosOnlyFacilityGroup[] = [
  {
    title: "Business & Reception",
    items: [
      "24-Hour Front Desk",
      "Wake-Up Service",
      "Currency Exchange",
      "Ticket Service",
      "Porter/Bell Service",
      "Express Check-Out",
      "Concierge Service",
    ],
  },
  {
    title: "Conference & Events",
    items: [
      "Banquet Hall",
      "Event Space",
      "Wedding Facilities",
      "Audio-Visual Equipment",
      "Projector",
      "Screen",
      "Event Catering",
    ],
  },
  {
    title: "Meals & Dining",
    items: [
      "Breakfast Available (Paid)",
      "Lunch Available",
      "Dinner Available",
      "Special Diet Menus on Request",
      "Packed Lunches",
      "Restaurant",
      "Bar",
      "Wine Cellar",
      "Room Service",
    ],
  },
  {
    title: "Power & Utilities",
    items: ["Backup Power Generator", "Solar Power", "Inverter Power"],
  },
  {
    title: "Activities & Experiences",
    items: [
      "Game Drives (Morning)",
      "Game Drives (Evening)",
      "Guided Safari Walks",
      "Bird Watching",
      "Cycling",
      "Fishing",
      "Cultural Tours",
      "Hiking Trails",
      "Walking Tours",
      "Live Music/Performance",
      "Airport Transfer",
      "Car Hire Assistance",
      "Airport Shuttle",
    ],
  },
  {
    title: "Wellness & Fitness",
    items: [
      "Fitness Centre",
      "Sauna",
      "Steam Room",
      "Yoga Classes",
      "Spa",
      "Full Body Massage",
      "Couples Massage",
    ],
  },
  {
    title: "Family Services",
    items: [
      "Children Play Area",
      "Kids Meals",
      "Child-Friendly Activities",
      "Family Rooms",
      "Babysitting/Child Services",
    ],
  },
  {
    title: "Views",
    items: [
      "Sea View",
      "Mountain View",
      "Garden View",
      "Pool View",
      "City View",
      "Lake View",
      "River View",
      "Courtyard View",
    ],
  },
  {
    title: "Languages Spoken",
    items: ["English", "Afrikaans", "Other Languages"],
  },
];
