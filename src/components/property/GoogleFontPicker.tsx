import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X } from "lucide-react";
import { loadGoogleFont } from "@/lib/brandFonts";

const POPULAR_FONTS = [
  "Playfair Display", "Lora", "Merriweather", "Cormorant Garamond", "Libre Baskerville",
  "EB Garamond", "Crimson Text", "Spectral", "Noto Serif", "Source Serif 4",
  "Inter", "Poppins", "Montserrat", "Raleway", "Open Sans",
  "Roboto", "Lato", "Nunito", "Work Sans", "DM Sans",
  "Manrope", "Space Grotesk", "Plus Jakarta Sans", "Outfit", "Sora",
  "Josefin Sans", "Karla", "Rubik", "Quicksand", "Mulish",
  "Oswald", "Bebas Neue", "Archivo", "Barlow", "Urbanist",
  "Cabin", "Lexend", "Figtree", "Geist", "Albert Sans",
  "Bitter", "Arvo", "Vollkorn", "Zilla Slab", "Cardo",
  "Abril Fatface", "Marcellus", "Bodoni Moda", "Fraunces", "Cormorant",
];

interface GoogleFontPickerProps {
  label: string;
  description: string;
  value: string | null;
  onChange: (font: string | null) => void;
}

export function GoogleFontPicker({ label, description, value, onChange }: GoogleFontPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load selected font for preview
  useEffect(() => {
    if (value) loadGoogleFont(value);
  }, [value]);

  const filtered = useMemo(() => {
    if (!search) return POPULAR_FONTS;
    const q = search.toLowerCase();
    return POPULAR_FONTS.filter((f) => f.toLowerCase().includes(q));
  }, [search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (font: string) => {
    loadGoogleFont(font);
    onChange(font);
    setSearch("");
    setOpen(false);
  };

  const isCustom = search.trim().length > 0 && !filtered.includes(search.trim());

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>

      <div className="relative">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search Google Fonts…"
            value={open ? search : value || ""}
            onFocus={() => { setOpen(true); setSearch(""); }}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            className="text-sm"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
            <ScrollArea className="max-h-56">
              <div className="p-1">
                {isCustom && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => handleSelect(search.trim())}
                  >
                    Use custom: <strong>{search.trim()}</strong>
                  </button>
                )}
                {filtered.map((font) => (
                  <button
                    key={font}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                    onClick={() => handleSelect(font)}
                    onMouseEnter={() => loadGoogleFont(font)}
                    style={{ fontFamily: `'${font}', sans-serif` }}
                  >
                    <span>{font}</span>
                    {value === font && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
                {filtered.length === 0 && !isCustom && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching fonts</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {value && (
        <div className="rounded-md border border-border p-3 mt-2">
          <p className="text-xs text-muted-foreground mb-1">Preview</p>
          <p className="text-lg" style={{ fontFamily: `'${value}', sans-serif` }}>
            The quick brown fox jumps over the lazy dog
          </p>
        </div>
      )}
    </div>
  );
}
