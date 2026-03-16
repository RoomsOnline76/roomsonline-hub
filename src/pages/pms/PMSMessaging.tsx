import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Send, Mail, Pencil, Trash2, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import {
  useMessageTemplates, useUpsertTemplate, useDeleteTemplate,
  useSendMessage, useMessageLog, useMessageQueue, useProcessQueue,
  MESSAGE_PLACEHOLDERS, TRIGGER_EVENTS,
} from "@/hooks/usePmsMessaging";
import type { PmsMessageTemplate, PmsMessageLogEntry, PmsQueueEntry, PmsProcessQueueResult } from "@/types/pmsTypes";

function PMSMessaging() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const { propertyId: hookPropertyId } = usePmsPropertyId();
  const pid = propertyId || hookPropertyId;

  const { data: templates = [], isLoading: templatesLoading } = useMessageTemplates(pid);
  const { data: log = [], isLoading: logLoading } = useMessageLog(pid);
  const { data: queue = [] } = useMessageQueue(pid);
  const upsertTemplate = useUpsertTemplate(pid);
  const deleteTemplate = useDeleteTemplate(pid);
  const sendMessage = useSendMessage(pid);
  const processQueue = useProcessQueue(pid);

  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PmsMessageTemplate> & Record<string, unknown>>({});
  const [sendForm, setSendForm] = useState({ recipient_email: "", subject: "", body: "" });

  const openNewTemplate = () => {
    setEditForm({ name: "", trigger_event: "manual", subject: "", body: "", channel: "email", is_active: true, send_offset_hours: 0 });
    setEditOpen(true);
  };

  const openEditTemplate = (t: PmsMessageTemplate) => {
    setEditForm({ ...t });
    setEditOpen(true);
  };

  const saveTemplate = async () => {
    try {
      await upsertTemplate.mutateAsync(editForm);
      toast.success("Template saved");
      setEditOpen(false);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to save template");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success("Template deleted");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to delete");
    }
  };

  const handleSend = async () => {
    try {
      await sendMessage.mutateAsync(sendForm);
      toast.success("Message sent");
      setSendOpen(false);
      setSendForm({ recipient_email: "", subject: "", body: "" });
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to send");
    }
  };

  const handleProcessQueue = async () => {
    try {
      const result = await processQueue.mutateAsync();
      toast.success(`Processed: ${result?.sent || 0} sent, ${result?.failed || 0} failed`);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to process queue");
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": case "delivered": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed": case "bounced": return <XCircle className="h-4 w-4 text-destructive" />;
      case "pending": case "processing": return <Clock className="h-4 w-4 text-muted-foreground" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const insertPlaceholder = (key: string) => {
    setEditForm((f) => ({ ...f, body: (f.body || "") + `{{${key}}}` }));
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Messaging</h1>
            <p className="text-sm text-muted-foreground">Manage guest communication templates and message history</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleProcessQueue} disabled={processQueue.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" /> Process Queue ({queue.filter((q: PmsQueueEntry) => q.status === "pending").length})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSendOpen(true)}>
              <Send className="h-4 w-4 mr-1" /> Send Message
            </Button>
            <Button size="sm" onClick={openNewTemplate}>
              <Plus className="h-4 w-4 mr-1" /> New Template
            </Button>
          </div>
        </div>

          <Tabs defaultValue="templates" className="space-y-4">
            <TabsList>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="log">Message Log</TabsTrigger>
              <TabsTrigger value="queue">Queue</TabsTrigger>
            </TabsList>

            {/* Templates */}
            <TabsContent value="templates">
              {templatesLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : templates.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Mail className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No templates yet. Create your first one to start automating guest communication.</p>
                    <Button size="sm" className="mt-4" onClick={openNewTemplate}><Plus className="h-4 w-4 mr-1" /> Create Template</Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {templates.map((t: PmsMessageTemplate) => (
                    <Card key={t.id} className="relative">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm font-medium">{t.name}</CardTitle>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTemplate(t)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{TRIGGER_EVENTS.find(e => e.value === t.trigger_event)?.label || t.trigger_event}</Badge>
                          <Badge variant="outline" className="text-xs">{t.channel}</Badge>
                          {!t.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{t.subject}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Message Log */}
            <TabsContent value="log">
              {logLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {log.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No messages sent yet</TableCell></TableRow>
                      ) : log.map((m: PmsMessageLogEntry) => (
                        <TableRow key={m.id}>
                          <TableCell><div className="flex items-center gap-1.5">{statusIcon(m.status)}<span className="text-xs capitalize">{m.status}</span></div></TableCell>
                          <TableCell className="text-sm">{m.recipient_email || m.recipient_phone || "—"}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{m.subject || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{m.channel}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.sent_at ? new Date(m.sent_at).toLocaleString() : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>

            {/* Queue */}
            <TabsContent value="queue">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Scheduled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Queue is empty</TableCell></TableRow>
                    ) : queue.map((q: PmsQueueEntry) => (
                      <TableRow key={q.id}>
                        <TableCell><div className="flex items-center gap-1.5">{statusIcon(q.status)}<span className="text-xs capitalize">{q.status}</span></div></TableCell>
                        <TableCell className="text-sm">{q.recipient_email || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{q.subject || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{q.scheduled_at ? new Date(q.scheduled_at).toLocaleString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Template Editor Dialog */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editForm.id ? "Edit Template" : "New Template"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={editForm.name || ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Booking Confirmation" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Trigger Event</Label>
                    <Select value={editForm.trigger_event || "manual"} onValueChange={v => setEditForm(f => ({ ...f, trigger_event: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_EVENTS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Channel</Label>
                    <Select value={editForm.channel || "email"} onValueChange={v => setEditForm(f => ({ ...f, channel: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Subject</Label>
                  <Input value={editForm.subject || ""} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} placeholder="Your booking at {{property_name}}" />
                </div>
                <div>
                  <Label>Body</Label>
                  <Textarea rows={6} value={editForm.body || ""} onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))} placeholder="Dear {{guest_name}}..." />
                  <div className="flex flex-wrap gap-1 mt-2">
                    {MESSAGE_PLACEHOLDERS.map(p => (
                      <Button key={p.key} variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => insertPlaceholder(p.key)}>
                        {`{{${p.key}}}`}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editForm.is_active ?? true} onCheckedChange={v => setEditForm(f => ({ ...f, is_active: v }))} />
                  <Label>Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={saveTemplate} disabled={upsertTemplate.isPending}>
                  {upsertTemplate.isPending ? "Saving…" : "Save Template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Send Message Dialog */}
          <Dialog open={sendOpen} onOpenChange={setSendOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Message</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Recipient Email</Label>
                  <Input value={sendForm.recipient_email} onChange={e => setSendForm(f => ({ ...f, recipient_email: e.target.value }))} placeholder="guest@example.com" />
                </div>
                <div>
                  <Label>Subject</Label>
                  <Input value={sendForm.subject} onChange={e => setSendForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div>
                  <Label>Body (HTML)</Label>
                  <Textarea rows={5} value={sendForm.body} onChange={e => setSendForm(f => ({ ...f, body: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
                <Button onClick={handleSend} disabled={sendMessage.isPending}>
                  <Send className="h-4 w-4 mr-1" /> {sendMessage.isPending ? "Sending…" : "Send"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      </div>
    </>
  );
}

export default PMSMessaging;
