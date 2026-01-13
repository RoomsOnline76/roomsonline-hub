/**
 * Print utilities for Help documentation
 */

export interface PrintableArticle {
  title: string;
  content_markdown: string;
  impact_level?: string;
}

/**
 * Converts markdown content to print-ready HTML
 */
function renderMarkdownToHtml(content: string): string {
  let html = content;

  // Callouts (critical, warning, info)
  html = html.replace(/:::(critical)\s*([\s\S]*?):::/g, 
    '<div class="callout callout-critical"><strong>⚠️ Critical:</strong> $2</div>');
  html = html.replace(/:::(warning)\s*([\s\S]*?):::/g, 
    '<div class="callout callout-warning"><strong>⚡ Warning:</strong> $2</div>');
  html = html.replace(/:::(info)\s*([\s\S]*?):::/g, 
    '<div class="callout callout-info"><strong>ℹ️ Info:</strong> $2</div>');

  // Headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  // Code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Tables
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    if (cells.every(c => /^[-:]+$/.test(c.trim()))) {
      return ''; // Skip separator row
    }
    const isHeader = !html.includes('<tr>');
    const cellTag = isHeader ? 'th' : 'td';
    const cellsHtml = cells.map(c => `<${cellTag}>${c.trim()}</${cellTag}>`).join('');
    return `<tr>${cellsHtml}</tr>`;
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)+/g, '<table>$&</table>');

  // Lists
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Numbered lists
  html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Paragraphs
  html = html.replace(/^(?!<[huptl]|<div|<pre)(.+)$/gm, '<p>$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

/**
 * Generates print-ready HTML document
 */
function generatePrintHtml(title: string, content: string, sectionName?: string): string {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Rooms Online Help</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* Header */
    .print-header {
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .print-header h1 {
      font-size: 14pt;
      margin: 0 0 4px 0;
      color: #666;
    }
    .print-header h2 {
      font-size: 18pt;
      margin: 0 0 8px 0;
    }
    .print-header .date {
      font-size: 10pt;
      color: #666;
    }
    
    /* Content typography */
    h1 { font-size: 18pt; margin-top: 24px; }
    h2 { font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 12pt; margin-top: 16px; }
    
    p { margin: 8px 0; }
    
    ul, ol {
      padding-left: 24px;
      margin: 8px 0;
    }
    li { margin: 4px 0; }
    
    /* Callouts */
    .callout {
      padding: 12px 16px;
      margin: 12px 0;
      border-left: 4px solid;
      background: #f5f5f5;
    }
    .callout-critical {
      border-color: #dc2626;
      background: #fef2f2;
    }
    .callout-warning {
      border-color: #d97706;
      background: #fffbeb;
    }
    .callout-info {
      border-color: #2563eb;
      background: #eff6ff;
    }
    
    /* Code */
    pre {
      background: #f5f5f5;
      padding: 12px;
      overflow-x: auto;
      font-size: 10pt;
      border: 1px solid #ddd;
    }
    code.inline {
      background: #f0f0f0;
      padding: 2px 6px;
      font-size: 10pt;
    }
    
    /* Tables */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
    }
    
    /* Article separator */
    .article-separator {
      border-top: 1px dashed #ccc;
      margin: 32px 0;
      padding-top: 24px;
    }
    .article-title {
      font-size: 14pt;
      font-weight: 600;
      margin-bottom: 12px;
      color: #1a1a1a;
    }
    
    /* Print-specific */
    @media print {
      body { padding: 0; }
      .article-separator { page-break-before: auto; }
    }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>Rooms Online — Help Documentation</h1>
    <h2>${sectionName ? `Section: ${sectionName}` : title}</h2>
    <div class="date">Printed: ${date}</div>
  </div>
  <div class="print-content">
    ${content}
  </div>
</body>
</html>`;
}

/**
 * Print a single help article
 */
export function printHelpArticle(article: PrintableArticle): void {
  const htmlContent = renderMarkdownToHtml(article.content_markdown);
  const printHtml = generatePrintHtml(article.title, htmlContent);
  
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    
    // Wait for content to load before printing
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

/**
 * Print all articles in a section
 */
export function printHelpSection(sectionLabel: string, articles: PrintableArticle[]): void {
  if (articles.length === 0) return;
  
  const articlesHtml = articles.map((article, index) => {
    const content = renderMarkdownToHtml(article.content_markdown);
    const separator = index > 0 ? 'article-separator' : '';
    return `
      <div class="${separator}">
        <div class="article-title">${article.title}</div>
        ${content}
      </div>
    `;
  }).join('');
  
  const printHtml = generatePrintHtml(sectionLabel, articlesHtml, sectionLabel);
  
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}
