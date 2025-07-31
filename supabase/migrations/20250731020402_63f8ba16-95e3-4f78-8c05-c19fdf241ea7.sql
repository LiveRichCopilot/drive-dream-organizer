-- Create table to store video analysis results
CREATE TABLE public.video_analysis_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  google_drive_file_id TEXT NOT NULL UNIQUE,
  file_name TEXT,
  original_date TIMESTAMP WITH TIME ZONE,
  description TEXT,
  detailed_description TEXT,
  video_type TEXT,
  scenes JSONB,
  visual_style JSONB,
  subjects JSONB,
  camera_work TEXT,
  veo3_prompts JSONB,
  analysis_confidence DECIMAL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.video_analysis_cache ENABLE ROW LEVEL SECURITY;

-- Create policy allowing everyone to read/write (since no user auth yet)
CREATE POLICY "Anyone can access video analysis cache" 
ON public.video_analysis_cache 
FOR ALL 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_video_analysis_cache_updated_at
BEFORE UPDATE ON public.video_analysis_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for fast lookups
CREATE INDEX idx_video_analysis_cache_google_drive_file_id 
ON public.video_analysis_cache(google_drive_file_id);