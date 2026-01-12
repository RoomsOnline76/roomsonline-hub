import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Upload, X, Star, Image as ImageIcon, Loader2, FileUp, Trash2, 
  FileText, Download, ChevronDown 
} from "lucide-react";
import { StepProps } from "./types";
import { OnboardingImage, PropertyDocument } from "@/config/onboardingFieldSchema";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Json } from "@/integrations/supabase/types";

// Normalize image data
const normalizeImages = (imageData: Json | null): OnboardingImage[] => {
  if (!imageData || !Array.isArray(imageData)) return [];
  
  return imageData.map((img, index) => {
    if (typeof img === 'object' && img !== null && 'url' in img) {
      const imgObj = img as Record<string, unknown>;
      return {
        url: String(imgObj.url),
        type: (imgObj.type as 'hero' | 'gallery' | 'room') || (index === 0 ? 'hero' : 'gallery'),
        is_favourite: Boolean(imgObj.is_favourite),
        caption: imgObj.caption ? String(imgObj.caption) : undefined
      } as OnboardingImage;
    }
    if (typeof img === 'string') {
      return { url: img, type: index === 0 ? 'hero' : 'gallery', is_favourite: false } as OnboardingImage;
    }
    return null;
  }).filter((img): img is OnboardingImage => img !== null);
};

const DOCUMENT_TYPES = [
  { value: "rate_sheet", label: "Rate Sheet" },
  { value: "license", label: "Business License" },
  { value: "insurance", label: "Insurance" },
  { value: "policy", label: "Policy Doc" },
  { value: "other", label: "Other" }
];

