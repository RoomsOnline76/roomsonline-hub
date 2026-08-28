import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
import { Checkbox } from "@/components/ui/checkbox";
import { useHubspotCapability, logMessageToHubspot } from "@/hooks/useHubspotCrm";
import { Plus, Send, Mail, Pencil, Trash2, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle, Sparkles, Eye, EyeOff, FileText } from "lucide-react";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PmsNoPropertyState } from "@/components/pms/PmsNoPropertyState";
import {
  useMessageTemplates, useUpsertTemplate, useDeleteTemplate,
  useSendMessage, useMessageLog, useMessageQueue, useProcessQueue,
  MESSAGE_PLACEHOLDERS, TRIGGER_EVENTS,
} from "@/hooks/usePmsMessaging";
import type { PmsMessageTemplate, PmsMessageLogEntry, PmsQueueEntry } from "@/types/pmsTypes";
import { EmailAIWriter } from "@/components/pms/EmailAIWriter";
import { EmailTemplatePreview } from "@/components/pms/EmailTemplatePreview";

// Starter template library
const STARTER_TEMPLATES: Record<string, { subject: string; body: string }> = {
  booking_confirmed: {
    subject: "Your Booking at {{property_name}} is Confirmed!",
    body: `<h2>Welcome, {{guest_name}}!</h2>
<p>Your reservation at <strong>{{property_name}}</strong> has been confirmed.</p>
<p><strong>Check-in:</strong> {{check_in_date}}<br/><strong>Check-out:</strong> {{check_out_date}}<br/><strong>Confirmation:</strong> {{confirmation_number}}<br/><strong>Total:</strong> {{total_amount}}</p>
<p>We look forward to welcoming you!</p>`,
  },
  pre_arrival: {
    subject: "Getting Ready for Your Stay at {{property_name}}",
    body: `<h2>Hello {{guest_first_name}},</h2>
<p>Your stay at <strong>{{property_name}}</strong> is almost here! Here's everything you need to know:</p>
<p><strong>Check-in Date:</strong> {{check_in_date}}<br/><strong>Duration:</strong> {{nights}}</p>
<p>If you have any special requests, please don't hesitate to let us know.</p>
<p>Safe travels!</p>`,
  },
  check_out: {
    subject: "Thank You for Staying at {{property_name}}",
    body: `<h2>Thank you, {{guest_first_name}}!</h2>
<p>We hope you enjoyed your stay at <strong>{{property_name}}</strong>.</p>
<p>We'd love to hear about your experience. Your feedback helps us continue to improve.</p>
<p>We hope to see you again soon!</p>`,
  },
  cancellation: {
    subject: "Booking Cancellation — {{property_name}}",
    body: `<h2>Cancellation Confirmation</h2>
<p>Dear {{guest_name}},</p>
<p>Your reservation ({{confirmation_number}}) at <strong>{{property_name}}</strong> has been cancelled.</p>
<p>If this was unintentional or you'd like to rebook, please don't hesitate to reach out.</p>`,
  },
  payment_request: {
    subject: "Payment Request — {{property_name}}",
    body: `<h2>Payment Required</h2>
<p>Dear {{guest_name}},</p>
<p>This is a reminder regarding your booking at <strong>{{property_name}}</strong>.</p>
<p><strong>Amount Due:</strong> {{total_amount}}<br/><strong>Reference:</strong> {{confirmation_number}}</p>
<p>Please complete your payment at your earliest convenience.</p>`,
  },
};

