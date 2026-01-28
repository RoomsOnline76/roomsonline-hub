-- Phase 3: Create local_experiences and brochure_templates tables

-- Create local_experiences table for property-specific curated content
CREATE TABLE public.local_experiences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) CHECK (category IN ('nature', 'culture', 'food', 'adventure', 'relaxation', 'wellness')),
  distance_km DECIMAL(5,2),
  duration_hours DECIMAL(4,2),
  price_indicator VARCHAR(20) CHECK (price_indicator IN ('free', 'budget', 'moderate', 'luxury')),
  image_url VARCHAR(500),
  booking_link VARCHAR(500),
  why_locals_love_it TEXT,
  best_time VARCHAR(100),
  display_order INTEGER DEFAULT 0,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'ai_generated', 'pms_sync')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for property lookup
CREATE INDEX idx_local_experiences_property ON public.local_experiences(property_id);
CREATE INDEX idx_local_experiences_active ON public.local_experiences(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.local_experiences ENABLE ROW LEVEL SECURITY;

-- RLS policies for local_experiences
CREATE POLICY "Anyone can view active experiences"
  ON public.local_experiences FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage all experiences"
  ON public.local_experiences FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- Create brochure_templates table for customizable brochure layouts
CREATE TABLE public.brochure_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sections JSONB DEFAULT '[
    {"id": "cover", "type": "cover", "enabled": true},
    {"id": "stay_details", "type": "details", "enabled": true},
    {"id": "experiences", "type": "experiences", "title": "Top 5 Local Experiences", "enabled": true},
    {"id": "dining", "type": "dining", "title": "Where to Eat", "enabled": true},
    {"id": "practical", "type": "practical", "title": "Getting There & Around", "enabled": true},
    {"id": "share", "type": "social", "title": "Share Your Journey", "enabled": true}
  ]'::jsonb,
  styles JSONB DEFAULT '{
    "primaryColor": "#e91e8c",
    "fontFamily": "Playfair Display",
    "accentColor": "#1a1a1a"
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for brochure_templates
ALTER TABLE public.brochure_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for brochure_templates
CREATE POLICY "Anyone can view templates"
  ON public.brochure_templates FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage templates"
  ON public.brochure_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- Insert default brochure template
INSERT INTO public.brochure_templates (name, is_default) VALUES ('Standard Journey', true);

-- Create trigger for updated_at on local_experiences
CREATE TRIGGER update_local_experiences_updated_at
  BEFORE UPDATE ON public.local_experiences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();