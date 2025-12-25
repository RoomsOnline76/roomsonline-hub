import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Plus, Loader2, FileText } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Journal Management</h1>
            <p className="text-muted-foreground">Create and manage editorial content</p>
          </div>
          <Button onClick={() => navigate("/admin/journals/new")}>
            <Plus className="h-4 w-4 mr-2" />
            New Journal
          </Button>
        </div>

        {/* Content */}
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
                {journals.map((journal) => (
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
