import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Trash2, Eye } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpMarkdownRenderer } from "@/components/help/HelpMarkdownRenderer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface HelpArticle {
  id: string;
  title: string;
  slug: string;
  section: string;
  content_markdown: string;
  role_target: string[];
  sort_order: number;
  related_table: string | null;
  related_field: string | null;
  impact_level: "critical" | "warning" | "info" | null;
  is_published: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

const SECTIONS = [
  { value: "getting_started", label: "Getting Started" },
  { value: "booking_categories", label: "Booking Categories" },
  { value: "availability_pricing", label: "Availability & Pricing" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "common_mistakes", label: "Common Mistakes" },
  { value: "architecture", label: "Architecture" },
  { value: "roles_permissions", label: "Roles & Permissions" },
  { value: "data_authority", label: "Data Authority" },
  { value: "booking_flow", label: "Booking Flow" },
  { value: "debugging", label: "Debugging" },
];

const IMPACT_LEVELS = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

const RELATED_TABLES = [
  { value: "", label: "None" },
  { value: "properties", label: "Properties" },
  { value: "bookings", label: "Bookings" },
  { value: "pms_credentials", label: "PMS Credentials" },
  { value: "property_rates", label: "Property Rates" },
  { value: "property_availability", label: "Property Availability" },
];

