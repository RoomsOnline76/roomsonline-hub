import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Info, Compass, Loader2, Sparkles, Upload, Video, X, Layers, Globe } from "lucide-react";
import { CollectionsManager, type Collection } from "./CollectionsManager";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EDITORIAL_RATING_CONFIG } from "@/components/EditorialRatingBadge";

// Get editorial ratings from shared config
const EDITORIAL_RATINGS = Object.entries(EDITORIAL_RATING_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
  helpText: config.description,
  Icon: config.Icon,
  iconColor: config.iconColor,
  bgColor: config.bgColor,
}));

// Navigation tags organized for multi-column layout
const NAVIGATION_TAGS = [
  "New",
  "Bucket-List",
  "City",
  "Buzzing",
  "Beach",
  "Barefoot Luxury",
  "Mountain",
  "Epic",
  "History",
  "Uncharted",
  "Offbeat",
  "Hidden Gem",
  "Honeymoon",
  "Couples' Playground",
  "Well-Being",
  "Transformative",
  "Gastronomy",
  "Foodie Pilgrimage",
  "Country Side",
  "Rustic Chic",
  "Sustainable",
  "Eco-Conscious",
  "Arts & Culture",
  "Bohemian",
  "Interior Design",
  "Design Mecca",
  "Adults Only",
  "Glamorous",
  "Family Friendly",
  "Multi-Generational",
  "Secluded Escape",
  "Off-The-Grid",
  "Wow-Factor",
  "Viral-Worthy",
  "Design-Forward",
  "Urban Icon",
  "Secluded",
  "Landscape-Led",
  "Dramatic",
  "Central But Calm",
  "Oasis Of Calm"
];

interface ROLSpecData {
  hero_listing: boolean;
  hero_video_url: string;
  editorial_rating: string;
  why_we_chose_this_place: string;
  who_this_suits: string;
  what_its_really_like: string;
  why_this_place_matters: string;
  who_its_not_for: string;
  owner_notes: string;
  navigation_tags: string[];
  collections?: Collection[];
}

interface PropertyContext {
  name: string;
  property_type: string;
  property_url?: string;
  property_id?: string;
  star_rating: number;
  description?: string;
  country: string;
  city: string;
  suburb?: string;
  restaurants_cafes?: string;
  public_transport?: string;
  closest_airport?: string;
  pets_allowed?: boolean;
  children_allowed?: boolean;
  smoking_allowed?: boolean;
  check_in_from?: string;
  check_out_to?: string;
  facilities: string[];
  rooms: Array<{
    name: string;
    description?: string;
    maxPeople: number;
    bedConfiguration?: string;
  }>;
}

interface ROLSpecTabProps {
  data: ROLSpecData;
  onChange: (data: ROLSpecData) => void;
  propertyContext: PropertyContext;
  onDirty: () => void;
}

