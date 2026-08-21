import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Loader2, MailQuestion } from "lucide-react";
import { toast } from "sonner";
import { InquiryIntakeKeysCard } from "@/components/pms/crm/InquiryIntakeKeysCard";

const INTAKE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/inquiry-intake`;

/** Optional fields the owner can switch on. Name is always present. */
const OPTIONAL_FIELDS = [
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "country", label: "Country" },
  { id: "company", label: "Company (trade)" },
  { id: "dates", label: "Dates" },
  { id: "guests", label: "Guests" },
  { id: "message", label: "Message" },
] as const;

type FieldId = (typeof OPTIONAL_FIELDS)[number]["id"];

interface KeyRow {
  id: string;
  key_public: string;
  label: string | null;
  is_active: boolean;
}

interface EnquiryFormTabProps {
  property: { id: string; name: string; slug?: string; brand_primary_color?: string | null };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Website enquiry form builder — generates a self-contained snippet that posts
 * to the public inquiry intake endpoint. Nothing here touches booking logic.
 */
export function EnquiryFormTab({ property }: EnquiryFormTabProps) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [fields, setFields] = useState<Record<FieldId, boolean>>({
    email: true,
    phone: true,
    country: false,
    company: false,
    dates: true,
    guests: true,
    message: true,
  });
  const [buttonLabel, setButtonLabel] = useState("Send enquiry");
  const [confirmation, setConfirmation] = useState("Thank you — we'll be in touch shortly.");
  const [accent, setAccent] = useState(property.brand_primary_color || "#E91E8C");

  const loadKeys = useCallback(async () => {
    setLoadingKeys(true);
    const { data, error } = await supabase
      .from("rolos_inquiry_keys")
      .select("id, key_public, label, is_active")
      .eq("property_id", property.id)
      .order("created_at", { ascending: false });
    if (error) console.error("[EnquiryFormTab] keys load failed:", error.message);
    const rows = (data || []) as KeyRow[];
    setKeys(rows);
    setSelectedKey((prev) => prev || rows.find((k) => k.is_active)?.key_public || rows[0]?.key_public || "");
    setLoadingKeys(false);
  }, [property.id]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const toggle = useCallback((id: FieldId) => {
    setFields((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      // Keep at least one way of reaching the guest.
      if (!next.email && !next.phone) next.email = true;
      return next;
    });
  }, []);

  const snippet = useMemo(() => {
    const key = selectedKey || "YOUR_INQUIRY_KEY";
    const row = (id: string, label: string, type = "text", extra = "") =>
      `      <label style="display:block;margin-bottom:12px">\n        <span style="display:block;font-size:13px;margin-bottom:4px">${esc(label)}</span>\n        <input name="${id}" type="${type}"${extra} style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #d6d6d6;border-radius:8px;font:inherit" />\n      </label>`;

    const parts: string[] = [row("guest_name", "Name", "text", " required")];
    if (fields.email) parts.push(row("guest_email", "Email", "email", fields.phone ? "" : " required"));
    if (fields.phone) parts.push(row("guest_phone", "Phone", "tel"));
    if (fields.country) parts.push(row("guest_country", "Country"));
    if (fields.company) parts.push(row("company_name", "Company (travel trade)"));
    if (fields.dates) {
      parts.push(
        `      <div style="display:flex;gap:12px">\n${row("check_in", "Arrival", "date")}\n${row("check_out", "Departure", "date")}\n      </div>`,
      );
    }
    if (fields.guests) {
      parts.push(
        `      <div style="display:flex;gap:12px">\n${row("adults", "Adults", "number", ' min="1" value="2"')}\n${row("children", "Children", "number", ' min="0" value="0"')}\n      </div>`,
      );
    }
    if (fields.message) {
      parts.push(
        `      <label style="display:block;margin-bottom:12px">\n        <span style="display:block;font-size:13px;margin-bottom:4px">Message</span>\n        <textarea name="message" rows="4" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #d6d6d6;border-radius:8px;font:inherit"></textarea>\n      </label>`,
      );
    }

    return `<!-- ROL'OS enquiry form — ${esc(property.name)} -->
<form id="rol-enquiry" style="max-width:520px;font-family:system-ui,sans-serif;color:#1A1A2E">
${parts.join("\n")}
      <input name="trap" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" />
      <button type="submit" style="width:100%;padding:12px;border:0;border-radius:8px;background:${accent};color:#fff;font:inherit;font-weight:600;cursor:pointer">${esc(buttonLabel)}</button>
      <p id="rol-enquiry-msg" style="margin-top:12px;font-size:14px"></p>
</form>
<script>
(function () {
  var form = document.getElementById('rol-enquiry');
  var msg = document.getElementById('rol-enquiry-msg');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var payload = { inquiry_key: '${key}', source: 'website' };
    fd.forEach(function (value, name) {
      var v = String(value).trim();
      if (!v) return;
      if (name === 'adults' || name === 'children') payload[name] = parseInt(v, 10);
      else payload[name] = v;
    });
    if (payload.company_name) payload.is_trade = true;
    msg.textContent = 'Sending…';
    try {
      var res = await fetch('${INTAKE_URL}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.error || 'Could not send the enquiry');
      form.reset();
      msg.textContent = ${JSON.stringify(confirmation)};
    } catch (err) {
      msg.textContent = err.message || 'Could not send the enquiry. Please try again.';
    }
  });
})();
</script>`;
  }, [selectedKey, fields, accent, buttonLabel, confirmation, property.name]);

  const wordpressSnippet = useMemo(
    () =>
      `<!-- Paste into a WordPress "Custom HTML" block or an Elementor HTML widget. -->\n<!-- Keep the <script> block: it posts the enquiry to ROL'OS. -->\n\n${snippet}`,
    [snippet],
  );

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Snippet copied");
  };

  return (
    <div className="space-y-4">
      <InquiryIntakeKeysCard propertyId={property.id} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MailQuestion className="h-4 w-4 text-primary" />
            Enquiry form builder
          </CardTitle>
          <CardDescription className="text-xs">
            Choose the fields, copy the snippet, paste it on your page. Enquiries land in
            Inquiries and mirror to your CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
            <div className="space-y-1.5">
              <Label className="text-xs">Website key</Label>
              {loadingKeys ? (
                <div className="flex h-10 items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading keys…
                </div>
              ) : keys.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Create a website key above first — the snippet needs one.
                </p>
              ) : (
                <Select value={selectedKey} onValueChange={setSelectedKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select key" />
                  </SelectTrigger>
                  <SelectContent>
                    {keys.map((k) => (
                      <SelectItem key={k.id} value={k.key_public}>
                        {(k.label || "Website form") + (k.is_active ? "" : " (paused)")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Button label</Label>
              <Input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Accent colour</Label>
              <Input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 p-1" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Confirmation message</Label>
            <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} maxLength={160} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Fields</Label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked disabled /> Name
              </span>
              {OPTIONAL_FIELDS.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={fields[f.id]} onCheckedChange={() => toggle(f.id)} />
                  {f.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              At least one of email or phone stays on so you can reply.
            </p>
          </div>

          <Tabs defaultValue="preview" className="space-y-3">
            <TabsList>
              <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
              <TabsTrigger value="html" className="text-xs">HTML</TabsTrigger>
              <TabsTrigger value="wordpress" className="text-xs">WordPress</TabsTrigger>
            </TabsList>

            <TabsContent value="preview">
              <div className="max-w-md space-y-3 rounded-lg border border-border p-4">
                <PreviewField label="Name" />
                {fields.email && <PreviewField label="Email" />}
                {fields.phone && <PreviewField label="Phone" />}
                {fields.country && <PreviewField label="Country" />}
                {fields.company && <PreviewField label="Company (travel trade)" />}
                {fields.dates && (
                  <div className="grid grid-cols-2 gap-3">
                    <PreviewField label="Arrival" />
                    <PreviewField label="Departure" />
                  </div>
                )}
                {fields.guests && (
                  <div className="grid grid-cols-2 gap-3">
                    <PreviewField label="Adults" />
                    <PreviewField label="Children" />
                  </div>
                )}
                {fields.message && <PreviewField label="Message" tall />}
                <div
                  className="rounded-md py-2.5 text-center text-sm font-semibold text-white"
                  style={{ background: accent }}
                >
                  {buttonLabel || "Send enquiry"}
                </div>
                <p className="text-xs text-muted-foreground">{confirmation}</p>
              </div>
            </TabsContent>

            <TabsContent value="html" className="space-y-2">
              <Button size="sm" variant="outline" onClick={() => copy(snippet)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy HTML
              </Button>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                {snippet}
              </pre>
            </TabsContent>

            <TabsContent value="wordpress" className="space-y-2">
              <Button size="sm" variant="outline" onClick={() => copy(wordpressSnippet)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy for WordPress
              </Button>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                {wordpressSnippet}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewField({ label, tall = false }: { label: string; tall?: boolean }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <div className={`rounded-md border border-border bg-background ${tall ? "h-16" : "h-9"}`} />
    </div>
  );
}
