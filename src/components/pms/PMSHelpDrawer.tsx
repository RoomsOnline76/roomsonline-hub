import { useEffect, useState } from "react";
import { Cat, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useHelp } from "@/contexts/HelpContext";
import { PMSTobiAssistant } from "@/components/pms/PMSTobiAssistant";

interface PMSHelpDrawerProps {
  propertyName?: string;
}

export function PMSHelpDrawer({ propertyName }: PMSHelpDrawerProps) {
  const { isOpen, toggleHelp } = useHelp();

  return (
    <Sheet open={isOpen} onOpenChange={toggleHelp}>
      <SheetContent className="w-[400px] sm:w-[440px] p-0 flex flex-col" side="right">
        <div className="flex-1 overflow-hidden flex flex-col">
          <PMSTobiAssistant propertyName={propertyName} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
