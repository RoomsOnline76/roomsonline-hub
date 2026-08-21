import { useParams } from "react-router-dom";
import { ReportsPlaceholder } from "./ReportsPlaceholder";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportProperties } from "@/hooks/useReportProperties";

export default function ReportsPropertySettings() {
  const { propertyId } = useParams();
  const { properties } = useReportProperties();
  const property = properties.find((p) => p.id === propertyId);

  usePageSEO({
    title: "Property report settings | Rooms Online",
    description: "Configure logo, capacity, brand colours and historical baselines.",
    noIndex: true,
  });

  return (
    <ReportsPlaceholder
      title={property ? `${property.name} — report settings` : "Property report settings"}
      phase="Phase 4"
      description="Room count, logo, cover artwork, brand colours and historical baselines."
    />
  );
}
