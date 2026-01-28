import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Plus, Loader2, FileText, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Journal {
  id: string;
  title: string;
  status: string;
  publish_date: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminJournals() {
  const navigate = useNavigate();
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadJournals();
  }, []);

  const loadJournals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("journals")
      .select("id, title, status, publish_date, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error loading journals:", error);
    } else {
      setJournals(data || []);
    }
    setLoading(false);
  };

  const publishedCount = journals.filter(j => j.status === "published").length;
  const draftCount = journals.filter(j => j.status !== "published").length;

  // Filter journals by search term across all columns
  const filteredJournals = useMemo(() => {
    if (!searchTerm.trim()) return journals;
    
    const term = searchTerm.toLowerCase();
    return journals.filter(journal => {
      const statusLabel = journal.status === "published" ? "published" : "draft";
      const publishDate = journal.publish_date 
        ? format(new Date(journal.publish_date), "PPP").toLowerCase() 
        : "";
      const updatedDate = format(new Date(journal.updated_at), "PPP").toLowerCase();
      
      return (
        journal.title.toLowerCase().includes(term) ||
        statusLabel.includes(term) ||
        publishDate.includes(term) ||
        updatedDate.includes(term)
      );
    });
  }, [journals, searchTerm]);

  return (
    <AppLayout>
      <PageHeader 
        title="Journals" 
        subtitle={`${publishedCount} published · ${draftCount} drafts`}
        actions={
          <Button onClick={() => navigate("/admin/journals/new")}>
            <Plus className="h-4 w-4 mr-2" />
            New Journal
          </Button>
        }
      />

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search all columns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : journals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No journals yet</h3>
          <p className="text-muted-foreground mb-4">Create your first journal entry to get started.</p>
          <Button onClick={() => navigate("/admin/journals/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Create Journal
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Publish Date</TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJournals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {searchTerm ? "No journals match your search" : "No journals yet"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredJournals.map((journal) => (
                  <TableRow 
                    key={journal.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/journals/${journal.id}`)}
                  >
                    <TableCell className="font-medium">{journal.title}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={journal.status === "published" ? "default" : "secondary"}
                      >
                        {journal.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {journal.publish_date 
                        ? format(new Date(journal.publish_date), "PPP")
                        : "—"
                      }
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(journal.updated_at), "PPP")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </AppLayout>
  );
}
