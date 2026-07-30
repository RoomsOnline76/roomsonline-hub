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
      const replacement = propertyName && key === "{{property_name}}" ? propertyName : value;
      html = html.split(key).join(replacement);
    }
    return DOMPurify.sanitize(html);
  }, [bodyHtml, propertyName]);

  const renderedSubject = useMemo(() => {
    let s = subject || "";
    for (const [key, value] of Object.entries(MOCK_DATA)) {
      const replacement = propertyName && key === "{{property_name}}" ? propertyName : value;
      s = s.split(key).join(replacement);
    }
    return s;
  }, [subject, propertyName]);

  const primaryColor = brandColors?.primary || "#1a1a2e";
  const secondaryColor = brandColors?.secondary || "#e8e8e8";
  const displayName = propertyName || "Sample Property";

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
          style={{ maxHeight: 480, overflowY: "auto", backgroundColor: "#f4f4f4" }}
        >
          {/* Email header */}
          <div
            className="px-6 py-4 text-white"
            style={{ backgroundColor: primaryColor }}
          >
            {logoUrl && (
              <img src={logoUrl} alt={displayName} className="h-8 mb-2 object-contain" />
            )}
            <div className="font-semibold text-base">{renderedSubject || "Subject line preview"}</div>
            <div className="opacity-70 text-xs mt-1">To: jane@example.com</div>
          </div>

          {/* Email body */}
          <div
            className="mx-4 my-4 bg-card rounded-md shadow-sm p-6 text-sm"
            style={{
              fontFamily: "Arial, sans-serif",
              color: brandColors?.font || "#333",
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml || '<p style="color:#999">Email body will appear here…</p>' }}
          />

          {/* Footer */}
          <div
            className="px-6 py-3 text-center text-xs"
            style={{ color: "#666", borderTop: `2px solid ${secondaryColor}` }}
          >
            © {new Date().getFullYear()} {displayName}. All rights reserved.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
