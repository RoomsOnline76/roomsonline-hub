import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Check, X, Server } from "lucide-react";
import { pmsCapabilities } from "./pmsCapabilitiesData";
import { cn } from "@/lib/utils";

export function PMSDetailAccordion() {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'production':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Production Ready</Badge>;
      case 'development':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">In Development</Badge>;
      case 'planned':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Planned</Badge>;
      default:
        return null;
    }
  };

  return (
    <Accordion type="single" collapsible className="w-full space-y-2">
      {pmsCapabilities.map((pms) => (
        <AccordionItem 
          key={pms.key} 
          value={pms.key}
          className="border border-border rounded-lg px-4 data-[state=open]:bg-muted/30"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{pms.name}</span>
              {getStatusBadge(pms.integrationStatus)}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Description */}
              <div className="md:col-span-2">
                <p className="text-muted-foreground leading-relaxed">{pms.description}</p>
              </div>

              {/* Pros */}
              <div>
                <h4 className="font-medium text-sm mb-3 text-green-700 dark:text-green-400">Advantages</h4>
                <ul className="space-y-2">
                  {pms.pros.map((pro, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{pro}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Cons */}
              <div>
                <h4 className="font-medium text-sm mb-3 text-red-700 dark:text-red-400">Limitations</h4>
                <ul className="space-y-2">
                  {pms.cons.map((con, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <X className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <span>{con}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Quick Stats */}
              <div className="md:col-span-2 pt-4 border-t border-border">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Best For:</span>{" "}
                    <span className="font-medium">{pms.bestFor}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Region:</span>{" "}
                    <span className="font-medium">{pms.regionalFocus}</span>
                  </div>
                  {pms.note && (
                    <div className="w-full mt-2 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground">
                      <strong>Note:</strong> {pms.note}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
