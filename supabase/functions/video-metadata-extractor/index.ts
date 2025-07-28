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

    console.log(`🎬 Starting real metadata extraction with download: ${fileId}`);

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
    
    // Download and parse video file with streaming for efficiency
    try {
      console.log(`⬇️ Streaming video file for metadata extraction...`);
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      
      const videoResponse = await fetch(downloadUrl, {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Range': 'bytes=0-1048575' // Only download first 1MB for metadata parsing
        }
      });

      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status}`);
      }

      // Read partial content for metadata parsing
      const buffer = await videoResponse.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      console.log(`📊 Downloaded ${buffer.byteLength} bytes, parsing QuickTime atoms...`);
      
      // Parse QuickTime/MP4 atoms for metadata
      const metadata = parseVideoMetadata(uint8Array, fileData.name);
      
      if (metadata.originalDate) {
        console.log(`✅ SUCCESS: Found embedded creation date: ${metadata.originalDate}`);
        return new Response(JSON.stringify({
          fileId,
          fileName: fileData.name,
          fileSize: fileData.size,
          originalDate: metadata.originalDate,
          extractionMethod: 'quicktime-atoms',
          confidence: 'high',
          allMetadata: metadata
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        console.log(`⚠️ No creation date found in QuickTime atoms`);
      }
    } catch (error) {
      console.error('❌ Video download/parse error:', error.message);
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

function parseVideoMetadata(data: Uint8Array, fileName: string): any {
  console.log(`🔍 Parsing metadata for ${fileName}`);
  
  try {
    // Look for QuickTime/MP4 atoms
    const metadata: any = {};
    let offset = 0;
    
    while (offset < Math.min(data.length, 1024 * 1024)) { // Only parse first 1MB
      if (offset + 8 > data.length) break;
      
      // Read atom size and type
      const atomSize = (data[offset] << 24) | (data[offset + 1] << 16) | 
                      (data[offset + 2] << 8) | data[offset + 3];
      const atomType = String.fromCharCode(data[offset + 4], data[offset + 5], 
                                          data[offset + 6], data[offset + 7]);
      
      if (atomSize < 8 || atomSize > data.length - offset) break;
      
      console.log(`📦 Found atom: ${atomType} (${atomSize} bytes)`);
      
      // Look for creation time in mvhd atom
      if (atomType === 'mvhd' && atomSize >= 32) {
        const creationTime = readMacTime(data, offset + 12);
        if (creationTime) {
          metadata.originalDate = creationTime;
          console.log(`📅 Found mvhd creation time: ${creationTime}`);
        }
      }
      
      // Look for metadata in udta atom
      if (atomType === 'udta') {
        parseUdtaAtom(data, offset + 8, atomSize - 8, metadata);
      }
      
      offset += atomSize;
    }
    
    return metadata;
    
  } catch (error) {
    console.error('Error parsing video metadata:', error);
    return {};
  }
}

function readMacTime(data: Uint8Array, offset: number): string | null {
  try {
    // Read 32-bit big-endian timestamp
    const macTime = (data[offset] << 24) | (data[offset + 1] << 16) | 
                   (data[offset + 2] << 8) | data[offset + 3];
    
    // Mac epoch starts Jan 1, 1904, Unix epoch starts Jan 1, 1970
    const macToUnixOffset = 2082844800;
    const unixTime = macTime - macToUnixOffset;
    
    if (unixTime > 0 && unixTime < Date.now() / 1000) {
      return new Date(unixTime * 1000).toISOString();
    }
  } catch (error) {
    console.error('Error reading Mac time:', error);
  }
  return null;
}

function parseUdtaAtom(data: Uint8Array, offset: number, size: number, metadata: any): void {
  let pos = offset;
  const end = offset + size;
  
  while (pos + 8 < end) {
    const atomSize = (data[pos] << 24) | (data[pos + 1] << 16) | 
                    (data[pos + 2] << 8) | data[pos + 3];
    const atomType = String.fromCharCode(data[pos + 4], data[pos + 5], 
                                        data[pos + 6], data[pos + 7]);
    
    if (atomSize < 8 || pos + atomSize > end) break;
    
    // Look for creation date in ©day atom
    if (atomType === '©day' && atomSize > 16) {
      try {
        const dateStr = String.fromCharCode(...data.slice(pos + 16, pos + atomSize));
        metadata.creationDateString = dateStr.trim();
        console.log(`📅 Found ©day: ${dateStr}`);
      } catch (error) {
        console.error('Error reading ©day atom:', error);
      }
    }
    
    pos += atomSize;
  }
}

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