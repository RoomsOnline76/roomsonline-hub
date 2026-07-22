import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CodeSnippetBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeSnippetBlock({ code, language = "html", title }: CodeSnippetBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-full min-w-0 rounded-lg border border-border overflow-hidden">
      {title && (
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-muted/50 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground truncate">{title}</span>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 shrink-0 gap-1.5 text-xs">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      <pre className="p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm bg-muted/30 max-w-full whitespace-pre-wrap break-all">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}
