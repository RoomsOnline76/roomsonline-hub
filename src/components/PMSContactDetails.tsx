import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Phone, Mail, Save, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PMSContactDetailsProps {
  systemType: string;
  initialData?: {
    contact_name?: string | null;
    contact_tel?: string | null;
    contact_email?: string | null;
  };
  onUpdated?: () => void;
}

const PMSContactDetails = ({ systemType, initialData, onUpdated }: PMSContactDetailsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  const [contactName, setContactName] = useState(initialData?.contact_name || "");
  const [contactTel, setContactTel] = useState(initialData?.contact_tel || "");
  const [contactEmail, setContactEmail] = useState(initialData?.contact_email || "");

  useEffect(() => {
    setContactName(initialData?.contact_name || "");
    setContactTel(initialData?.contact_tel || "");
    setContactEmail(initialData?.contact_email || "");
    setHasChanges(false);
  }, [initialData]);

  const handleChange = (setter: (val: string) => void, value: string) => {
    setter(value);
    setHasChanges(true);
  };

  const saveContact = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("pms_tracker_status")
        .update({
          contact_name: contactName || null,
          contact_tel: contactTel || null,
          contact_email: contactEmail || null,
          updated_at: new Date().toISOString(),
        })
        .eq("system_type", systemType);

      if (error) throw error;

      toast({
        title: "Contact saved",
        description: "PMS IT contact details have been updated",
      });
      setHasChanges(false);
      onUpdated?.();
    } catch (error: any) {
      console.error("Error saving contact:", error);
      toast({
        title: "Error saving contact",
        description: error.message || "Failed to save contact details",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasContactInfo = contactName || contactTel || contactEmail;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 p-0 h-auto text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <User className="h-3.5 w-3.5" />
          PMS IT Contact
          {hasContactInfo && !isOpen && (
            <span className="text-xs text-foreground/70 font-normal ml-1">
              ({contactName || contactEmail || "configured"})
            </span>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <div className="grid gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Label htmlFor={`${systemType}-contact-name`} className="text-xs text-muted-foreground">
                Name
              </Label>
              <Input
                id={`${systemType}-contact-name`}
                value={contactName}
                onChange={(e) => handleChange(setContactName, e.target.value)}
                placeholder="Contact person name"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Label htmlFor={`${systemType}-contact-tel`} className="text-xs text-muted-foreground">
                Telephone
              </Label>
              <Input
                id={`${systemType}-contact-tel`}
                value={contactTel}
                onChange={(e) => handleChange(setContactTel, e.target.value)}
                placeholder="Contact telephone"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Label htmlFor={`${systemType}-contact-email`} className="text-xs text-muted-foreground">
                Email
              </Label>
              <Input
                id={`${systemType}-contact-email`}
                type="email"
                value={contactEmail}
                onChange={(e) => handleChange(setContactEmail, e.target.value)}
                placeholder="Contact email"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {hasChanges && (
            <Button
              size="sm"
              onClick={saveContact}
              disabled={isSaving}
              className="w-full gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Contact
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default PMSContactDetails;
