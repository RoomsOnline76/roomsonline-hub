import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  onNewTag?: (tag: string) => void;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type and press Enter...",
  className,
  onNewTag,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputValue.trim()) {
      const filtered = suggestions.filter(
        (s) =>
          s.toLowerCase().includes(inputValue.toLowerCase()) &&
          !value.includes(s)
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
    }
  }, [inputValue, suggestions, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag]);
      // Check if this is a new tag not in suggestions
      if (!suggestions.includes(trimmedTag) && onNewTag) {
        onNewTag(trimmedTag);
      }
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    addTag(suggestion);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background min-h-[42px]">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 px-2 py-1">
            {tag}
            <X
              className="h-3 w-3 cursor-pointer hover:text-destructive"
              onClick={() => removeTag(tag)}
            />
          </Badge>
        ))}
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.trim() && filteredSuggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] border-0 p-0 h-6 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
          {filteredSuggestions.map((suggestion) => (
            <div
              key={suggestion}
              className="px-3 py-2 cursor-pointer hover:bg-muted text-sm"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
