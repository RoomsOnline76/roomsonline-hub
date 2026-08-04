import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import RichTextEditor from "@/components/RichTextEditor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Loader2, Save, Sparkles, Trash2, Image } from "lucide-react";
import { cn } from "@/lib/utils";

interface Journal {
  id: string;
  title: string;
  slug: string | null;
  content: string | null;
  excerpt: string | null;
  featured_image_url: string | null;
  header_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  status: string;
  publish_date: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function JournalEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = id === "new";
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [generatingMeta, setGeneratingMeta] = useState(false);
  const [journal, setJournal] = useState<Partial<Journal>>({
    title: "",
    content: "",
    excerpt: "",
    featured_image_url: "",
    header_image_url: "",
    meta_title: "",
    meta_description: "",
    status: "draft",
    publish_date: null,
  });

  useEffect(() => {
    if (!isNew && id) {
      loadJournal(id);
    }
  }, [id, isNew]);

  const loadJournal = async (journalId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("journals")
      .select("*")
      .eq("id", journalId)
      .single();
    
    if (error) {
      toast.error("Failed to load journal");
      navigate("/admin/journals");
      return;
    }
    
    setJournal(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!journal.title?.trim()) {
      toast.error("Title is required");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const { data, error } = await supabase
          .from("journals")
          .insert({
            title: journal.title,
            content: journal.content,
            excerpt: journal.excerpt,
            featured_image_url: journal.featured_image_url,
            header_image_url: journal.header_image_url,
            meta_title: journal.meta_title,
            meta_description: journal.meta_description,
            status: journal.status,
            publish_date: journal.publish_date,
            author_id: user?.id,
          })
          .select()
          .single();

        if (error) throw error;
        toast.success("Journal created successfully");
        navigate(`/admin/journals/${data.id}`);
      } else {
        const { error } = await supabase
          .from("journals")
          .update({
            title: journal.title,
            content: journal.content,
            excerpt: journal.excerpt,
            featured_image_url: journal.featured_image_url,
            header_image_url: journal.header_image_url,
            meta_title: journal.meta_title,
            meta_description: journal.meta_description,
            status: journal.status,
            publish_date: journal.publish_date,
          })
          .eq("id", id);

        if (error) throw error;
        toast.success("Journal saved successfully");
      }
    } catch (error) {
      console.error("Error saving journal:", error);
      toast.error("Failed to save journal");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this journal?")) return;
    
    try {
      const { error } = await supabase
        .from("journals")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Journal deleted");
      navigate("/admin/journals");
    } catch (error) {
      console.error("Error deleting journal:", error);
      toast.error("Failed to delete journal");
    }
  };

  const generateMetaWithAI = async () => {
    if (!journal.title || !journal.content) {
      toast.error("Please add a title and content first");
      return;
    }

    setGeneratingMeta(true);
    try {
      const response = await supabase.functions.invoke("editorial-ai-assist", {
        body: {
          action: "generate_journal_meta",
          title: journal.title,
          content: journal.content?.substring(0, 2000),
        },
      });

      if (response.error) throw response.error;

      const { meta_title, meta_description } = response.data;
      setJournal(prev => ({
        ...prev,
        meta_title: meta_title || prev.meta_title,
        meta_description: meta_description || prev.meta_description,
      }));
      toast.success("Meta fields generated");
    } catch (error) {
      console.error("Error generating meta:", error);
      toast.error("Failed to generate meta fields");
    } finally {
      setGeneratingMeta(false);
    }
  };

  const handleImageUpload = async (file: File, field: "featured_image_url" | "header_image_url") => {
    const fileName = `journal-${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from("property-images")
      .upload(`journals/${fileName}`, file);

    if (error) {
      toast.error("Failed to upload image");
      return;
    }

    const { data: urlData } = supabase.storage
      .from("property-images")
      .getPublicUrl(`journals/${fileName}`);

    setJournal(prev => ({ ...prev, [field]: urlData.publicUrl }));
    toast.success("Image uploaded");
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader 
        title={isNew ? "New Journal" : "Edit Journal"}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/journals")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {!isNew && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={journal.title || ""}
              onChange={(e) => setJournal(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter journal title..."
              className="text-lg"
            />
          </div>

          {/* Header Image */}
          <div className="space-y-2">
            <Label>Header Image</Label>
            <div className="border border-dashed border-border rounded-lg p-4">
              {journal.header_image_url ? (
                <div className="relative">
                  <img 
                    src={journal.header_image_url} 
                    alt="Header" 
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => setJournal(prev => ({ ...prev, header_image_url: "" }))}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-32 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg">
                  <Image className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload header image</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, "header_image_url");
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Content Editor */}
          <div className="space-y-2">
            <Label>Content</Label>
            <RichTextEditor
              content={journal.content || ""}
              onChange={(content) => setJournal(prev => ({ ...prev, content }))}
            />
          </div>

          {/* Excerpt */}
          <div className="space-y-2">
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea
              id="excerpt"
              value={journal.excerpt || ""}
              onChange={(e) => setJournal(prev => ({ ...prev, excerpt: e.target.value }))}
              placeholder="Brief summary for listings..."
              rows={3}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Publish Settings */}
          <div className="border border-border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">Publish Settings</h3>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="published">Published</Label>
              <Switch
                id="published"
                checked={journal.status === "published"}
                onCheckedChange={(checked) => 
                  setJournal(prev => ({ ...prev, status: checked ? "published" : "draft" }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Publish Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !journal.publish_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {journal.publish_date 
                      ? format(new Date(journal.publish_date), "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={journal.publish_date ? new Date(journal.publish_date) : undefined}
                    onSelect={(date) => 
                      setJournal(prev => ({ ...prev, publish_date: date?.toISOString() || null }))
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Featured Image */}
          <div className="border border-border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">Featured Image</h3>
            {journal.featured_image_url ? (
              <div className="relative">
                <img 
                  src={journal.featured_image_url} 
                  alt="Featured" 
                  className="w-full h-32 object-cover rounded-lg"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => setJournal(prev => ({ ...prev, featured_image_url: "" }))}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-24 cursor-pointer border border-dashed border-border rounded-lg hover:bg-muted/50 transition-colors">
                <Image className="h-6 w-6 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Upload featured image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file, "featured_image_url");
                  }}
                />
              </label>
            )}
          </div>

          {/* SEO Settings */}
          <div className="border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">SEO</h3>
              <Button 
                variant="outline" 
                size="sm"
                onClick={generateMetaWithAI}
                disabled={generatingMeta}
              >
                {generatingMeta ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                TOBI Generate
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta_title">Meta Title</Label>
              <Input
                id="meta_title"
                value={journal.meta_title || ""}
                onChange={(e) => setJournal(prev => ({ ...prev, meta_title: e.target.value }))}
                placeholder="SEO title..."
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                {(journal.meta_title?.length || 0)}/60 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta_description">Meta Description</Label>
              <Textarea
                id="meta_description"
                value={journal.meta_description || ""}
                onChange={(e) => setJournal(prev => ({ ...prev, meta_description: e.target.value }))}
                placeholder="SEO description..."
                rows={3}
                maxLength={160}
              />
              <p className="text-xs text-muted-foreground">
                {(journal.meta_description?.length || 0)}/160 characters
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
