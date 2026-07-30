import { useState } from "react";
import { useFolios, useFolioDetail, useRecordPayment, useGenerateInvoice } from "@/hooks/usePmsFinancial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Receipt, CreditCard, FileText, Download, Plus, ArrowUpRight, ArrowDownLeft, X,
} from "lucide-react";
import { format } from "date-fns";

interface PMSFoliosManagerProps {
  propertyId: string;
}

function FolioStatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge variant="outline" className="border-primary text-primary">Open</Badge>;
  if (status === "closed") return <Badge variant="secondary">Closed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function PMSFoliosManager({ propertyId }: PMSFoliosManagerProps) {
  const { data: folios, isLoading } = useFolios(propertyId);
  const [selectedFolioId, setSelectedFolioId] = useState<string | null>(null);
  const [paymentDialogFolioId, setPaymentDialogFolioId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Guest Folios</h3>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading folios...</TableCell></TableRow>
              ) : !folios?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No folios found</TableCell></TableRow>
              ) : (
                folios.map((folio: any) => (
                  <TableRow key={folio.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedFolioId(folio.id)}>
                    <TableCell className="font-medium">{folio.booking?.guest_name || folio.guest_name || "—"}</TableCell>
                    <TableCell>{folio.booking?.check_in_date ? format(new Date(folio.booking.check_in_date), "dd MMM") : "—"}</TableCell>
                    <TableCell>{folio.booking?.check_out_date ? format(new Date(folio.booking.check_out_date), "dd MMM") : "—"}</TableCell>
                    <TableCell><FolioStatusBadge status={folio.status} /></TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={Number(folio.balance) > 0 ? "text-destructive" : "text-success"}>
                        R {Number(folio.balance || 0).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setPaymentDialogFolioId(folio.id); }}>
                        <CreditCard className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Folio Detail Sheet */}
      <FolioDetailSheet
        folioId={selectedFolioId}
        propertyId={propertyId}
        open={!!selectedFolioId}
        onClose={() => setSelectedFolioId(null)}
        onRecordPayment={(fId) => { setSelectedFolioId(null); setPaymentDialogFolioId(fId); }}
      />

      {/* Payment Dialog */}
      <RecordPaymentDialog
        folioId={paymentDialogFolioId}
        propertyId={propertyId}
        open={!!paymentDialogFolioId}
        onClose={() => setPaymentDialogFolioId(null)}
      />
    </div>
  );
}

// ==================== Folio Detail Sheet ====================
function FolioDetailSheet({ folioId, propertyId, open, onClose, onRecordPayment }: {
  folioId: string | null; propertyId: string; open: boolean; onClose: () => void; onRecordPayment: (folioId: string) => void;
}) {
  const { data, isLoading } = useFolioDetail(folioId);
  const generateInvoice = useGenerateInvoice(propertyId);

  const folio = data?.folio;
  const transactions = data?.transactions || [];
  const payments = data?.payments || [];
  const invoices = data?.invoices || [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            {folio?.guest_name || "Folio Detail"}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <p className="text-muted-foreground py-8 text-center">Loading...</p>
        ) : (
          <ScrollArea className="h-[calc(100vh-120px)] pr-4">
            <div className="space-y-6 py-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className={`text-lg font-bold ${Number(folio?.balance || 0) > 0 ? "text-destructive" : "text-success"}`}>
                      R {Number(folio?.balance || 0).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <FolioStatusBadge status={folio?.status || "open"} />
                  </CardContent>
                </Card>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => folioId && onRecordPayment(folioId)}>
                  <CreditCard className="w-4 h-4 mr-1" /> Record Payment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => folioId && generateInvoice.mutate({ folio_id: folioId })}
                  disabled={generateInvoice.isPending}
                >
                  <FileText className="w-4 h-4 mr-1" /> Generate Invoice
                </Button>
              </div>

              {/* Transactions */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Transactions</h4>
                <div className="space-y-1">
                  {transactions.map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded border text-sm">
                      <div className="flex items-center gap-2">
                        {Number(tx.amount) > 0 ? (
                          <ArrowUpRight className="w-4 h-4 text-destructive" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4 text-success" />
                        )}
                        <span>{tx.description}</span>
                      </div>
                      <span className={`font-mono ${Number(tx.amount) > 0 ? "text-destructive" : "text-success"}`}>
                        {Number(tx.amount) > 0 ? "" : "-"}R {Math.abs(Number(tx.amount)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {!transactions.length && <p className="text-sm text-muted-foreground">No transactions yet</p>}
                </div>
              </div>

              <Separator />

              {/* Payments */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Payments</h4>
                <div className="space-y-1">
                  {payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded border text-sm">
                      <div>
                        <span className="capitalize">{p.method}</span>
                        {p.reference && <span className="text-muted-foreground ml-2">({p.reference})</span>}
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-success">R {Number(p.amount).toFixed(2)}</span>
                        <Badge variant={p.status === "completed" ? "default" : "secondary"} className="ml-2 text-xs">
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {!payments.length && <p className="text-sm text-muted-foreground">No payments recorded</p>}
                </div>
              </div>

              <Separator />

              {/* Invoices */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Invoices</h4>
                <div className="space-y-1">
                  {invoices.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded border text-sm">
                      <div>
                        <span className="font-medium">{inv.invoice_number}</span>
                        <span className="text-muted-foreground ml-2">R {Number(inv.total).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{inv.status}</Badge>
                        {inv.pdf_url && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!invoices.length && <p className="text-sm text-muted-foreground">No invoices generated</p>}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ==================== Record Payment Dialog ====================
function RecordPaymentDialog({ folioId, propertyId, open, onClose }: {
  folioId: string | null; propertyId: string; open: boolean; onClose: () => void;
}) {
  const recordPayment = useRecordPayment(propertyId);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");

  const handleSubmit = () => {
    if (!folioId || !amount) return;
    recordPayment.mutate(
      { folio_id: folioId, amount: parseFloat(amount), method, reference: reference || undefined },
      {
        onSuccess: () => {
          setAmount(""); setReference(""); setMethod("cash");
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Amount (ZAR)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="eft">EFT / Bank Transfer</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt / reference number" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!amount || recordPayment.isPending}>
            {recordPayment.isPending ? "Recording..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
