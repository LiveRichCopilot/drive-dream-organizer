-- Create asset_categories table for storing AI analysis results
CREATE TABLE public.asset_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  categories TEXT[] DEFAULT '{}',
  scene_type TEXT,
  face_count INTEGER DEFAULT 0,
  confidence_score FLOAT DEFAULT 0.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is for asset organization)
CREATE POLICY "Asset categories are viewable by everyone" 
ON public.asset_categories 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert asset categories" 
ON public.asset_categories 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update asset categories" 
ON public.asset_categories 
FOR UPDATE 
USING (true);

-- Create index for better performance
CREATE INDEX idx_asset_categories_file_name ON public.asset_categories(file_name);
CREATE INDEX idx_asset_categories_scene_type ON public.asset_categories(scene_type);
CREATE INDEX idx_asset_categories_categories ON public.asset_categories USING GIN(categories);