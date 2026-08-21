import { ReportsPlaceholder } from "./ReportsPlaceholder";
import { usePageSEO } from "@/hooks/usePageSEO";

export default function ReportsRunReview() {
  usePageSEO({
    title: "Review revenue report | Rooms Online",
    description: "Review and refine a consolidated revenue review run.",
    noIndex: true,
  });
  return (
    <ReportsPlaceholder
      title="Review run"
      phase="Phase 2"
      description="Tables, source mix and draft preview for a processed run."
    />
  );
}
