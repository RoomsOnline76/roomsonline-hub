import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

interface HelpMarkdownRendererProps {
  content: string;
  className?: string;
}

export function HelpMarkdownRenderer({ content, className }: HelpMarkdownRendererProps) {
  const rendered = useMemo(() => {
    let html = content;

    // Process custom callout blocks (:::critical, :::warning, :::info)
    html = html.replace(
      /:::critical\n([\s\S]*?):::/g,
      '<div class="callout callout-critical">$1</div>'
    );
    html = html.replace(
      /:::warning\n([\s\S]*?):::/g,
      '<div class="callout callout-warning">$1</div>'
    );
    html = html.replace(
      /:::info\n([\s\S]*?):::/g,
      '<div class="callout callout-info">$1</div>'
    );

    // Headers
    html = html.replace(/^#### (.*$)/gm, '<h4 class="text-sm font-semibold mt-4 mb-2 text-foreground">$1</h4>');
    html = html.replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-5 mb-2 text-foreground">$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-6 mb-3 text-foreground border-b border-border pb-2">$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-6 mb-4 text-foreground">$1</h1>');

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="bg-muted rounded-md p-3 my-3 overflow-x-auto text-xs font-mono"><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground">$1</code>');

    // Tables
    html = html.replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(Boolean);
      if (cells.every(cell => cell.trim().match(/^[-:]+$/))) {
        return '<tr class="table-separator"></tr>';
      }
      const isHeader = !html.split(match)[0].includes('<table');
      const cellTag = isHeader ? 'th' : 'td';
      const cellClass = isHeader 
        ? 'px-3 py-2 text-left text-xs font-medium text-muted-foreground bg-muted/50' 
        : 'px-3 py-2 text-sm text-foreground border-t border-border';
      return `<tr>${cells.map(cell => `<${cellTag} class="${cellClass}">${cell.trim()}</${cellTag}>`).join('')}</tr>`;
    });
    
    // Wrap table rows
    const tableRegex = /(<tr>[\s\S]*?<\/tr>)+/g;
    html = html.replace(tableRegex, (match) => {
      const cleanMatch = match.replace(/<tr class="table-separator"><\/tr>/g, '');
      return `<table class="w-full border border-border rounded-md my-4 overflow-hidden">${cleanMatch}</table>`;
    });

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Lists - unordered
    html = html.replace(/^- (.*)$/gm, '<li class="ml-4 list-disc list-inside text-sm text-muted-foreground">$1</li>');
    html = html.replace(/(<li class="ml-4 list-disc.*?<\/li>\n?)+/g, '<ul class="my-2 space-y-1">$&</ul>');

    // Lists - ordered
    html = html.replace(/^\d+\. (.*)$/gm, '<li class="ml-4 list-decimal list-inside text-sm text-muted-foreground">$1</li>');
    
    // Checkboxes
    html = html.replace(/^✅ (.*)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-green-500">✅</span><span class="text-sm text-muted-foreground">$1</span></div>');
    html = html.replace(/^❌ (.*)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-red-500">❌</span><span class="text-sm text-muted-foreground">$1</span></div>');
    html = html.replace(/^⚠️ (.*)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-yellow-500">⚠️</span><span class="text-sm text-muted-foreground">$1</span></div>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');

    // Paragraphs - wrap remaining text blocks
    html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p class="text-sm text-muted-foreground leading-relaxed my-2">$1</p>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr class="my-4 border-border" />');

    return html;
  }, [content]);

  return (
    <div
      className={cn("help-markdown prose prose-sm max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
