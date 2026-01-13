import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useBatches, useCreateBatch } from "@/hooks/useBankExport";
import { Plus, FileSpreadsheet, Clock, CheckCircle2, XCircle, AlertTriangle, Download } from "lucide-react";
import { CreateBatchDialog } from "./CreateBatchDialog";
import { BatchDetailsModal } from "./BatchDetailsModal";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  draft: { label: "Draft", variant: "secondary", icon: <FileSpreadsheet className="h-3 w-3" /> },
  awaiting_signoff: { label: "Awaiting Signoff", variant: "outline", icon: <Clock className="h-3 w-3" /> },
  approved: { label: "Approved", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
  exported: { label: "Exported", variant: "default", icon: <Download className="h-3 w-3" /> },
  failed: { label: "Failed", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", variant: "secondary", icon: <XCircle className="h-3 w-3" /> },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BatchList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  
  const { data: batches, isLoading, error } = useBatches(
    statusFilter !== "all" ? statusFilter : undefined
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <p>Failed to load batches: {error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Export Batches</CardTitle>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="awaiting_signoff">Awaiting Signoff</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="exported">Exported</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setCreateDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Batch
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!batches || batches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No batches found</p>
              <p className="text-sm mt-1">Create a new batch to start processing payouts</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Records</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => {
                  const status = statusConfig[batch.status] || statusConfig.draft;
                  return (
                    <TableRow 
                      key={batch.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedBatchId(batch.id)}
                    >
                      <TableCell className="font-mono font-medium">
                        {batch.batch_reference}
                      </TableCell>
                      <TableCell className="capitalize">
                        {batch.bank_provider.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(batch.total_amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {batch.total_records}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          {status.icon}
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(batch.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBatchId(batch.id);
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateBatchDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      />

      <BatchDetailsModal
        batchId={selectedBatchId}
        open={!!selectedBatchId}
        onOpenChange={(open) => !open && setSelectedBatchId(null)}
      />
    </>
  );
}
