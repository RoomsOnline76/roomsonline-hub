import { useRef, useState, useEffect } from "react";
import SignaturePad from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Undo2, Trash2, Upload, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignatureCanvasProps {
  onSignatureChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

export function SignatureCanvas({ onSignatureChange, disabled = false }: SignatureCanvasProps) {
  const sigPadRef = useRef<SignaturePad>(null);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (sigPadRef.current) {
        const canvas = sigPadRef.current.getCanvas();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d")?.scale(ratio, ratio);
        sigPadRef.current.clear();
      }
    };

    window.addEventListener("resize", handleResize);
    // Initial setup
    setTimeout(handleResize, 100);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleClear = () => {
    if (mode === "draw" && sigPadRef.current) {
      sigPadRef.current.clear();
      setIsEmpty(true);
      onSignatureChange(null);
    } else if (mode === "upload") {
      setUploadedImage(null);
      onSignatureChange(null);
    }
  };

  const handleEnd = () => {
    if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
      setIsEmpty(false);
      const dataUrl = sigPadRef.current.getTrimmedCanvas().toDataURL("image/png");
      onSignatureChange(dataUrl);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return;
    }

    if (file.size > 1024 * 1024) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImage(dataUrl);
      onSignatureChange(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleModeChange = (newMode: string) => {
    setMode(newMode as "draw" | "upload");
    // Clear the other mode's data
    if (newMode === "draw") {
      setUploadedImage(null);
      if (!sigPadRef.current?.isEmpty()) {
        const dataUrl = sigPadRef.current?.getTrimmedCanvas().toDataURL("image/png");
        onSignatureChange(dataUrl || null);
      } else {
        onSignatureChange(null);
      }
    } else {
      if (sigPadRef.current) {
        sigPadRef.current.clear();
        setIsEmpty(true);
      }
      onSignatureChange(uploadedImage);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Signature</Label>
        <Tabs value={mode} onValueChange={handleModeChange} className="w-auto">
          <TabsList className="h-8">
            <TabsTrigger value="draw" className="h-6 text-xs gap-1 px-2">
              <Pencil className="h-3 w-3" />
              Draw
            </TabsTrigger>
            <TabsTrigger value="upload" className="h-6 text-xs gap-1 px-2">
              <Upload className="h-3 w-3" />
              Upload
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === "draw" && (
        <div className="space-y-2">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg bg-white relative",
              disabled ? "opacity-50 pointer-events-none" : "border-muted-foreground/30 hover:border-primary/50",
              "touch-none"
            )}
            style={{ height: "200px" }}
          >
            <SignaturePad
              ref={sigPadRef}
              canvasProps={{
                className: "w-full h-full rounded-lg",
                style: { touchAction: "none" },
              }}
              onEnd={handleEnd}
              penColor="black"
              minWidth={1}
              maxWidth={2.5}
            />
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-muted-foreground text-sm">
                  Draw your signature here
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={disabled || isEmpty}
              className="h-7 text-xs gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {mode === "upload" && (
        <div className="space-y-2">
          {!uploadedImage ? (
            <label
              className={cn(
                "border-2 border-dashed rounded-lg bg-muted/30 flex flex-col items-center justify-center cursor-pointer",
                disabled ? "opacity-50 pointer-events-none" : "hover:border-primary/50",
              )}
              style={{ height: "200px" }}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Click to upload signature image</p>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or SVG (max 1MB)</p>
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={disabled}
              />
            </label>
          ) : (
            <div className="relative">
              <div
                className="border rounded-lg bg-white flex items-center justify-center overflow-hidden"
                style={{ height: "200px" }}
              >
                <img
                  src={uploadedImage}
                  alt="Uploaded signature"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={disabled}
                className="absolute top-2 right-2 h-7 text-xs gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
