import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId } = await req.json();
    const authHeader = req.headers.get('Authorization');
    const accessToken = authHeader?.substring(7);

    if (!fileId || !accessToken) {
      return new Response(JSON.stringify({ error: 'File ID and authorization required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🎬 Using ExifTool API for metadata extraction: ${fileId}`);

    // Get file info from Google Drive
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,createdTime,modifiedTime`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file info: ${fileResponse.status}`);
    }
    
    const fileData = await fileResponse.json();
    console.log(`📁 File: ${fileData.name} (${fileData.size} bytes)`);
    
    // Try ExifTool API for metadata extraction
    try {
      const driveFileUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      
      const metadataResponse = await fetch('https://exiftool.app/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: driveFileUrl,
          auth: `Bearer ${accessToken}`
        })
      });

      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();
        console.log('📊 ExifTool metadata:', Object.keys(metadata));
        
        // Extract the creation date from various possible fields
        const creationDate = 
          metadata.CreateDate || 
          metadata.DateTimeOriginal || 
          metadata.MediaCreateDate ||
          metadata.TrackCreateDate ||
          metadata.CreationDate ||
          metadata['Date/Time Original'];
        
        if (creationDate) {
          console.log(`✅ Found original date: ${creationDate}`);
          return new Response(JSON.stringify({
            fileId,
            fileName: fileData.name,
            fileSize: fileData.size,
            originalDate: creationDate,
            extractionMethod: 'exiftool-api',
            confidence: 'high',
            allMetadata: metadata
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        console.log('⚠️ ExifTool API failed, trying fallback methods');
      }
    } catch (error) {
      console.error('❌ ExifTool API error:', error.message);
    }
    
    // Fallback to filename pattern extraction
    const filenameDate = extractFromFilename(fileData.name);
    if (filenameDate) {
      console.log(`✅ Extracted from filename: ${filenameDate}`);
      return new Response(JSON.stringify({
        fileId,
        fileName: fileData.name,
        fileSize: fileData.size,
        originalDate: filenameDate,
        extractionMethod: 'filename-pattern',
        confidence: 'medium'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Final fallback to Google Drive dates
    console.log(`📅 Using Google Drive fallback date`);
    const fallbackDate = fileData.modifiedTime || fileData.createdTime;
    
    return new Response(JSON.stringify({
      fileId,
      fileName: fileData.name,
      fileSize: fileData.size,
      originalDate: fallbackDate,
      extractionMethod: 'google-drive-fallback',
      confidence: 'low'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in metadata extraction:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractFromFilename(fileName: string): string | null {
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})[-_](\d{2})[-:](\d{2})[-:](\d{2})/,
    /(\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})/,
    /(\d{4})[-_](\d{2})[-_](\d{2})[-_](\d{2})[-_](\d{2})[-_](\d{2})/,
  ];
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      try {
        const [, year, month, day, hour, minute, second] = match;
        const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.000Z`);
        
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
          return date.toISOString();
        }
      } catch (error) {
        console.error('Error parsing filename date:', error);
      }
    }
  }
  
  return null;
}