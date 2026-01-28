-- Add review_sentiment JSONB column to properties table for TripAdvisor sentiment analysis
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS review_sentiment JSONB DEFAULT NULL;

-- Add index for efficient querying of properties with sentiment data
CREATE INDEX IF NOT EXISTS idx_properties_review_sentiment 
ON public.properties USING GIN (review_sentiment) 
WHERE review_sentiment IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.properties.review_sentiment IS 'TripAdvisor sentiment analysis: {overall_score, themes: {category: {score, mentions}}, top_quotes: []}';