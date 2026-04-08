import { useState, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Plus, Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NoteLogEntry {
  id: string;
  note_content: string;
  created_at: string;
  created_by_name: string | null;
  created_by_email: string | null;
}

interface PMSDevNotesProps {
  systemType: string;
}

const PMSDevNotes = ({ systemType }: PMSDevNotesProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notesLog, setNotesLog] = useState<NoteLogEntry[]>([]);

  const fetchNotesLog = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pms_dev_notes_log')
        .select('id, note_content, created_at, created_by_name, created_by_email')
        .eq('system_type', systemType)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotesLog(data || []);
    } catch (error) {
      console.error('Error fetching notes log:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotesLog();
    }
  }, [isOpen, systemType]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    
    setIsSaving(true);
    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get user profile for name
      let userName = 'Unknown';
      let userEmail = user?.email || '';
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          userName = profile.full_name || profile.email || 'Unknown';
          userEmail = profile.email;
        }
      }

      const { error } = await supabase
        .from('pms_dev_notes_log')
        .insert({
          system_type: systemType,
          note_content: newNote.trim(),
          created_by: user?.id,
          created_by_name: userName,
          created_by_email: userEmail
        });

      if (error) throw error;

      toast.success("Note added");
      setNewNote("");
      fetchNotesLog();
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error("Failed to add note");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d, yyyy 'at' HH:mm");
    } catch {
      return dateStr;
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
          <MessageSquare className="h-4 w-4" />
          Dev Notes Log
          {notesLog.length > 0 && !isOpen && (
            <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">
              {notesLog.length} {notesLog.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        {/* Add new note */}
        <div className="space-y-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a new note..."
            className="min-h-[80px] text-sm"
          />
          <div className="flex justify-end">
            <Button 
              size="sm" 
              onClick={addNote} 
              disabled={isSaving || !newNote.trim()}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add Note
            </Button>
          </div>
        </div>

        {/* Notes history */}
        <div className="border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Notes History ({notesLog.length})
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : notesLog.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No notes yet</p>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-3 pr-3">
                {notesLog.map((entry) => (
                  <div 
                    key={entry.id} 
                    className="bg-muted/50 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span className="font-medium">
                        {entry.created_by_name || 'Unknown'}
                      </span>
                      {entry.created_by_email && (
                        <span className="text-muted-foreground/70">
                          &lt;{entry.created_by_email}&gt;
                        </span>
                      )}
                      <span className="ml-auto">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground">
                      {entry.note_content}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default PMSDevNotes;
