import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useGenerateEmailContent } from "@/hooks/usePmsMessaging";

interface EmailAIWriterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string | null;
  triggerEvent: string;
  onGenerated: (subject: string, bodyHtml: string) => void;
  defaultTone?: string;
}

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly & Warm" },
  { value: "friendly and informative", label: "Friendly & Informative" },
  { value: "formal", label: "Professional & Formal" },
  { value: "professional", label: "Professional" },
  { value: "luxury", label: "Luxury & Elegant" },
  { value: "casual", label: "Casual & Relaxed" },
  { value: "warm and welcoming", label: "Warm & Welcoming" },
  { value: "adventurous", label: "Adventurous" },
];

export function EmailAIWriter({ open, onOpenChange, propertyId, triggerEvent, onGenerated }: EmailAIWriterProps) {
  const [tone, setTone] = useState("friendly");
  const [customPrompt, setCustomPrompt] = useState("");
  const generateContent = useGenerateEmailContent(propertyId);

  const handleGenerate = async () => {
    try {
      const result = await generateContent.mutateAsync({
        trigger_event: triggerEvent,
        tone,
        custom_prompt: customPrompt || undefined,
      });
      if (result?.subject && result?.body_html) {
        onGenerated(result.subject, result.body_html);
        onOpenChange(false);
        toast.success("AI content generated — review and edit as needed");
      } else {
        toast.error("AI did not return valid content");
      }
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to generate content");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate with AI
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Additional Instructions (optional)</Label>
            <Textarea
              rows={3}
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="e.g. Mention our spa facilities, include check-in instructions..."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The AI will use your property details, branding, and the selected trigger event to generate a personalised email template with placeholders.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={generateContent.isPending}>
            {generateContent.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> Generate</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
