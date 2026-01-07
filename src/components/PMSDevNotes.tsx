import { useState, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PMSDevNotesProps {
  systemType: string;
  initialNotes?: string;
  onNotesUpdated?: (notes: string) => void;
}

const PMSDevNotes = ({ systemType, initialNotes = "", onNotesUpdated }: PMSDevNotesProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setNotes(initialNotes);
    setHasChanges(false);
  }, [initialNotes]);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasChanges(value !== initialNotes);
  };

  const saveNotes = async () => {
    if (!hasChanges) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('pms_tracker_status')
        .update({ notes })
        .eq('system_type', systemType);

      if (error) throw error;

      toast.success("Notes saved");
      setHasChanges(false);
      onNotesUpdated?.(notes);
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error("Failed to save notes");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-3">
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Dev Notes
          {notes && !isOpen && (
            <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">
              Has notes
            </span>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        <Textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Add development notes, blockers, or progress updates..."
          className="min-h-[100px] text-sm"
        />
        <div className="flex justify-end gap-2">
          {hasChanges && (
            <Button 
              size="sm" 
              onClick={saveNotes} 
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Notes
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default PMSDevNotes;