export default function HelpArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new";
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("edit");
  const [article, setArticle] = useState<Partial<HelpArticle>>({
    title: "",
    slug: "",
    section: "getting_started",
    content_markdown: "",
    role_target: ["user"],
    sort_order: 0,
    related_table: null,
    related_field: null,
    impact_level: "info",
    is_published: false,
  });

  useEffect(() => {
    if (!isNew && id) {
      loadArticle(id);
    }
  }, [id, isNew]);

  const loadArticle = async (articleId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("help_articles")
      .select("*")
      .eq("id", articleId)
      .single();
    
    if (error) {
      toast.error("Failed to load article");
      navigate("/admin/help-articles");
      return;
    }
    
    setArticle(data);
    setLoading(false);
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleTitleChange = (title: string) => {
    setArticle(prev => ({
      ...prev,
      title,
      slug: isNew ? generateSlug(title) : prev.slug,
    }));
  };

  const handleRoleToggle = (role: string, checked: boolean) => {
    setArticle(prev => {
      const currentRoles = prev.role_target || [];
      if (checked) {
        return { ...prev, role_target: [...currentRoles, role] };
      } else {
        return { ...prev, role_target: currentRoles.filter(r => r !== role) };
      }
    });
  };

  const handleSave = async () => {
    if (!article.title?.trim()) {
      toast.error("Title is required");
      return;
    }

    if (!article.slug?.trim()) {
      toast.error("Slug is required");
      return;
    }

    if (!article.content_markdown?.trim()) {
      toast.error("Content is required");
      return;
    }

    if (!article.role_target?.length) {
      toast.error("At least one audience must be selected");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const { data, error } = await supabase
          .from("help_articles")
          .insert({
            title: article.title,
            slug: article.slug,
            section: article.section,
            content_markdown: article.content_markdown,
            role_target: article.role_target,
            sort_order: article.sort_order || 0,
            related_table: article.related_table || null,
            related_field: article.related_field || null,
            impact_level: article.impact_level,
            is_published: article.is_published,
          })
          .select()
          .single();

        if (error) throw error;
        toast.success("Article created successfully");
        navigate(`/admin/help-articles/${data.id}`);
      } else {
        const { error } = await supabase
          .from("help_articles")
          .update({
            title: article.title,
            slug: article.slug,
            section: article.section,
            content_markdown: article.content_markdown,
            role_target: article.role_target,
            sort_order: article.sort_order || 0,
            related_table: article.related_table || null,
            related_field: article.related_field || null,
            impact_level: article.impact_level,
            is_published: article.is_published,
          })
          .eq("id", id);

        if (error) throw error;
        toast.success("Article saved successfully");
      }
    } catch (error: any) {
      console.error("Error saving article:", error);
      if (error.code === "23505") {
        toast.error("An article with this slug already exists");
      } else {
        toast.error("Failed to save article");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this article?")) return;
    
    try {
      const { error } = await supabase
        .from("help_articles")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Article deleted");
      navigate("/admin/help-articles");
    } catch (error) {
      console.error("Error deleting article:", error);
      toast.error("Failed to delete article");
    }
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
        title={isNew ? "New Help Article" : "Edit Help Article"}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/help-articles")}>
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
          {/* Title & Slug */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={article.title || ""}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter article title..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={article.slug || ""}
                onChange={(e) => setArticle(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="article-slug"
              />
            </div>
          </div>

          {/* Content Editor with Preview */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-2">
              <Label>Content (Markdown)</Label>
              <TabsList>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="edit" className="mt-0">
              <Textarea
                value={article.content_markdown || ""}
                onChange={(e) => setArticle(prev => ({ ...prev, content_markdown: e.target.value }))}
                placeholder={`## What This Setting Controls

Explain the setting in simple terms...

## What Guests Will See

Describe the impact on the booking page...

:::warning
Important warning about this setting
:::

## Who Controls This?

Explain data authority (PMS vs ROL)...`}
                className="min-h-[400px] font-mono text-sm"
              />
            </TabsContent>
            <TabsContent value="preview" className="mt-0">
              <div className="border border-border rounded-lg p-4 min-h-[400px] bg-muted/30">
                {article.content_markdown ? (
                  <HelpMarkdownRenderer content={article.content_markdown} />
                ) : (
                  <p className="text-muted-foreground italic">No content to preview</p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Markdown Help */}
          <div className="text-sm text-muted-foreground border border-border rounded-lg p-4 bg-muted/30">
            <p className="font-medium mb-2">Markdown Syntax:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><code>## Heading</code> - Section heading</div>
              <div><code>**bold**</code> - Bold text</div>
              <div><code>*italic*</code> - Italic text</div>
              <div><code>`code`</code> - Inline code</div>
              <div><code>:::critical</code> - Critical callout</div>
              <div><code>:::warning</code> - Warning callout</div>
              <div><code>:::info</code> - Info callout</div>
              <div><code>- item</code> - Bullet list</div>
            </div>
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
                checked={article.is_published || false}
                onCheckedChange={(checked) => 
                  setArticle(prev => ({ ...prev, is_published: checked }))
                }
              />
            </div>

            {!isNew && (
              <div className="text-sm text-muted-foreground">
                <p>Views: {article.view_count || 0}</p>
              </div>
            )}
          </div>

          {/* Audience */}
          <div className="border border-border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">Target Audience</h3>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="role-user"
                  checked={article.role_target?.includes("user") || false}
                  onCheckedChange={(checked) => handleRoleToggle("user", !!checked)}
                />
                <Label htmlFor="role-user" className="font-normal">
                  Owners (Property Users)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="role-admin"
                  checked={article.role_target?.includes("admin") || false}
                  onCheckedChange={(checked) => handleRoleToggle("admin", !!checked)}
                />
                <Label htmlFor="role-admin" className="font-normal">
                  Admins
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="role-dev"
                  checked={article.role_target?.includes("dev") || false}
                  onCheckedChange={(checked) => handleRoleToggle("dev", !!checked)}
                />
                <Label htmlFor="role-dev" className="font-normal">
                  Developers
                </Label>
              </div>
            </div>
          </div>

          {/* Section & Order */}
          <div className="border border-border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">Organization</h3>
            
            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={article.section || "getting_started"}
                onValueChange={(value) => setArticle(prev => ({ ...prev, section: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map(section => (
                    <SelectItem key={section.value} value={section.value}>
                      {section.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                type="number"
                value={article.sort_order || 0}
                onChange={(e) => setArticle(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>

          {/* Impact Level */}
          <div className="border border-border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">Impact Level</h3>
            
            <Select
              value={article.impact_level || "info"}
              onValueChange={(value: "critical" | "warning" | "info") => 
                setArticle(prev => ({ ...prev, impact_level: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPACT_LEVELS.map(level => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Critical articles show red badges, warnings show amber.
            </p>
          </div>

          {/* Contextual Help Settings */}
          <div className="border border-border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">Contextual Help</h3>
            <p className="text-xs text-muted-foreground">
              Link this article to a specific form field for inline help tooltips.
            </p>
            
            <div className="space-y-2">
              <Label>Related Table</Label>
              <Select
                value={article.related_table || ""}
                onValueChange={(value) => setArticle(prev => ({ 
                  ...prev, 
                  related_table: value || null 
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select table..." />
                </SelectTrigger>
                <SelectContent>
                  {RELATED_TABLES.map(table => (
                    <SelectItem key={table.value || "none"} value={table.value}>
                      {table.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {article.related_table && (
              <div className="space-y-2">
                <Label htmlFor="related_field">Related Field</Label>
                <Input
                  id="related_field"
                  value={article.related_field || ""}
                  onChange={(e) => setArticle(prev => ({ ...prev, related_field: e.target.value || null }))}
                  placeholder="e.g., booking_categories"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
