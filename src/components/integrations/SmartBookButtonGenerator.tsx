import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { Sparkles, Globe, Code2, Puzzle, LayoutTemplate, Eye } from "lucide-react";

const PRODUCTION_DOMAIN = "https://sleepinafrica.roomsonline.co.za";

interface SmartBookButtonGeneratorProps {
  property: {
    id: string;
    name: string;
    slug: string;
    brand_primary_color: string | null;
  };
}

type Platform = "html" | "wordpress" | "wix" | "squarespace";
type ButtonSize = "small" | "medium" | "large";
type ButtonStyle = "solid" | "outline" | "pill";

const PLATFORMS: { value: Platform; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "html", label: "Custom HTML", icon: <Code2 className="h-5 w-5" />, desc: "Any website with HTML access" },
  { value: "wordpress", label: "WordPress", icon: <Puzzle className="h-5 w-5" />, desc: "Self-hosted or WordPress.com" },
  { value: "wix", label: "Wix", icon: <LayoutTemplate className="h-5 w-5" />, desc: "Wix Editor or Wix Studio" },
  { value: "squarespace", label: "Squarespace", icon: <Globe className="h-5 w-5" />, desc: "Squarespace page builder" },
];

const SIZE_MAP: Record<ButtonSize, { padding: string; fontSize: string; label: string }> = {
  small: { padding: "8px 16px", fontSize: "14px", label: "Small" },
  medium: { padding: "12px 24px", fontSize: "16px", label: "Medium" },
  large: { padding: "16px 32px", fontSize: "18px", label: "Large" },
};

const STYLE_MAP: Record<ButtonStyle, string> = {
  solid: "Solid",
  outline: "Outline",
  pill: "Pill",
};

