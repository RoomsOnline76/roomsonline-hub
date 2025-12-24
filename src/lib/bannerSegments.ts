import {
  LayoutGrid,
  Sparkles,
  Compass,
  Building2,
  Palmtree,
  Mountain,
  Trees,
  Crown,
  MapPin,
  Heart,
  HeartPulse,
  Utensils,
  Leaf,
  ScrollText,
  Palette,
  Users,
  UserCheck,
  Star,
  LucideIcon,
} from "lucide-react";
import { SegmentFilterId } from "./segmentFilters";

export interface BannerSegment {
  id: string;
  label: string;
  icon: LucideIcon;
  filterType: SegmentFilterId | null;
}

export const BANNER_SEGMENTS: BannerSegment[] = [
  { id: "all", label: "ALL", icon: LayoutGrid, filterType: null },
  { id: "discover_new", label: "Discover New", icon: Sparkles, filterType: "discover_new" },
  { id: "city", label: "City", icon: Building2, filterType: "city" },
  { id: "beach", label: "Beach", icon: Palmtree, filterType: "beach" },
  { id: "mountain", label: "Mountain", icon: Mountain, filterType: "mountain" },
  { id: "countryside", label: "Countryside", icon: Trees, filterType: "countryside" },
  { id: "luxury_style", label: "Luxury | Style", icon: Crown, filterType: "luxury_style" },
  { id: "wow_epic", label: "WOW & Epic", icon: Star, filterType: "wow_epic" },
  { id: "seclusion_escape", label: "Seclusion | Escape", icon: MapPin, filterType: "seclusion_escape" },
  { id: "romance", label: "Romance", icon: Heart, filterType: "romance" },
  { id: "wellness", label: "Wellness", icon: HeartPulse, filterType: "wellness" },
  { id: "gastronomy", label: "Gastronomy", icon: Utensils, filterType: "gastronomy" },
  { id: "sustainable", label: "Sustainable", icon: Leaf, filterType: "sustainable" },
  { id: "history", label: "History", icon: ScrollText, filterType: "history" },
  { id: "arts_culture", label: "Arts & Culture", icon: Palette, filterType: "arts_culture" },
  { id: "family_friendly", label: "Family Friendly", icon: Users, filterType: "family_friendly" },
  { id: "adults_only", label: "Adults Only", icon: UserCheck, filterType: "adults_only" },
];
