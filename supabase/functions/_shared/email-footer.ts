// Shared property contact footer for outgoing emails.

export interface FooterContact {
  propertyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
}

/**
 * Render a small "Contact the property" HTML block. Returns an empty string
 * when no phone/email are known (so we never emit an empty box).
 */
export function renderContactFooterHtml(c: FooterContact): string {
  if (!c || (!c.contactEmail && !c.contactPhone)) return "";
  const name = c.propertyName || "the property";
  const parts: string[] = [];
  if (c.contactPhone) {
    parts.push(
      `<a href="tel:${escapeAttr(c.contactPhone)}" style="color:inherit;text-decoration:none;">${escapeHtml(
        c.contactPhone,
      )}</a>`,
    );
  }
  if (c.contactEmail) {
    parts.push(
      `<a href="mailto:${escapeAttr(c.contactEmail)}" style="color:inherit;text-decoration:none;">${escapeHtml(
        c.contactEmail,
      )}</a>`,
    );
  }
  if (c.websiteUrl) {
    parts.push(
      `<a href="${escapeAttr(c.websiteUrl)}" style="color:inherit;text-decoration:none;">${escapeHtml(
        c.websiteUrl.replace(/^https?:\/\//, ""),
      )}</a>`,
    );
  }
  return `
    <div style="margin:24px 0 0;padding:16px 20px;background:#fafafa;border-top:1px solid #ececec;border-radius:0 0 8px 8px;text-align:center;font-family:Arial,sans-serif;color:#666;font-size:12px;line-height:1.6;">
      <div style="margin:0 0 4px;color:#333;font-weight:600;">Contact ${escapeHtml(name)}</div>
      <div style="margin:0;">${parts.join(' &nbsp;·&nbsp; ')}</div>
    </div>
  `;
}

export function renderContactFooterText(c: FooterContact): string {
  if (!c || (!c.contactEmail && !c.contactPhone)) return "";
  const lines: string[] = [];
  lines.push(`Contact ${c.propertyName || "the property"}:`);
  if (c.contactPhone) lines.push(`  Phone: ${c.contactPhone}`);
  if (c.contactEmail) lines.push(`  Email: ${c.contactEmail}`);
  if (c.websiteUrl) lines.push(`  Web:   ${c.websiteUrl}`);
  return "\n" + lines.join("\n") + "\n";
}

/**
 * Append the contact footer to an HTML email body, just before </body> when
 * present; otherwise, append at the end.
 */
export function appendContactFooterHtml(html: string, c: FooterContact): string {
  const block = renderContactFooterHtml(c);
  if (!block) return html;
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${block}</body>`);
  }
  return html + block;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c],
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
