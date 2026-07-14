import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Clipboard, Wand2 } from "lucide-react";
import { toast } from "sonner";

interface GooglePlaceIdPastePopoverProps {
  onExtract: (placeId: string) => void;
}

/**
 * Extract a Google Place ID (ChIJ… token, `place_id=` param, or hex CID pair
 * `0x…:0x…`) from a Google Maps URL pasted by the user.
 */
function extractPlaceId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();

  // 1. Explicit place_id=… param (e.g. Places API URLs)
  const placeIdParam = s.match(/[?&#]place_id=([^&#\s]+)/i);
  if (placeIdParam?.[1]) return decodeURIComponent(placeIdParam[1]);

  // 2. Canonical ChIJ token in Google Maps data payload: …!1sChIJ…!…
  const chij = s.match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
  if (chij?.[1]) return chij[1];

  // 3. Hex CID pair — accepted as-is; downstream review sync handles these.
  const hexPair = s.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (hexPair?.[1]) return hexPair[1];

  // 4. Fallback: bare ChIJ token pasted directly.
  const bareChij = s.match(/\b(ChIJ[A-Za-z0-9_-]{10,})\b/);
  if (bareChij?.[1]) return bareChij[1];

  return null;
}

export function GooglePlaceIdPastePopover({ onExtract }: GooglePlaceIdPastePopoverProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next) {
      // Best-effort clipboard prefill; ignore denial silently.
      try {
        const text = await navigator.clipboard.readText();
        if (text && /google\.|maps|ChIJ|place_id=/i.test(text)) {
          setValue(text);
        }
      } catch {
        /* clipboard permission denied — user can paste manually */
      }
    } else {
      setValue("");
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text);
    } catch {
      toast.error("Clipboard access blocked — paste manually with Ctrl/Cmd+V.");
    }
  };

  const handleExtract = () => {
    const id = extractPlaceId(value);
    if (!id) {
      toast.error(
        "Couldn't find a Place ID in that URL — open the place page in Google Maps first, then copy the address bar URL."
      );
      return;
    }
    onExtract(id);
    toast.success("Google Place ID captured.");
    setOpen(false);
    setValue("");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Clipboard className="h-3 w-3" />
          Paste Google URL
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium mb-1">Paste your Google Maps URL</p>
            <ol className="text-[11px] text-muted-foreground list-decimal pl-4 space-y-0.5">
              <li>
                Open{" "}
                <a
                  href="https://www.google.com/maps"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  google.com/maps
                </a>{" "}
                and search your property.
              </li>
              <li>Click the result so the property panel opens on the left.</li>
              <li>
                Copy the full URL from the browser address bar (it contains{" "}
                <code className="text-[10px]">!1s0x…</code> or{" "}
                <code className="text-[10px]">place_id=</code>).
              </li>
              <li>Paste it below and click <strong>Extract</strong>.</li>
            </ol>
          </div>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://www.google.com/maps/place/…"
            className="text-xs min-h-[80px] font-mono"
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={handlePasteFromClipboard}
            >
              <Clipboard className="h-3 w-3" />
              Paste from clipboard
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setOpen(false);
                  setValue("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleExtract}
                disabled={!value.trim()}
              >
                <Wand2 className="h-3 w-3" />
                Extract
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
