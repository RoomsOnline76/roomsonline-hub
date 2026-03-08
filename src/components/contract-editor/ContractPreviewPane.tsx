import { useState } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  VariablesSchema,
  renderContractWithVariables,
} from "@/hooks/useContractTemplates";

interface ContractPreviewPaneProps {
  content: string;
  schema: VariablesSchema;
}

// Sample property data for preview
const SAMPLE_DATA: Record<string, string> = {
  property_name: "The Grand Estate Hotel",
  property_address: "123 Main Street",
  property_city: "Cape Town",
  owner_email: "owner@example.com",
  owner_name: "John Smith",
  commission_rate: "10%",
  commission_percentage: "ten percent (10%)",
  effective_date: new Date().toLocaleDateString(),
};

export function ContractPreviewPane({
  content,
  schema,
}: ContractPreviewPaneProps) {
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>(
    () => {
      // Initialize with sample data or defaults from schema
      const initial: Record<string, string> = {};
      Object.entries(schema).forEach(([key, config]) => {
        initial[key] =
          SAMPLE_DATA[key] ||
          config.default ||
          `[${key}]`;
      });
      return initial;
    }
  );

  const handleVariableChange = (key: string, value: string) => {
    setPreviewVariables((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const renderedContent = renderContractWithVariables(content, previewVariables);

  // Simple markdown to HTML conversion for preview
  const renderMarkdown = (md: string) => {
    let html = md
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      // Line breaks
      .replace(/\n/gim, '<br/>')
      // Lists
      .replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ml-4">$1</li>')
      // Horizontal rule
      .replace(/^---$/gim, '<hr class="my-4 border-border"/>');

    return html;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Variable Inputs */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Preview Variables</CardTitle>
          <p className="text-sm text-muted-foreground">
            Adjust values to see how the contract renders
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(schema).map(([key, config]) => (
            <div key={key}>
              <Label className="text-sm">
                {key.replace(/_/g, " ")}
                {config.required && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              <Input
                value={previewVariables[key] || ""}
                onChange={(e) => handleVariableChange(key, e.target.value)}
                placeholder={config.default || `Enter ${key}`}
                className="mt-1"
              />
              {config.description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {config.description}
                </p>
              )}
            </div>
          ))}

          {Object.keys(schema).length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No variables declared. Add variables in the Variables tab.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Contract Preview</CardTitle>
          <p className="text-sm text-muted-foreground">
            Live preview of how the contract will appear
          </p>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-6 bg-white dark:bg-gray-950 min-h-[500px]">
            {content ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(renderedContent) }}
              />
            ) : (
              <div className="text-center text-muted-foreground py-12">
                <p>No content to preview.</p>
                <p className="text-sm">Add content in the Editor tab.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
