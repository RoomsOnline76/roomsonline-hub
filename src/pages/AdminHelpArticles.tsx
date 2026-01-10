import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2, HelpCircle, Search, Eye, AlertTriangle, AlertCircle, Info, BarChart3, ChevronDown, ChevronUp, Code2, Shield, Users } from "lucide-react";
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
import { HelpAnalyticsDashboard } from "@/components/help/HelpAnalyticsDashboard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  dev: number;
  totalViews: number;
}

const SECTION_LABELS: Record<string, string> = {
  // Admin sections
  getting_started: "Getting Started",
  booking_flow: "Booking Flow",
  roles_permissions: "Roles & Permissions",
  data_authority: "Data Authority & Sync",
  architecture: "System Architecture",
  debugging: "Debugging & Monitoring",
  // Owner sections
  owner_getting_started: "Getting Started",
  booking_categories: "Booking Categories",
  availability_pricing: "Availability & Pricing",
  pms_integration: "How ROL Works with Your PMS",
  property_appearance: "Your Property's Appearance",
  common_mistakes: "Common Mistakes to Avoid",
  troubleshooting: "Troubleshooting",
  support: "Getting Help",
  // Dev sections (auto-generated)
  system_overview: "System Overview",
};

const ADMIN_SECTIONS = [
  "getting_started",
  "booking_flow",
  "roles_permissions",
  "data_authority",
  "architecture",
  "debugging",
];

const OWNER_SECTIONS = [
  "owner_getting_started",
  "booking_categories",
  "availability_pricing",
  "pms_integration",
  "property_appearance",
  "common_mistakes",
  "troubleshooting",
  "support",
];

const DEV_SECTIONS = ["system_overview"];

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

interface ArticleTableProps {
  articles: HelpArticle[];
  onArticleClick: (id: string) => void;
}

function ArticleTable({ articles, onArticleClick }: ArticleTableProps) {
  if (articles.length === 0) return null;

  return (
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
          {articles.map((article) => (
            <TableRow 
              key={article.id} 
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onArticleClick(article.id)}
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
  );
}

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
    dev: 0,
    totalViews: 0,
  });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [adminSectionOpen, setAdminSectionOpen] = useState(true);
  const [ownerSectionOpen, setOwnerSectionOpen] = useState(false);
  const [devSectionOpen, setDevSectionOpen] = useState(false);

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
      const admin = data?.filter(a => a.role_target.includes("admin")).length || 0;
      const dev = data?.filter(a => a.role_target.includes("dev")).length || 0;
      const totalViews = data?.reduce((sum, a) => sum + (a.view_count || 0), 0) || 0;
      
      setStats({ total, published, owner, admin, dev, totalViews });
    }
    setLoading(false);
  };

  const filteredArticles = useMemo(() => {
    return articles.filter(article => {
      const matchesSearch = searchQuery === "" || 
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.section.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSection = sectionFilter === "all" || article.section === sectionFilter;
      
      const matchesRole = roleFilter === "all" || 
        (roleFilter === "owner" && article.role_target.includes("user")) ||
        (roleFilter === "admin" && article.role_target.includes("admin")) ||
        (roleFilter === "dev" && article.role_target.includes("dev"));
      
      return matchesSearch && matchesSection && matchesRole;
    });
  }, [articles, searchQuery, sectionFilter, roleFilter]);

  // Separate articles by category
  const adminArticles = useMemo(() => 
    filteredArticles.filter(a => ADMIN_SECTIONS.includes(a.section)),
    [filteredArticles]
  );

  const ownerArticles = useMemo(() => 
    filteredArticles.filter(a => OWNER_SECTIONS.includes(a.section)),
    [filteredArticles]
  );

  const devArticles = useMemo(() => 
    filteredArticles.filter(a => DEV_SECTIONS.includes(a.section)),
    [filteredArticles]
  );

  const uniqueSections = [...new Set(articles.map(a => a.section))];

  const hasActiveFilters = roleFilter !== "all" || sectionFilter !== "all" || searchQuery !== "";

  return (
    <AppLayout>
      <PageHeader 
        title="Help Articles" 
        subtitle={`${stats.published} published · ${stats.totalViews} total views`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAnalytics(!showAnalytics)}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
              {showAnalytics ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </Button>
            <Button onClick={() => navigate("/admin/help-articles/new")}>
              <Plus className="h-4 w-4 mr-2" />
              New Article
            </Button>
          </div>
        }
      />

      {/* Analytics Dashboard */}
      <Collapsible open={showAnalytics} onOpenChange={setShowAnalytics}>
        <CollapsibleContent className="mb-6">
          <HelpAnalyticsDashboard />
        </CollapsibleContent>
      </Collapsible>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
        <Card 
          className="cursor-pointer hover:bg-secondary/50 transition-colors"
          onClick={() => {
            setRoleFilter("dev");
            setSectionFilter("system_overview");
          }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Code2 className="h-4 w-4" />
              Dev Docs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.dev}</div>
            <p className="text-xs text-muted-foreground">Click to filter</p>
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
            <SelectItem value="admin">Admins Only</SelectItem>
            <SelectItem value="dev">Dev Only</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setRoleFilter("all");
              setSectionFilter("all");
              setSearchQuery("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center">
          <HelpCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No help articles yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first help article to get started.
          </p>
          <Button onClick={() => navigate("/admin/help-articles/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Create Article
          </Button>
        </div>
      ) : hasActiveFilters ? (
        // When filters are active, show flat table
        filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[40vh] text-center">
            <HelpCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No matching articles</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search or filters.
            </p>
          </div>
        ) : (
          <ArticleTable 
            articles={filteredArticles} 
            onArticleClick={(id) => navigate(`/admin/help-articles/${id}`)} 
          />
        )
      ) : (
        // No filters - show grouped view
        <div className="space-y-6">
          {/* Admin & System Articles */}
          <Collapsible open={adminSectionOpen} onOpenChange={setAdminSectionOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-semibold">Admin & System Articles</span>
                <Badge variant="outline" className="ml-2">{adminArticles.length}</Badge>
              </div>
              {adminSectionOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              {adminArticles.length > 0 ? (
                <ArticleTable 
                  articles={adminArticles} 
                  onArticleClick={(id) => navigate(`/admin/help-articles/${id}`)} 
                />
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No admin articles yet
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Owner Articles */}
          <Collapsible open={ownerSectionOpen} onOpenChange={setOwnerSectionOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">Owner Articles</span>
                <Badge variant="outline" className="ml-2">{ownerArticles.length}</Badge>
              </div>
              {ownerSectionOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              {ownerArticles.length > 0 ? (
                <ArticleTable 
                  articles={ownerArticles} 
                  onArticleClick={(id) => navigate(`/admin/help-articles/${id}`)} 
                />
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No owner articles yet
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Dev Docs */}
          {devArticles.length > 0 && (
            <Collapsible open={devSectionOpen} onOpenChange={setDevSectionOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                <div className="flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold">Dev Docs</span>
                  <Badge variant="outline" className="ml-2">{devArticles.length}</Badge>
                </div>
                {devSectionOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <ArticleTable 
                  articles={devArticles} 
                  onArticleClick={(id) => navigate(`/admin/help-articles/${id}`)} 
                />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </AppLayout>
  );
}
