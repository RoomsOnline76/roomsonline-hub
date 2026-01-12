-- Add show_on_website column to control public visibility
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN DEFAULT false;

-- Index for efficient filtering on public pages
CREATE INDEX IF NOT EXISTS idx_properties_show_on_website 
ON properties (show_on_website) WHERE is_active = true;

-- Comment for clarity
COMMENT ON COLUMN properties.show_on_website IS 
'Controls visibility on public book/home pages. Only admin/dev can toggle. Default OFF.';