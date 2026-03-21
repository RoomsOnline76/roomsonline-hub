import { ReactNode } from "react";

interface WidgetPreviewFrameProps {
  title?: string;
  url?: string;
  children?: ReactNode;
  height?: number;
  showUrlBar?: boolean;
}

export function WidgetPreviewFrame({
  title = "Preview",
  url,
  children,
  height = 400,
  showUrlBar = true,
}: WidgetPreviewFrameProps) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-sm overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border-b border-border">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        {showUrlBar && (
          <div className="flex-1 ml-2">
            <div className="bg-background/80 border border-border rounded-md px-3 py-1 text-[11px] text-muted-foreground truncate font-mono">
              {url || title}
            </div>
          </div>
        )}
        {!showUrlBar && (
          <span className="text-xs font-medium text-muted-foreground ml-1">{title}</span>
        )}
      </div>
      {/* Content area */}
      <div style={{ height, minHeight: 200 }} className="overflow-auto bg-background">
        {children}
      </div>
    </div>
  );
}
