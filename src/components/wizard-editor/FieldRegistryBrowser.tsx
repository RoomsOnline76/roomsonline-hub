import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Search, Lock, Database, RefreshCw } from "lucide-react";
import {
  useFieldRegistry,
  useSyncFieldRegistry,
  FieldRegistryEntry,
} from "@/hooks/useFieldRegistry";
import { OnboardingStepWithFields } from "@/hooks/useWizardConfig";

interface FieldRegistryBrowserProps {
  wizardId: string;
  steps: OnboardingStepWithFields[];
}

export function FieldRegistryBrowser({
  wizardId,
  steps,
}: FieldRegistryBrowserProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: fields, isLoading } = useFieldRegistry();
  const syncFieldRegistry = useSyncFieldRegistry();

  // Get all used field keys across all steps
  const usedFieldKeys = new Set(
    steps.flatMap((step) => step.fields.map((f) => f.field_key))
  );

  // Filter fields based on search
  const filteredFields = fields?.filter(
    (field) =>
      field.field_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      field.ui_label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      field.section?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group by section
  const groupedFields: Record<string, FieldRegistryEntry[]> = {};
  filteredFields?.forEach((field) => {
    const section = field.section || "Other";
    if (!groupedFields[section]) {
      groupedFields[section] = [];
    }
    groupedFields[section].push(field);
  });

  const sectionOrder = [
    "Identity",
    "Location",
    "Facilities",
    "Guest Experience",
    "Policies & Pricing",
    "Media & Documents",
    "Contact Details",
    "Other",
  ];

  const sortedSections = Object.keys(groupedFields).sort((a, b) => {
    const aIndex = sectionOrder.indexOf(a);
    const bIndex = sectionOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Field Browser */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Field Registry</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {fields?.length || 0} fields available · {usedFieldKeys.size} in
              use
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncFieldRegistry.mutate()}
            disabled={syncFieldRegistry.isPending}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                syncFieldRegistry.isPending ? "animate-spin" : ""
              }`}
            />
            Sync
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search fields..."
              className="pl-10"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-muted animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : fields?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No fields in registry.</p>
              <p className="text-sm">
                Click Sync to import from property-form-field-map.json
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Accordion
                type="multiple"
                defaultValue={sortedSections}
                className="space-y-2"
              >
                {sortedSections.map((section) => (
                  <AccordionItem
                    key={section}
                    value={section}
                    className="border rounded-lg"
                  >
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{section}</span>
                        <Badge variant="secondary" className="text-xs">
                          {groupedFields[section].length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-2">
                        {groupedFields[section].map((field) => {
                          const isUsed = usedFieldKeys.has(field.field_key);
                          return (
                            <div
                              key={field.id}
                              className={`p-3 rounded-lg border ${
                                isUsed
                                  ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                                  : "bg-muted/30"
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">
                                      {field.ui_label}
                                    </span>
                                    {field.pms_lockable && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs flex items-center gap-1"
                                      >
                                        <Lock className="h-3 w-3" />
                                        PMS
                                      </Badge>
                                    )}
                                    {field.is_required && (
                                      <Badge
                                        variant="destructive"
                                        className="text-xs"
                                      >
                                        Required
                                      </Badge>
                                    )}
                                    {isUsed && (
                                      <Badge
                                        variant="default"
                                        className="text-xs"
                                      >
                                        In Use
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    <code>{field.field_key}</code> →{" "}
                                    {field.db_table}.{field.db_column} (
                                    {field.data_type})
                                  </p>
                                  {field.notes && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {field.notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Usage Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Field Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.id} className="border rounded-lg p-3">
                <h4 className="font-medium text-sm">{step.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {step.fields.length} fields
                </p>
                {step.fields.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {step.fields.slice(0, 5).map((field) => (
                      <Badge
                        key={field.id}
                        variant="secondary"
                        className="text-xs"
                      >
                        {field.field_key.split("_").slice(-2).join("_")}
                      </Badge>
                    ))}
                    {step.fields.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{step.fields.length - 5} more
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}

            {steps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No steps configured. Add steps in the Structure tab.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