export function StepMediaDocuments({
  propertyData,
  updateField,
  getAmenityValue
}: StepProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [docUploading, setDocUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("rate_sheet");
  const [openSections, setOpenSections] = useState({ images: true, docs: false });

  const images = normalizeImages(propertyData.images);
  const documents = getAmenityValue<PropertyDocument[]>("documents", []);

  // Image upload handler
  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const uploadedImages: OnboardingImage[] = [];
    const totalFiles = files.length;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: "File too large", description: `${file.name} exceeds 10MB`, variant: "destructive" });
          continue;
        }

        const ext = file.name.split('.').pop();
        const filename = `${propertyData.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

        const { data, error } = await supabase.storage
          .from('property-images')
          .upload(filename, file, { cacheControl: '3600', upsert: false });

        if (error) continue;

        const { data: { publicUrl } } = supabase.storage
          .from('property-images')
          .getPublicUrl(data.path);

        uploadedImages.push({
          url: publicUrl,
          type: images.length === 0 && i === 0 ? 'hero' : 'gallery',
          is_favourite: false
        });

        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      if (uploadedImages.length > 0) {
        updateField("images", [...images, ...uploadedImages]);
        toast({ title: "Upload complete", description: `${uploadedImages.length} image(s) uploaded` });
      }
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [propertyData.id, images, updateField, toast]);

  const removeImage = (index: number) => {
    updateField("images", images.filter((_, i) => i !== index));
  };

  const setAsHero = (index: number) => {
    const updated = images.map((img, i) => ({
      ...img,
      type: i === index ? 'hero' : (img.type === 'hero' ? 'gallery' : img.type)
    })) as OnboardingImage[];
    updateField("images", updated);
  };

  const toggleFavourite = (index: number) => {
    const updated = [...images];
    updated[index] = { ...updated[index], is_favourite: !updated[index].is_favourite };
    updateField("images", updated);
  };

  // Document upload handler
  const handleDocUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
      return;
    }

    setDocUploading(true);
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
      toast({ title: "Document uploaded" });
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setDocUploading(false);
      e.target.value = "";
    }
  }, [propertyData.id, documents, selectedType, updateField, toast]);

  const removeDoc = (index: number) => {
    updateField("amenities.documents", documents.filter((_, i) => i !== index));
  };

  const heroImage = images.find(img => img.type === 'hero');
  const galleryImages = images.filter(img => img.type !== 'hero');
  const rateSheet = documents.find(d => d.type === "rate_sheet");

  return (
    <div className="space-y-4">
      {/* Images Section */}
      <Collapsible open={openSections.images} onOpenChange={() => setOpenSections(prev => ({ ...prev, images: !prev.images }))}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <span className="font-medium">Property Images</span>
            <span className="text-xs text-muted-foreground">({images.length} uploaded)</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.images && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          {/* Upload area */}
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleImageUpload(e.target.files)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={isUploading}
            />
            <div className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
              isUploading ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary"
            )}>
              {isUploading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-sm">Uploading... {uploadProgress}%</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm">Drop images or click to upload</p>
                </>
              )}
            </div>
          </div>

          {/* Hero image */}
          {heroImage && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                Hero Image
              </Label>
              <div className="relative aspect-video rounded-lg overflow-hidden border">
                <img src={heroImage.url} alt="Hero" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button type="button" variant="secondary" size="icon" onClick={() => toggleFavourite(images.indexOf(heroImage))} className="h-7 w-7">
                    <Star className={cn("h-3.5 w-3.5", heroImage.is_favourite && "fill-yellow-500 text-yellow-500")} />
                  </Button>
                  <Button type="button" variant="destructive" size="icon" onClick={() => removeImage(images.indexOf(heroImage))} className="h-7 w-7">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Gallery */}
          {galleryImages.length > 0 && (
            <div className="space-y-2">
              <Label>Gallery</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {galleryImages.map((img, i) => {
                  const actualIndex = images.indexOf(img);
                  return (
                    <div key={actualIndex} className="relative aspect-square rounded-lg overflow-hidden border group">
                      <img src={img.url} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <Button type="button" variant="secondary" size="icon" onClick={() => setAsHero(actualIndex)} className="h-7 w-7" title="Set as hero">
                          <ImageIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="destructive" size="icon" onClick={() => removeImage(actualIndex)} className="h-7 w-7">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {images.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Upload at least 3 images for best results
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Documents Section */}
      <Collapsible open={openSections.docs} onOpenChange={() => setOpenSections(prev => ({ ...prev, docs: !prev.docs }))}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-medium">Documents</span>
            {rateSheet && <span className="text-xs text-green-600">✓ Rate sheet</span>}
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.docs && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          {/* Rate Sheet Highlight */}
          {!rateSheet && (
            <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-4">
              <label className="cursor-pointer">
                <input 
                  type="file" 
                  accept=".pdf,.xls,.xlsx,.doc,.docx" 
                  onChange={(e) => { setSelectedType("rate_sheet"); handleDocUpload(e); }} 
                  className="hidden" 
                />
                <div className="text-center">
                  <FileUp className="h-6 w-6 mx-auto mb-1 text-primary" />
                  <p className="text-sm font-medium">Upload Rate Sheet</p>
                  <p className="text-xs text-muted-foreground">PDF, XLS, XLSX</p>
                </div>
              </label>
            </div>
          )}

          {/* Upload other docs */}
          <div className="flex gap-2">
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <label>
              <input type="file" accept=".pdf,.xls,.xlsx,.doc,.docx" onChange={handleDocUpload} className="hidden" disabled={docUploading} />
              <Button variant="outline" size="sm" disabled={docUploading} asChild className="h-9">
                <span>{docUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4 mr-1" />}Upload</span>
              </Button>
            </label>
          </div>

          {/* Document list */}
          {documents.length > 0 && (
            <div className="space-y-2">
              {documents.map((doc, i) => (
                <div key={i} className="flex items-center justify-between rounded border p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{doc.type.replace("_", " ")}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" asChild className="h-7 w-7">
                      <a href={doc.url} target="_blank"><Download className="h-3.5 w-3.5" /></a>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeDoc(i)} className="h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
