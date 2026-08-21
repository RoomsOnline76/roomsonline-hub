import { ReportsPlaceholder } from "./ReportsPlaceholder";
import { usePageSEO } from "@/hooks/usePageSEO";

export default function ReportsNewRun() {
  usePageSEO({
    title: "New revenue report | Rooms Online",
    description: "Create a new consolidated revenue review run for a property.",
    noIndex: true,
  });
  return (
    <ReportsPlaceholder
      title="New report"
      phase="Phase 1"
      description="Select a property, set the as-of date and upload the source files."
    />
  );
}
