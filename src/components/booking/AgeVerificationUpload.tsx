import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Upload, Camera } from "lucide-react";
import { toast } from "sonner";

interface AgeVerificationUploadProps {
  special: {
    name: string;
    min_age: number | null;
    max_age: number | null;
    age_label: string | null;
    discount_percent?: number | null;
  };
  propertyId: string;
  onVerified: (eligible: boolean) => void;
}

export function AgeVerificationUpload({ special, propertyId, onVerified }: AgeVerificationUploadProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "verifying" | "eligible" | "ineligible">("idle");
  const [extractedAge, setExtractedAge] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (photo of your ID)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum 10MB.");
      return;
    }

    setStatus("uploading");

    const storagePath = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("id-verifications")
      .upload(storagePath, file, { contentType: file.type });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      toast.error("Failed to upload document");
      setStatus("idle");
      return;
    }

    setStatus("verifying");

    try {
      const { data, error } = await supabase.functions.invoke("verify-age-document", {
        body: {
          storagePath,
          minAge: special.min_age,
          maxAge: special.max_age,
        },
      });

      if (error) {
        console.error("Verification error:", error);
        toast.error("Verification failed. Please try again.");
        setStatus("idle");
        return;
      }

      if (data.eligible) {
        setExtractedAge(data.extractedAge);
        setStatus("eligible");
        toast.success(`Age verified! ${special.age_label || "Discount"} applied.`);
        onVerified(true);
      } else {
        setExtractedAge(data.extractedAge);
        setStatus("ineligible");
        toast.error(data.error || "Age requirement not met");
        onVerified(false);
      }
    } catch (err) {
      console.error("Verification error:", err);
      toast.error("Verification failed");
      setStatus("idle");
    }
  };

  const label = special.age_label || "Age-based";

  if (status === "eligible") {
    return (
      <div className="border border-green-300 bg-green-50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-medium text-green-800">
              {label} discount verified!
            </p>
            <p className="text-xs text-green-600">
              Age {extractedAge} confirmed — discount applied
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "ineligible") {
    return (
      <div className="border border-red-300 bg-red-50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-800">
              Age requirement not met
            </p>
            <p className="text-xs text-red-600">
              {special.min_age ? `Minimum age: ${special.min_age}` : ""}
              {special.min_age && special.max_age ? " · " : ""}
              {special.max_age ? `Maximum age: ${special.max_age}` : ""}
              {extractedAge ? ` · Detected age: ${extractedAge}` : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-dashed border-primary/40 bg-primary/5 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <span className="text-lg">🎂</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-primary">
            {label} discount available
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload a photo of your ID or driver's license to verify your age and claim this discount
          </p>

          {(status === "uploading" || status === "verifying") ? (
            <div className="flex items-center gap-2 mt-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">
                {status === "uploading" ? "Uploading document..." : "Verifying age..."}
              </span>
            </div>
          ) : (
            <div className="flex gap-2 mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3" /> Upload ID
              </Button>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-1.5">
            Your document is scanned securely and deleted immediately after verification
          </p>
        </div>
      </div>
    </div>
  );
}
