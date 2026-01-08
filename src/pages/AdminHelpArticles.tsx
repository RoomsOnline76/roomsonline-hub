import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Plus, Loader2, HelpCircle, Search, Eye, ThumbsUp, AlertTriangle, AlertCircle, Info } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HelpArticle {
  id: string;
  title: string;
  slug: string;
  section: string;
  role_target: string[];
  impact_level: "critical" | "warning" | "info" | null;
  is_published: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

interface HelpStats {
  total: number;
  published: number;
  owner: number;
  admin: number;
  totalViews: number;
}

const SECTION_LABELS: Record<string, string> = {
  getting_started: "Getting Started",
  booking_categories: "Booking Categories",
  availability_pricing: "Availability & Pricing",
  troubleshooting: "Troubleshooting",
  common_mistakes: "Common Mistakes",
  architecture: "Architecture",
  roles_permissions: "Roles & Permissions",
  data_authority: "Data Authority",
  booking_flow: "Booking Flow",
  debugging: "Debugging",
};

const getImpactIcon = (level: string | null) => {
  switch (level) {
    case "critical":
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case "warning":
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    case "info":
      return <Info className="h-4 w-4 text-blue-500" />;
    default:
      return null;
  }
};

export default function AdminHelpArticles() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [stats, setStats] = useState<HelpStats>({
    total: 0,
    published: 0,
    owner: 0,
    admin: 0,
    totalViews: 0,
  });

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("help_articles")
      .select("id, title, slug, section, role_target, impact_level, is_published, view_count, created_at, updated_at")
      .order("section", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error loading help articles:", error);
    } else {
      setArticles(data || []);
      
      // Calculate stats
      const total = data?.length || 0;
      const published = data?.filter(a => a.is_published).length || 0;
      const owner = data?.filter(a => a.role_target.includes("user")).length || 0;
      const admin = data?.filter(a => a.role_target.includes("admin") || a.role_target.includes("dev")).length || 0;
      const totalViews = data?.reduce((sum, a) => sum + (a.view_count || 0), 0) || 0;
      
      setStats({ total, published, owner, admin, totalViews });
    }
    setLoading(false);
  };

  const filteredArticles = articles.filter(article => {
    const matchesSearch = searchQuery === "" || 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.section.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSection = sectionFilter === "all" || article.section === sectionFilter;
    
    const matchesRole = roleFilter === "all" || 
      (roleFilter === "owner" && article.role_target.includes("user")) ||
      (roleFilter === "admin" && (article.role_target.includes("admin") || article.role_target.includes("dev")));
    
    return matchesSearch && matchesSection && matchesRole;
  });

  const uniqueSections = [...new Set(articles.map(a => a.section))];

  return (
    <AppLayout>
      <PageHeader 
        title="Help Articles" 
        subtitle={`${stats.published} published · ${stats.totalViews} total views`}
        actions={
          <Button onClick={() => navigate("/admin/help-articles/new")}>
            <Plus className="h-4 w-4 mr-2" />
            New Article
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Owner Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.owner}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Admin Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.admin}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-muted-foreground" />
              {stats.totalViews}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {uniqueSections.map(section => (
              <SelectItem key={section} value={section}>
                {SECTION_LABELS[section] || section}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Audiences</SelectItem>
            <SelectItem value="owner">Owners Only</SelectItem>
            <SelectItem value="admin">Admins/Devs Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center">
          <HelpCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {articles.length === 0 ? "No help articles yet" : "No matching articles"}
          </h3>
          <p className="text-muted-foreground mb-4">
            {articles.length === 0 
              ? "Create your first help article to get started."
              : "Try adjusting your search or filters."}
          </p>
          {articles.length === 0 && (
            <Button onClick={() => navigate("/admin/help-articles/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Create Article
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Views</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredArticles.map((article) => (
                <TableRow 
                  key={article.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/admin/help-articles/${article.id}`)}
                >
                  <TableCell className="font-medium">{article.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {SECTION_LABELS[article.section] || article.section}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {article.role_target.includes("user") && (
                        <Badge variant="secondary" className="text-xs">Owner</Badge>
                      )}
                      {(article.role_target.includes("admin") || article.role_target.includes("dev")) && (
                        <Badge variant="secondary" className="text-xs">Admin</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {getImpactIcon(article.impact_level)}
                      <span className="text-sm capitalize">{article.impact_level || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={article.is_published ? "default" : "secondary"}>
                      {article.is_published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {article.view_count || 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppLayout>
  );
}