function PMSMessaging() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const { propertyId: hookPropertyId, loading: propertyLoading } = usePmsPropertyId();
  const pid = propertyId || hookPropertyId;

  const { data: propertyBrand } = useQuery({
    queryKey: ["property-brand", pid],
    queryFn: async () => {
      if (!pid) return null;
      const { data } = await supabase
        .from("properties")
        .select("name, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url")
        .eq("id", pid)
        .maybeSingle();
      return data;
    },
    enabled: !!pid,
  });

  const previewBrandColors = useMemo(() => ({
    primary: propertyBrand?.brand_primary_color || null,
    secondary: propertyBrand?.brand_secondary_color || null,
    font: propertyBrand?.brand_font_color || null,
  }), [propertyBrand]);
  const previewLogoUrl = propertyBrand?.brand_logo_url || null;
  const previewPropertyName = propertyBrand?.name || undefined;

  const { data: templates = [], isLoading: templatesLoading } = useMessageTemplates(pid);
  const { data: log = [], isLoading: logLoading } = useMessageLog(pid);
  const { data: queue = [] } = useMessageQueue(pid);
  const upsertTemplate = useUpsertTemplate(pid);
  const deleteTemplate = useDeleteTemplate(pid);
  const sendMessage = useSendMessage(pid);
  const processQueue = useProcessQueue(pid);

  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [aiWriterOpen, setAiWriterOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PmsMessageTemplate> & Record<string, unknown>>({});
  const [sendForm, setSendForm] = useState({ recipient_email: "", subject: "", body: "" });
  const [alsoLogToCrm, setAlsoLogToCrm] = useState(false);
  const { healthy: hubspotHealthy, status: hubspotStatus } = useHubspotCapability(pid);
  const crmLoggingOnForProperty = Boolean(pid && hubspotStatus?.messageLogProperties.includes(pid));

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
    ],
    content: "",
    onUpdate: ({ editor: e }) => {
      setEditForm(f => ({ ...f, body: e.getHTML() }));
    },
  });

  const openNewTemplate = () => {
    setEditForm({ name: "", trigger_event: "manual", subject: "", body: "", channel: "email", is_active: true, send_offset_hours: 0 });
    editor?.commands.setContent("");
    setShowPreview(false);
    setEditOpen(true);
  };

  const openEditTemplate = (t: PmsMessageTemplate) => {
    setEditForm({ ...t });
    editor?.commands.setContent(t.body || "");
    setShowPreview(false);
    setEditOpen(true);
  };

  const applyStarterTemplate = (trigger: string) => {
    const starter = STARTER_TEMPLATES[trigger];
    if (starter) {
      setEditForm(f => ({ ...f, subject: starter.subject, body: starter.body }));
      editor?.commands.setContent(starter.body);
      toast.success("Starter template applied");
    }
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
      // CRM copy is a projection of an already delivered message: fire-and-forget,
      // never awaited, and it can never turn a successful send into a failure.
      if (hubspotHealthy && (alsoLogToCrm || crmLoggingOnForProperty) && sendForm.recipient_email) {
        logMessageToHubspot({
          email: sendForm.recipient_email,
          propertyId: pid,
          event: "manual_message",
          subject: sendForm.subject,
          body: sendForm.body,
          force: alsoLogToCrm,
        });
      }
      setSendOpen(false);
      setAlsoLogToCrm(false);
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
    if (editor) {
      editor.chain().focus().insertContent(`{{${key}}}`).run();
    }
  };

  const handleAIGenerated = (subject: string, bodyHtml: string) => {
    setEditForm(f => ({ ...f, subject, body: bodyHtml }));
    editor?.commands.setContent(bodyHtml);
  };

  // Group templates by trigger event
  const groupedTemplates = templates.reduce((acc: Record<string, PmsMessageTemplate[]>, t: PmsMessageTemplate) => {
    const key = t.trigger_event || "manual";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  // Messaging needs a property (templates, guests, sender identity) — stay inert
  // for accounts with no property assigned.
  if (!propertyLoading && !hookPropertyId) {
    return (
      <PmsNoPropertyState description="Guest messaging becomes available once a property is assigned to this account." />
    );
  }

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
              <div className="space-y-6">
                {TRIGGER_EVENTS.map(event => {
                  const eventTemplates = groupedTemplates[event.value];
                  if (!eventTemplates?.length) return null;
                  return (
                    <div key={event.value}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">{event.label}</h3>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {eventTemplates.map((t: PmsMessageTemplate) => (
                          <Card key={t.id} className="relative group">
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between">
                                <CardTitle className="text-sm font-medium">{t.name}</CardTitle>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                <Badge variant="outline" className="text-xs">{t.channel}</Badge>
                                {!t.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">{t.subject}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* Ungrouped templates */}
                {Object.keys(groupedTemplates).filter(k => !TRIGGER_EVENTS.find(e => e.value === k)).map(key => (
                  <div key={key}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">{key}</h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {groupedTemplates[key].map((t: PmsMessageTemplate) => (
                        <Card key={t.id} className="relative group">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">{t.name}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xs text-muted-foreground line-clamp-2">{t.subject}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
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

        {/* Template Editor Dialog — Rich Editor */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editForm.id ? "Edit Template" : "New Template"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Editor side */}
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
                  <div className="flex items-center justify-between mb-1">
                    <Label>Body</Label>
                    <div className="flex gap-1">
                      {!editForm.id && STARTER_TEMPLATES[editForm.trigger_event || ""] && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => applyStarterTemplate(editForm.trigger_event || "")}>
                          <FileText className="h-3.5 w-3.5 mr-1" /> Use Starter
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAiWriterOpen(true)}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate with TOBI
                      </Button>
                    </div>
                  </div>
                  {/* TipTap toolbar */}
                  {editor && (
                    <div className="flex flex-wrap gap-1 mb-1 p-1 border rounded-t-md bg-muted/30">
                      <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 ${editor.isActive("bold") ? "bg-muted" : ""}`} onClick={() => editor.chain().focus().toggleBold().run()}>
                        <span className="font-bold text-xs">B</span>
                      </Button>
                      <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 ${editor.isActive("italic") ? "bg-muted" : ""}`} onClick={() => editor.chain().focus().toggleItalic().run()}>
                        <span className="italic text-xs">I</span>
                      </Button>
                      <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 ${editor.isActive("underline") ? "bg-muted" : ""}`} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                        <span className="underline text-xs">U</span>
                      </Button>
                      <div className="w-px h-7 bg-border mx-1" />
                      <Button variant="ghost" size="sm" className={`h-7 px-2 ${editor.isActive("heading", { level: 2 }) ? "bg-muted" : ""}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                        <span className="text-xs font-semibold">H2</span>
                      </Button>
                      <Button variant="ghost" size="sm" className={`h-7 px-2 ${editor.isActive("heading", { level: 3 }) ? "bg-muted" : ""}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                        <span className="text-xs font-semibold">H3</span>
                      </Button>
                      <div className="w-px h-7 bg-border mx-1" />
                      <Button variant="ghost" size="sm" className={`h-7 px-2 ${editor.isActive("bulletList") ? "bg-muted" : ""}`} onClick={() => editor.chain().focus().toggleBulletList().run()}>
                        <span className="text-xs">• List</span>
                      </Button>
                    </div>
                  )}
                  <div className="border rounded-b-md min-h-[200px] p-3 prose prose-sm max-w-none focus-within:ring-1 focus-within:ring-ring">
                    <EditorContent editor={editor} />
                  </div>
                  {/* Placeholder chips */}
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

              {/* Preview side */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Live Preview</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowPreview(p => !p)}>
                    {showPreview ? <><EyeOff className="h-3.5 w-3.5 mr-1" /> Hide</> : <><Eye className="h-3.5 w-3.5 mr-1" /> Show</>}
                  </Button>
                </div>
                {showPreview && (
                  <EmailTemplatePreview
                    subject={editForm.subject as string || ""}
                    bodyHtml={editForm.body as string || ""}
                    brandColors={previewBrandColors}
                    logoUrl={previewLogoUrl}
                    propertyName={previewPropertyName}
                  />
                )}
                {!showPreview && (
                  <div className="border rounded-lg border-dashed p-8 flex items-center justify-center text-muted-foreground text-sm">
                    Click "Show" to see a branded preview with sample data
                  </div>
                )}
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

        {/* AI Writer Dialog */}
        <EmailAIWriter
          open={aiWriterOpen}
          onOpenChange={setAiWriterOpen}
          propertyId={pid}
          triggerEvent={editForm.trigger_event as string || "manual"}
          onGenerated={handleAIGenerated}
        />

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
              {/* Optional CRM copy — only offered when the add-on is live. Native
                  delivery is unaffected either way. */}
              {hubspotHealthy && (
                <div className="flex items-start gap-2 rounded-md border p-3">
                  <Checkbox
                    id="log-to-crm"
                    checked={alsoLogToCrm}
                    onCheckedChange={v => setAlsoLogToCrm(v === true)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="log-to-crm" className="text-sm">Also log to CRM</Label>
                    <p className="text-xs text-muted-foreground">
                      Adds a copy of this message to the guest's CRM timeline after it is sent.
                    </p>
                  </div>
                </div>
              )}
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