export function SmartBookButtonGenerator({ property }: SmartBookButtonGeneratorProps) {
  const defaultColor = property.brand_primary_color || "#e91e8c";

  const [platform, setPlatform] = useState<Platform>("html");
  const [buttonText, setButtonText] = useState("Book Now");
  const [buttonColor, setButtonColor] = useState(defaultColor);
  const [buttonSize, setButtonSize] = useState<ButtonSize>("medium");
  const [buttonStyle, setButtonStyle] = useState<ButtonStyle>("solid");
  const [openNewTab, setOpenNewTab] = useState(true);

  const bookingUrl = `${PRODUCTION_DOMAIN}/book/${property.slug}`;
  const target = openNewTab ? ' target="_blank" rel="noopener noreferrer"' : "";
  const size = SIZE_MAP[buttonSize];

  const inlineStyles = useMemo(() => {
    const base = `display:inline-block;font-family:inherit;font-weight:600;text-decoration:none;text-align:center;cursor:pointer;transition:opacity 0.2s;padding:${size.padding};font-size:${size.fontSize};`;
    switch (buttonStyle) {
      case "solid":
        return `${base}background-color:${buttonColor};color:#ffffff;border:none;border-radius:6px;`;
      case "outline":
        return `${base}background-color:transparent;color:${buttonColor};border:2px solid ${buttonColor};border-radius:6px;`;
      case "pill":
        return `${base}background-color:${buttonColor};color:#ffffff;border:none;border-radius:9999px;`;
    }
  }, [buttonColor, buttonStyle, size]);

  const htmlSnippet = `<a href="${bookingUrl}"${target} style="${inlineStyles}">${buttonText}</a>`;

  const generatedCode = useMemo(() => {
    switch (platform) {
      case "html":
        return htmlSnippet;

      case "wordpress":
        return `<!-- Option 1: Paste this in a Custom HTML block (Gutenberg) or Text widget -->
${htmlSnippet}

<!-- Option 2: Use as a shortcode — add this to your theme's functions.php -->
<?php
function rolos_book_button_shortcode() {
    return '${htmlSnippet.replace(/'/g, "\\'")}';
}
add_shortcode('rolos_button', 'rolos_book_button_shortcode');
?>

<!-- Then use [rolos_button] anywhere in your posts/pages -->`;

      case "wix":
        return htmlSnippet;

      case "squarespace":
        return htmlSnippet;
    }
  }, [platform, htmlSnippet]);

  const platformInstructions = useMemo(() => {
    switch (platform) {
      case "html":
        return "Paste the code snippet below anywhere in your HTML where you want the button to appear.";
      case "wordpress":
        return "Option 1: Add a \"Custom HTML\" block in the Gutenberg editor and paste the HTML. Option 2: Add the PHP shortcode to your theme's functions.php, then use [rolos_button] in any post or page.";
      case "wix":
        return "In the Wix Editor, click \"Add\" → \"Embed Code\" → \"Embed HTML\". Paste the code below into the HTML field. Resize the embed container to fit the button.";
      case "squarespace":
        return "In the Squarespace page editor, add a \"Code Block\" (not Markdown). Paste the code below. Uncheck \"Display Source\" if checked. The button will appear inline.";
    }
  }, [platform]);

  // Live preview styles
  const previewStyle: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
      display: "inline-block",
      fontWeight: 600,
      textDecoration: "none",
      textAlign: "center",
      cursor: "pointer",
      transition: "opacity 0.2s",
      padding: size.padding,
      fontSize: size.fontSize,
      fontFamily: "inherit",
    };
    switch (buttonStyle) {
      case "solid":
        return { ...base, backgroundColor: buttonColor, color: "#ffffff", border: "none", borderRadius: "6px" };
      case "outline":
        return { ...base, backgroundColor: "transparent", color: buttonColor, border: `2px solid ${buttonColor}`, borderRadius: "6px" };
      case "pill":
        return { ...base, backgroundColor: buttonColor, color: "#ffffff", border: "none", borderRadius: "9999px" };
    }
  }, [buttonColor, buttonStyle, size]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">Smart Book Button Generator</h3>
              <p className="text-sm text-muted-foreground">
                Generate a platform-specific "Book Now" button for <strong>{property.name}</strong>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Left: Configuration */}
        <div className="space-y-5">
          {/* Step 1: Platform */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">1</Badge>
                Website Platform
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all ${
                      platform === p.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                  >
                    <div className={`shrink-0 ${platform === p.value ? "text-primary" : "text-muted-foreground"}`}>
                      {p.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">{p.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{p.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Customize */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">2</Badge>
                Customize Button
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Button text */}
              <div className="space-y-1.5">
                <Label className="text-xs">Button Text</Label>
                <Input
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="Book Now"
                  className="h-9"
                />
              </div>

              {/* Color */}
              <div className="space-y-1.5">
                <Label className="text-xs">Button Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={buttonColor}
                    onChange={(e) => setButtonColor(e.target.value)}
                    className="h-9 w-9 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={buttonColor}
                    onChange={(e) => setButtonColor(e.target.value)}
                    className="h-9 font-mono text-xs flex-1"
                    placeholder="#e91e8c"
                  />
                </div>
              </div>

              {/* Size */}
              <div className="space-y-1.5">
                <Label className="text-xs">Size</Label>
                <RadioGroup value={buttonSize} onValueChange={(v) => setButtonSize(v as ButtonSize)} className="flex gap-3">
                  {(Object.entries(SIZE_MAP) as [ButtonSize, typeof SIZE_MAP[ButtonSize]][]).map(([key, val]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${
                        buttonSize === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <RadioGroupItem value={key} className="h-3 w-3" />
                      {val.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {/* Style */}
              <div className="space-y-1.5">
                <Label className="text-xs">Style</Label>
                <RadioGroup value={buttonStyle} onValueChange={(v) => setButtonStyle(v as ButtonStyle)} className="flex gap-3">
                  {(Object.entries(STYLE_MAP) as [ButtonStyle, string][]).map(([key, label]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${
                        buttonStyle === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <RadioGroupItem value={key} className="h-3 w-3" />
                      {label}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {/* Target */}
              <div className="space-y-1.5">
                <Label className="text-xs">Opens in</Label>
                <RadioGroup value={openNewTab ? "new" : "same"} onValueChange={(v) => setOpenNewTab(v === "new")} className="flex gap-3">
                  <label className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${openNewTab ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                    <RadioGroupItem value="new" className="h-3 w-3" />
                    New Tab
                  </label>
                  <label className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${!openNewTab ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                    <RadioGroupItem value="same" className="h-3 w-3" />
                    Same Tab
                  </label>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Preview + Output */}
        <div className="space-y-5">
          {/* Live Preview — all 3 styles side by side */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                Live Preview
              </CardTitle>
              <CardDescription className="text-xs">
                Click preview to test — links to <code className="bg-muted px-1 rounded text-[10px]">{bookingUrl}</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Preview on light background */}
              <div className="rounded-lg border border-dashed border-border bg-background p-6 mb-3">
                <p className="text-xs text-muted-foreground mb-3">On light background:</p>
                <div className="flex items-center justify-center min-h-[60px]">
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={previewStyle}
                  >
                    {buttonText || "Book Now"}
                  </a>
                </div>
              </div>
              {/* Preview on dark background */}
              <div className="rounded-lg border border-dashed border-border bg-zinc-900 p-6">
                <p className="text-xs text-zinc-400 mb-3">On dark background:</p>
                <div className="flex items-center justify-center min-h-[60px]">
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={previewStyle}
                  >
                    {buttonText || "Book Now"}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generated Code */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">3</Badge>
                Generated Code
                <Badge variant="outline" className="ml-auto text-[10px] font-normal">
                  {PLATFORMS.find((p) => p.value === platform)?.label}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                {platformInstructions}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeSnippetBlock
                code={generatedCode}
                language={platform === "wordpress" ? "php" : "html"}
                title={`${PLATFORMS.find((p) => p.value === platform)?.label} Code`}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
