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

    // Call the Cloud Run service for metadata extraction
    console.log(`🚀 Calling Cloud Run service for metadata extraction: ${fileId}`);
    
    const cloudRunUrl = 'https://video-metadata-service-226636967610.us-central1.run.app/extract';
    
    const serviceResponse = await fetch(cloudRunUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId: fileId,
        accessToken: accessToken
      })
    });

    if (!serviceResponse.ok) {
      const errorText = await serviceResponse.text();
      console.error(`Cloud Run service error: ${serviceResponse.status} - ${errorText}`);
      throw new Error(`Cloud Run service error: ${serviceResponse.status} - ${errorText}`);
    }

    const metadata = await serviceResponse.json();
    console.log(`✅ Metadata extraction complete:`, metadata);

    return new Response(JSON.stringify(metadata), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
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