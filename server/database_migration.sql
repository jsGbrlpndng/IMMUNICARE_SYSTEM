-- Add geom column if it does not exist
ALTER TABLE infants ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

-- Create a spatial index for performance
CREATE INDEX IF NOT EXISTS infants_geom_idx ON infants USING GIST (geom);
