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
    <div className="rounded-lg border border-border overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1.5 text-xs">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-sm bg-muted/30">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}
