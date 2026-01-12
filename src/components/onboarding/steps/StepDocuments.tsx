import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUp, Trash2, FileText, Loader2, Download } from "lucide-react";
import { StepProps } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PropertyDocument } from "@/config/onboardingFieldSchema";

const DOCUMENT_TYPES = [
  { value: "rate_sheet", label: "Rate Sheet" },
  { value: "license", label: "Business License" },
  { value: "insurance", label: "Insurance Certificate" },
  { value: "policy", label: "Policy Document" },
  { value: "other", label: "Other" }
];

const ACCEPTED_FORMATS = ".pdf,.xls,.xlsx,.doc,.docx";

export function StepDocuments({
  propertyData,
  updateField,
  getAmenityValue
}: StepProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("rate_sheet");

  const documents = getAmenityValue<PropertyDocument[]>("documents", []);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `${propertyData.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("property-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("property-documents")
        .getPublicUrl(fileName);

      const newDoc: PropertyDocument = {
        url: publicUrl,
        name: file.name,
        type: selectedType as PropertyDocument["type"],
        uploaded_at: new Date().toISOString(),
        file_size: file.size
      };

      updateField("amenities.documents", [...documents, newDoc]);
      toast({ title: "Document uploaded", description: file.name });
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }, [propertyData.id, documents, selectedType, updateField, toast]);

  const handleDelete = useCallback((index: number) => {
    const newDocs = documents.filter((_, i) => i !== index);
    updateField("amenities.documents", newDocs);
    toast({ title: "Document removed" });
  }, [documents, updateField, toast]);

  const rateSheet = documents.find(d => d.type === "rate_sheet");

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Upload your rate sheet and any supporting documents like licenses or insurance certificates.
      </p>

      {/* Rate Sheet Highlight */}
      <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Rate Sheet {rateSheet ? "✓" : "(Recommended)"}</h3>
        </div>
        {rateSheet ? (
          <div className="flex items-center justify-between bg-background rounded p-3">
            <span className="text-sm truncate">{rateSheet.name}</span>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(documents.indexOf(rateSheet))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <label className="cursor-pointer">
            <input type="file" accept={ACCEPTED_FORMATS} onChange={(e) => { setSelectedType("rate_sheet"); handleUpload(e); }} className="hidden" />
            <div className="text-center text-sm text-muted-foreground">
              <FileUp className="h-8 w-8 mx-auto mb-2 text-primary" />
              Click to upload rate sheet (PDF, XLS, XLSX)
            </div>
          </label>
        )}
      </div>

      {/* Other Documents */}
      <div className="space-y-4">
        <h3 className="font-medium">Other Documents</h3>
        <div className="flex gap-2">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <label>
            <input type="file" accept={ACCEPTED_FORMATS} onChange={handleUpload} className="hidden" disabled={isUploading} />
            <Button variant="outline" disabled={isUploading} asChild>
              <span>{isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}Upload</span>
            </Button>
          </label>
        </div>

        {documents.length > 0 && (
          <div className="space-y-2">
            {documents.map((doc, i) => (
              <div key={i} className="flex items-center justify-between rounded border p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium truncate max-w-[200px]">{doc.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{doc.type.replace("_", " ")}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" asChild><a href={doc.url} target="_blank"><Download className="h-4 w-4" /></a></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
