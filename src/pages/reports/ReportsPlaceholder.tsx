import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReportsPlaceholderProps {
  title: string;
  phase: string;
  description: string;
}

/** Phase 0 stand-in for Reports surfaces delivered in later phases. */
export function ReportsPlaceholder({ title, phase, description }: ReportsPlaceholderProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Coming in {phase}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The foundations are in place. This screen is delivered in {phase} of the
          Revenue Reports rollout.
        </CardContent>
      </Card>
    </div>
  );
}
