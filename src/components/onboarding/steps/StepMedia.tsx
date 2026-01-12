import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, X, Star, Image as ImageIcon, Loader2 } from "lucide-react";
import { StepProps } from "./types";
import { OnboardingImage } from "@/config/onboardingFieldSchema";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function StepMedia({
  propertyData,
  updateField
}: StepProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const images = (Array.isArray(propertyData.images) ? propertyData.images : []) as unknown as OnboardingImage[];

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const uploadedImages: OnboardingImage[] = [];
    const totalFiles = files.length;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast({
            title: "Invalid file type",
            description: `${file.name} is not an image`,
            variant: "destructive"
          });
          continue;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds 10MB limit`,
            variant: "destructive"
          });
          continue;
        }

        // Generate unique filename
        const ext = file.name.split('.').pop();
        const filename = `${propertyData.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('property-images')
          .upload(filename, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('Upload error:', error);
          toast({
            title: "Upload failed",
            description: `Failed to upload ${file.name}`,
            variant: "destructive"
          });
          continue;
        }

        // Get public URL
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
        toast({
          title: "Upload complete",
          description: `${uploadedImages.length} image${uploadedImages.length !== 1 ? 's' : ''} uploaded`
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [propertyData.id, images, updateField, toast]);

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    updateField("images", updated);
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

  const heroImage = images.find(img => img.type === 'hero');
  const galleryImages = images.filter(img => img.type !== 'hero');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground">
          Upload photos of your property. High-quality images significantly 
          increase booking conversions.
        </p>
        <p className="text-sm text-primary font-medium mt-2">
          {images.length} image{images.length !== 1 ? 's' : ''} uploaded
        </p>
      </div>

      {/* Upload area */}
      <div className="relative">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFileUpload(e.target.files)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          disabled={isUploading}
        />
        <div className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
          isUploading ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary hover:bg-primary/5"
        )}>
          {isUploading ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
              <p className="font-medium">Uploading... {uploadProgress}%</p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">Drop images here or click to upload</p>
              <p className="text-sm text-muted-foreground mt-1">
                PNG, JPG up to 10MB each
              </p>
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
            <img
              src={heroImage.url}
              alt="Hero"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => toggleFavourite(images.indexOf(heroImage))}
                className="h-8 w-8"
              >
                <Star className={cn("h-4 w-4", heroImage.is_favourite && "fill-yellow-500 text-yellow-500")} />
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => removeImage(images.indexOf(heroImage))}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery images */}
      {galleryImages.length > 0 && (
        <div className="space-y-2">
          <Label>Gallery Images</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {galleryImages.map((img, i) => {
              const actualIndex = images.indexOf(img);
              return (
                <div key={actualIndex} className="relative aspect-square rounded-lg overflow-hidden border group">
                  <img
                    src={img.url}
                    alt={`Gallery ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => setAsHero(actualIndex)}
                      className="h-8 w-8"
                      title="Set as hero"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => toggleFavourite(actualIndex)}
                      className="h-8 w-8"
                      title="Toggle favourite"
                    >
                      <Star className={cn("h-4 w-4", img.is_favourite && "fill-yellow-500 text-yellow-500")} />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => removeImage(actualIndex)}
                      className="h-8 w-8"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No images */}
      {images.length === 0 && !isUploading && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium mb-1">No images yet</h3>
          <p className="text-sm text-muted-foreground">
            Upload at least 3 images for the best results
          </p>
        </div>
      )}

      {/* Tips */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="font-medium text-sm mb-2">Image Tips</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Use high-resolution images (1200px+ width)</li>
          <li>• Include exterior, rooms, amenities, and views</li>
          <li>• Show rooms with beds made and good lighting</li>
          <li>• The hero image appears on listing cards</li>
        </ul>
      </div>
    </div>
  );
}
