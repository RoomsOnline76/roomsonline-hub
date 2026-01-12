import { Json } from "@/integrations/supabase/types";

export interface PropertyData {
  id: string;
  name: string;
  property_type: string;
  property_url: string | null;
  address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  images: Json | null;
  amenities: Json | null;
  pms_managed_fields: string[] | null;
}

export interface StepProps {
  propertyData: PropertyData;
  updateField: (field: string, value: unknown) => void;
  isPMSManaged: (field: string) => boolean;
  getAmenityValue: <T>(key: string, defaultValue: T) => T;
  onComplete?: () => void;
}
