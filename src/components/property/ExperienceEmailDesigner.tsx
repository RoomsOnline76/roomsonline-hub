import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import {
  Plus, Save, Trash2, Sparkles, Bold, Italic, UnderlineIcon, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link as LinkIcon, ImageIcon, Loader2, Tag,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMessageTemplates, useUpsertTemplate, useDeleteTemplate,
  MESSAGE_PLACEHOLDERS, TRIGGER_EVENTS,
} from "@/hooks/usePmsMessaging";
import { EmailAIWriter } from "@/components/pms/EmailAIWriter";
import type { PmsMessageTemplate } from "@/types/pmsTypes";

interface ExperienceEmailDesignerProps {
  propertyId: string;
}

export function ExperienceEmailDesigner({ propertyId }: ExperienceEmailDesignerProps) {
  const { data: templates = [], isLoading } = useMessageTemplates(propertyId);
  const upsertTemplate = useUpsertTemplate(propertyId);
  const deleteTemplate = useDeleteTemplate(propertyId);

  const [editOpen, setEditOpen] = useState(false);
  const [aiWriterOpen, setAiWriterOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PmsMessageTemplate> & Record<string, unknown>>({});

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

  const openNew = () => {
    setEditForm({ name: "", trigger_event: "manual", subject: "", body: "", channel: "email", is_active: true, send_offset_hours: 0 });
    editor?.commands.setContent("");
    setEditOpen(true);
  };

  const openEdit = (t: PmsMessageTemplate) => {
    setEditForm({ ...t });
    editor?.commands.setContent(t.body || "");
    setEditOpen(true);
  };

  const save = async () => {
    try {
      await upsertTemplate.mutateAsync(editForm);
      toast.success("Template saved");
      setEditOpen(false);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to save");
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

  const insertPlaceholder = (key: string) => {
    editor?.chain().focus().insertContent(`{{${key}}}`).run();
  };

  const handleAIGenerated = (subject: string, bodyHtml: string) => {
    setEditForm(f => ({ ...f, subject, body: bodyHtml }));
    editor?.commands.setContent(bodyHtml);
  };

  const grouped = templates.reduce((acc: Record<string, PmsMessageTemplate[]>, t) => {
    const key = t.trigger_event || "manual";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading templates…</div>;

  return (
    <>
      <Card>
        <CardHeader className="py-2 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Email Templates
          </CardTitle>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={openNew}>
            <Plus className="h-3 w-3" /> New Template
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No templates yet. Create one or use the AI writer to get started.</p>
          ) : (
            Object.entries(grouped).map(([trigger, tpls]) => {
              const triggerLabel = TRIGGER_EVENTS.find(e => e.value === trigger)?.label || trigger;
              return (
                <div key={trigger} className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{triggerLabel}</h4>
                  {tpls.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/50 cursor-pointer"
                      onClick={() => openEdit(t)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm truncate">{t.name || t.subject}</span>
                        <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px] h-4">
                          {t.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editForm.id ? "Edit Template" : "New Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input className="h-8 text-sm" value={editForm.name as string || ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Trigger Event</Label>
                <Select value={editForm.trigger_event as string || "manual"} onValueChange={v => setEditForm(f => ({ ...f, trigger_event: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_EVENTS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Subject</Label>
              <Input className="h-8 text-sm" value={editForm.subject as string || ""} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={editForm.is_active as boolean ?? true} onCheckedChange={v => setEditForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-xs">Active</Label>
              <div className="ml-auto">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAiWriterOpen(true)}>
                  <Sparkles className="h-3 w-3" /> AI Writer
                </Button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap gap-1 border rounded-md p-1">
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => editor?.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => editor?.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => editor?.chain().focus().setTextAlign("right").run()}><AlignRight className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Button>
              <div className="border-l mx-1" />
              {/* Placeholders dropdown */}
              <Select onValueChange={insertPlaceholder}>
                <SelectTrigger className="h-7 w-auto text-xs gap-1 px-2 border-dashed"><Tag className="h-3 w-3" /> Insert Placeholder</SelectTrigger>
                <SelectContent>
                  {MESSAGE_PLACEHOLDERS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Editor */}
            <div className="border rounded-md p-3 min-h-[200px] prose prose-sm max-w-none">
              <EditorContent editor={editor} />
            </div>

            <div>
              <Label className="text-xs">Send Offset (hours before/after trigger)</Label>
              <Input type="number" className="h-8 text-sm w-32" value={editForm.send_offset_hours as number || 0} onChange={e => setEditForm(f => ({ ...f, send_offset_hours: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={upsertTemplate.isPending}>
              {upsertTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Writer */}
      <EmailAIWriter
        open={aiWriterOpen}
        onOpenChange={setAiWriterOpen}
        propertyId={propertyId}
        triggerEvent={editForm.trigger_event as string || "manual"}
        onGenerated={handleAIGenerated}
      />
    </>
  );
}
