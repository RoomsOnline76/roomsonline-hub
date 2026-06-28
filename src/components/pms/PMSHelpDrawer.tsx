import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useHelp } from "@/contexts/HelpContext";
import { PMSTobiAssistant } from "@/components/pms/PMSTobiAssistant";

interface PMSHelpDrawerProps {
  propertyName?: string;
  isPortfolio?: boolean;
  portfolioPropertyIds?: string[];
  portfolioName?: string;
}

export function PMSHelpDrawer({
  propertyName,
  isPortfolio,
  portfolioPropertyIds,
  portfolioName,
}: PMSHelpDrawerProps) {
  const { isOpen, toggleHelp } = useHelp();

  return (
    <Sheet open={isOpen} onOpenChange={toggleHelp}>
      <SheetContent className="w-[400px] sm:w-[440px] p-0 flex flex-col" side="right">
        <div className="flex-1 overflow-hidden flex flex-col">
          <PMSTobiAssistant
            propertyName={propertyName}
            isPortfolio={isPortfolio}
            portfolioPropertyIds={portfolioPropertyIds}
            portfolioName={portfolioName}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
