import React, { useState, useEffect, KeyboardEvent } from "react";
import { Sparkles, Loader2, Send } from "lucide-react";
import { useAISearch } from "@/contexts/AISearchContext";

export function AISearchInput() {
  const [inputValue, setInputValue] = useState("");
  const { performAISearch, isLoading, isAISearchActive, aiQuery } = useAISearch();

  // Clear input when AI search is reset
  useEffect(() => {
    if (!isAISearchActive && aiQuery === '') {
      setInputValue('');
    }
  }, [isAISearchActive, aiQuery]);

  const handleSubmit = () => {
    if (inputValue.trim() && !isLoading) {
      performAISearch(inputValue.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Hide when AI search is already active
  if (isAISearchActive) return null;

  return (
    <div className="w-full sm:w-1/2 px-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        {/* External label - smaller text, left aligned */}
        <span className="text-white text-xs sm:text-sm drop-shadow-lg text-left shrink-0">
          <span className="hidden sm:inline">What are you dreaming of? </span>
          <span className="sm:hidden">Ask </span>
          <span className="font-bold">Carike</span>
          <span className="hidden sm:inline"> will help find it</span>
        </span>

        {/* Input field container */}
        <div className="relative w-full sm:flex-1">
          {/* Frosted glass container */}
          <div className="flex items-center gap-3 px-5 py-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg transition-all focus-within:bg-white/15 focus-within:border-white/30">
            {/* AI Icon */}
            <div className="flex-shrink-0">
              {isLoading ? (
                <Loader2 className="h-5 w-5 text-white/80 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5 text-white/80" />
              )}
            </div>

            {/* Input */}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="'romantic coastal escape with spa'..."
              disabled={isLoading}
              className="flex-1 bg-transparent text-white placeholder-white/60 text-sm sm:text-base outline-none disabled:opacity-50 min-w-0"
            />

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim() || isLoading}
              className="flex-shrink-0 p-2 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Search"
            >
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>

          {/* Subtle glow effect */}
          <div className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-xl opacity-50" />
        </div>
      </div>
    </div>
  );
}
