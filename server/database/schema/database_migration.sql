-- Standardize canonical infant spatial columns
ALTER TABLE infants
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8) CHECK (latitude >= -90 AND latitude <= 90),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8) CHECK (longitude >= -180 AND longitude <= 180),
ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326),
ADD COLUMN IF NOT EXISTS is_location_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill canonical point geometry from persisted coordinates
UPDATE infants
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND location IS NULL;

-- Index the canonical point column
CREATE INDEX IF NOT EXISTS idx_infants_location ON infants USING GIST (location);