export function ROLSpecTab({ data, onChange, propertyContext, onDirty }: ROLSpecTabProps) {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState("details");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  const updateField = <K extends keyof ROLSpecData>(field: K, value: ROLSpecData[K]) => {
    onChange({ ...data, [field]: value });
    onDirty();
  };

  const toggleNavigationTag = (tag: string) => {
    const currentTags = data.navigation_tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    updateField("navigation_tags", newTags);
  };

  const handleVideoUpload = async (file: File) => {
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file (MP4, WebM, etc.)",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Maximum file size is 100MB",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingVideo(true);
    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('hero-videos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('hero-videos')
        .getPublicUrl(uploadData.path);

      updateField("hero_video_url", urlData.publicUrl);
      
      toast({
        title: "Video uploaded",
        description: "Hero video has been uploaded successfully"
      });
    } catch (error) {
      console.error("Video upload error:", error);
      toast({
        title: "Upload failed",
        description: "Could not upload video. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleAIAssist = async () => {
    if (!propertyContext.name) {
      toast({
        title: "Property name required",
        description: "Please enter a property name before using AI assistance",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("editorial-ai-assist", {
        body: {
          propertyContext,
          editorialRating: data.editorial_rating,
          existingContent: {
            why_we_chose_this_place: data.why_we_chose_this_place,
            who_this_suits: data.who_this_suits,
            what_its_really_like: data.what_its_really_like,
            why_this_place_matters: data.why_this_place_matters,
            who_its_not_for: data.who_its_not_for
          }
        }
      });

      if (error) throw error;

      // Update fields with AI-generated content
      if (response?.suggestions) {
        const updates: Partial<ROLSpecData> = {};
        if (response.suggestions.why_we_chose_this_place && !data.why_we_chose_this_place) {
          updates.why_we_chose_this_place = response.suggestions.why_we_chose_this_place;
        }
        if (response.suggestions.who_this_suits && !data.who_this_suits) {
          updates.who_this_suits = response.suggestions.who_this_suits;
        }
        if (response.suggestions.what_its_really_like && !data.what_its_really_like) {
          updates.what_its_really_like = response.suggestions.what_its_really_like;
        }
        if (response.suggestions.why_this_place_matters && !data.why_this_place_matters) {
          updates.why_this_place_matters = response.suggestions.why_this_place_matters;
        }
        if (response.suggestions.who_its_not_for && !data.who_its_not_for) {
          updates.who_its_not_for = response.suggestions.who_its_not_for;
        }

        if (Object.keys(updates).length > 0) {
          onChange({ ...data, ...updates });
          onDirty();
          toast({
            title: "Content generated",
            description: `Generated ${Object.keys(updates).length} field(s). Review and edit as needed.`
          });
        } else {
          toast({
            title: "No empty fields",
            description: "AI only fills empty fields. Clear a field to regenerate its content."
          });
        }
      }
    } catch (error) {
      console.error("AI assist error:", error);
      toast({
        title: "AI generation failed",
        description: "Could not generate content. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedRating = EDITORIAL_RATINGS.find(r => r.value === data.editorial_rating);

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="bg-primary/10 border border-primary/20">
          <TabsTrigger 
            value="details" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5"
          >
            <Info className="h-3.5 w-3.5" />
            Details
          </TabsTrigger>
          <TabsTrigger 
            value="navigation" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5"
          >
            <Compass className="h-3.5 w-3.5" />
            Navigation
          </TabsTrigger>
          <TabsTrigger 
            value="collections" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5"
          >
            <Layers className="h-3.5 w-3.5" />
            Collections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4 mt-4">
          {/* Hero Listing & Editorial Rating */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Property Status</CardTitle>
            </CardHeader>
            <CardContent className="py-3 px-4 space-y-4">
              {/* Hero Listing Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="hero-listing" className="text-sm font-medium">Hero Listing</Label>
                  <p className="text-xs text-muted-foreground">
                    Can this property be used in the HERO section of the booking landing page?
                  </p>
                </div>
                <Switch
                  id="hero-listing"
                  checked={data.hero_listing}
                  onCheckedChange={(checked) => updateField("hero_listing", checked)}
                />
              </div>

              {/* Hero Video Upload - Only visible when hero_listing is enabled */}
              {data.hero_listing && (
                <div className="space-y-3 pt-3 border-t border-border/50">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Video className="h-4 w-4 text-primary" />
                      Hero Video
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Upload a video to display in the hero section (optional)
                    </p>
                  </div>
                  
                  {data.hero_video_url ? (
                    <div className="space-y-2">
                      <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
                        <video 
                          src={data.hero_video_url} 
                          className="w-full h-32 object-cover"
                          controls
                          muted
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7"
                          onClick={() => updateField("hero_video_url", "")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {data.hero_video_url}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* File Upload Area */}
                      <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleVideoUpload(file);
                          }}
                          disabled={isUploadingVideo}
                        />
                        {isUploadingVideo ? (
                          <>
                            <Loader2 className="h-8 w-8 text-primary mx-auto mb-2 animate-spin" />
                            <p className="text-xs text-primary font-medium">Uploading video...</p>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm font-medium text-foreground mb-1">
                              Click to upload video
                            </p>
                            <p className="text-xs text-muted-foreground">
                              MP4, WebM up to 100MB
                            </p>
                          </>
                        )}
                      </label>
                      
                      {/* Or paste URL */}
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-card px-2 text-muted-foreground">or paste URL</span>
                        </div>
                      </div>
                      
                      <Input
                        type="url"
                        placeholder="https://example.com/video.mp4"
                        value={data.hero_video_url || ""}
                        onChange={(e) => updateField("hero_video_url", e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Editorial Rating */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Editorial Rating</Label>
                <p className="text-xs text-muted-foreground">
                  RoomsOnline editorial rating (ordered by quality tier)
                </p>
                <Select
                  value={data.editorial_rating || ""}
                  onValueChange={(value) => updateField("editorial_rating", value)}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Select a rating...">
                      {data.editorial_rating && (() => {
                        const selected = EDITORIAL_RATINGS.find(r => r.value === data.editorial_rating);
                        if (!selected) return null;
                        const Icon = selected.Icon;
                        return (
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${selected.bgColor}`}>
                              <Icon className={`h-3 w-3 ${selected.iconColor}`} />
                            </div>
                            <span>{selected.label}</span>
                          </div>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {EDITORIAL_RATINGS.map((rating) => {
                      const Icon = rating.Icon;
                      return (
                        <SelectItem key={rating.value} value={rating.value}>
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${rating.bgColor}`}>
                              <Icon className={`h-3 w-3 ${rating.iconColor}`} />
                            </div>
                            <span>{rating.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedRating && (
                  <p className="text-xs text-muted-foreground italic mt-1 p-2 bg-muted/50 rounded">
                    {selectedRating.helpText}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* AI Assist Box */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Editorial Writing Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground mb-3">
                Use AI to generate content for empty editorial fields below. 
                The assistant uses the complete property listing (location, facilities, rooms, policies) as context.
              </p>
              <Button
                type="button"
                onClick={handleAIAssist}
                disabled={isGenerating}
                className="bg-primary hover:bg-primary/90"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Editorial Content
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Editorial Text Fields */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Editorial Content</CardTitle>
            </CardHeader>
            <CardContent className="py-3 px-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="why-we-chose">Why we chose this place?</Label>
                <Textarea
                  id="why-we-chose"
                  value={data.why_we_chose_this_place || ""}
                  onChange={(e) => updateField("why_we_chose_this_place", e.target.value)}
                  placeholder="What makes this property stand out..."
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="who-suits">Who this suits?</Label>
                <Textarea
                  id="who-suits"
                  value={data.who_this_suits || ""}
                  onChange={(e) => updateField("who_this_suits", e.target.value)}
                  placeholder="The ideal guest for this property..."
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="really-like">What is this really like?</Label>
                <Textarea
                  id="really-like"
                  value={data.what_its_really_like || ""}
                  onChange={(e) => updateField("what_its_really_like", e.target.value)}
                  placeholder="An honest description of the experience..."
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="why-matters">Why this place matters?</Label>
                <Textarea
                  id="why-matters"
                  value={data.why_this_place_matters || ""}
                  onChange={(e) => updateField("why_this_place_matters", e.target.value)}
                  placeholder="The significance and impact of this property..."
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="not-for">Who it is not for?</Label>
                <Textarea
                  id="not-for"
                  value={data.who_its_not_for || ""}
                  onChange={(e) => updateField("who_its_not_for", e.target.value)}
                  placeholder="Guests who might not enjoy this property..."
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-notes">Owner Notes</Label>
                <Textarea
                  id="owner-notes"
                  value={data.owner_notes || ""}
                  onChange={(e) => updateField("owner_notes", e.target.value)}
                  placeholder="Internal notes from the property owner..."
                  rows={3}
                  className="text-xs"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="navigation" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Experience & Navigation Tags</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Select tags that describe the property's character and experience. These help guests find the perfect match.
              </p>
            </CardHeader>
            <CardContent className="py-3 px-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {NAVIGATION_TAGS.map((tag) => {
                  const isSelected = (data.navigation_tags || []).includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleNavigationTag(tag)}
                      className={`
                        px-3 py-2 rounded-lg text-xs font-medium transition-all
                        border text-left
                        ${isSelected 
                          ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                          : "bg-background hover:bg-muted border-border hover:border-primary/50"
                        }
                      `}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              {(data.navigation_tags || []).length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Selected Tags ({data.navigation_tags.length})
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {data.navigation_tags.map((tag) => (
                      <Badge 
                        key={tag} 
                        variant="default"
                        className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer"
                        onClick={() => toggleNavigationTag(tag)}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collections" className="mt-4">
          <CollectionsManager
            collections={data.collections || []}
            onChange={(collections) => updateField("collections", collections)}
            onDirty={onDirty}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
