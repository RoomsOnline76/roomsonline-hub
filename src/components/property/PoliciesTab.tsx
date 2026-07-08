import React from "react";
import { ReservationPoliciesList } from "@/components/property/ReservationPoliciesList";

interface PoliciesTabProps {
  propertyId: string;
}

export const PoliciesTab: React.FC<PoliciesTabProps> = ({ propertyId }) => {
  return <ReservationPoliciesList propertyId={propertyId} />;
};
