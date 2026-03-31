import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye } from "lucide-react";
import DOMPurify from "dompurify";

interface EmailTemplatePreviewProps {
  subject: string;
  bodyHtml: string;
  propertyName?: string;
  brandColors?: {
    primary?: string | null;
    secondary?: string | null;
    font?: string | null;
  };
  logoUrl?: string | null;
}

const MOCK_DATA: Record<string, string> = {
  "{{guest_name}}": "Jane Smith",
  "{{guest_first_name}}": "Jane",
  "{{guest_email}}": "jane@example.com",
  "{{property_name}}": "Sample Property",
  "{{check_in}}": "15 January 2026",
  "{{check_in_date}}": "15 January 2026",
  "{{check_out}}": "18 January 2026",
  "{{check_out_date}}": "18 January 2026",
  "{{confirmation_number}}": "BK-A1B2C3",
  "{{total_amount}}": "R 4,500.00",
  "{{total_price}}": "R 4,500.00",
  "{{nights}}": "3 nights",
  "{{reservation_reference}}": "BK-A1B2C3",
};

export function EmailTemplatePreview({
  subject,
  bodyHtml,
  propertyName,
  brandColors,
  logoUrl,
}: EmailTemplatePreviewProps) {
  const renderedHtml = useMemo(() => {
    let html = bodyHtml || "";
    // Replace placeholders with mock data
    for (const [key, value] of Object.entries(MOCK_DATA)) {
      html = html.replaceAll(key, propertyName && key === "{{property_name}}" ? propertyName : value);
    }
    return DOMPurify.sanitize(html);
  }, [bodyHtml, propertyName]);

  const renderedSubject = useMemo(() => {
    let s = subject || "";
    for (const [key, value] of Object.entries(MOCK_DATA)) {
      s = s.replaceAll(key, propertyName && key === "{{property_name}}" ? propertyName : value);
    }
    return s;
  }, [subject, propertyName]);

  const primaryColor = brandColors?.primary || "#1a1a2e";

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="h-4 w-4" /> Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="rounded-lg border overflow-hidden"
          style={{ maxHeight: 400, overflowY: "auto" }}
        >
          {/* Email header bar */}
          <div
            className="px-4 py-3 text-white text-xs"
            style={{ backgroundColor: primaryColor }}
          >
            {logoUrl && (
              <img src={logoUrl} alt="Logo" className="h-6 mb-1" />
            )}
            <div className="font-semibold text-sm">{renderedSubject || "Subject line preview"}</div>
            <div className="opacity-70 mt-0.5">To: jane@example.com</div>
          </div>
          {/* Email body */}
          <div
            className="p-4 bg-white text-sm"
            style={{
              fontFamily: "Arial, sans-serif",
              color: brandColors?.font || "#333",
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml || '<p style="color:#999">Email body will appear here…</p>' }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
