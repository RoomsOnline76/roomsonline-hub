import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AISearchState {
  aiQuery: string;
  aiResults: string[] | null; // matched property IDs
  aiExplanation: string | null;
  isAISearchActive: boolean;
  isLoading: boolean;
}

interface AISearchContextValue extends AISearchState {
  performAISearch: (query: string) => Promise<void>;
  resetAISearch: () => void;
}

const AISearchContext = createContext<AISearchContextValue | undefined>(undefined);

export function AISearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AISearchState>({
    aiQuery: '',
    aiResults: null,
    aiExplanation: null,
    isAISearchActive: false,
    isLoading: false,
  });

  const performAISearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setState(prev => ({
      ...prev,
      aiQuery: query,
      isLoading: true,
    }));

    try {
      const { data, error } = await supabase.functions.invoke('ai-property-search', {
        body: { query },
      });

      if (error) {
        console.error('AI search error:', error);
        toast({
          title: 'Search failed',
          description: error.message || 'Unable to complete TOBI search. Please try again.',
          variant: 'destructive',
        });
        setState(prev => ({
          ...prev,
          isLoading: false,
        }));
        return;
      }

      if (data.error) {
        toast({
          title: 'Search failed',
          description: data.error,
          variant: 'destructive',
        });
        setState(prev => ({
          ...prev,
          isLoading: false,
        }));
        return;
      }

      const { matched_property_ids, best_match_reason } = data;

      if (!matched_property_ids || matched_property_ids.length === 0) {
        toast({
          title: 'No matches found',
          description: 'Try a different search to find your perfect stay.',
        });
        setState(prev => ({
          ...prev,
          isLoading: false,
        }));
        return;
      }

      setState({
        aiQuery: query,
        aiResults: matched_property_ids,
        aiExplanation: best_match_reason,
        isAISearchActive: true,
        isLoading: false,
      });
    } catch (err) {
      console.error('AI search error:', err);
      toast({
        title: 'Search failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
      setState(prev => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, []);

  const resetAISearch = useCallback(() => {
    setState({
      aiQuery: '',
      aiResults: null,
      aiExplanation: null,
      isAISearchActive: false,
      isLoading: false,
    });
  }, []);

  return (
    <AISearchContext.Provider
      value={{
        ...state,
        performAISearch,
        resetAISearch,
      }}
    >
      {children}
    </AISearchContext.Provider>
  );
}

export function useAISearch() {
  const context = useContext(AISearchContext);
  if (!context) {
    throw new Error('useAISearch must be used within an AISearchProvider');
  }
  return context;
}
