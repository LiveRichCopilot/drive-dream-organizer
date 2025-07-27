import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Atom type constants
const ATOM_TYPES = {
  FTYP: 0x66747970, // 'ftyp'
  MOOV: 0x6D6F6F76, // 'moov'
  MVHD: 0x6D766864, // 'mvhd'
  UDTA: 0x75647461, // 'udta'
  META: 0x6D657461, // 'meta'
  ILST: 0x696C7374, // 'ilst'
  KEYS: 0x6B657973, // 'keys'
  TRAK: 0x7472616B, // 'trak'
  TKHD: 0x746B6864, // 'tkhd'
};

// Apple metadata atom types
const APPLE_ATOMS = {
  DAY: 0xA9646179,   // '©day'
  XYZ: 0xA978797A,   // '©xyz'
  MAKE: 0xA96D616B,  // '©mak'
  MODEL: 0xA96D6F64, // '©mod'
  SOFTWARE: 0xA9737772, // '©swr'
};

interface AtomInfo {
  type: number;
  size: number;
  offset: number;
  dataOffset: number;
}

interface MetadataResult {
  originalDate?: string;
  gpsCoordinates?: { latitude: number; longitude: number };
  deviceInfo?: string;
  extractionMethod: string;
  confidence: 'high' | 'medium' | 'low';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId } = await req.json();
    
    if (!fileId) {
      return new Response(JSON.stringify({ error: 'File ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = authHeader.substring(7);
    console.log(`🎬 Starting robust metadata extraction for file: ${fileId}`);

    // Get file metadata from Google Drive
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType,createdTime,modifiedTime,videoMediaMetadata`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!metadataResponse.ok) {
      throw new Error(`Failed to fetch file metadata: ${metadataResponse.status}`);
    }

    const fileData = await metadataResponse.json();
    console.log(`📁 File: ${fileData.name} (${fileData.size} bytes)`);

    // Prepare response object
    const response = {
      fileId,
      fileName: fileData.name,
      fileSize: fileData.size,
      mimeType: fileData.mimeType,
      googleCreatedTime: fileData.createdTime,
      googleModifiedTime: fileData.modifiedTime,
      videoMetadata: fileData.videoMediaMetadata,
      originalDate: null as string | null,
      extractionMethod: 'none',
      confidence: 'low' as 'high' | 'medium' | 'low'
    };

    // Execute extraction strategies in priority order
    const strategies = [
      () => extractFromAtomStructure(fileId, accessToken, fileData.name, parseInt(fileData.size || '0')),
      () => extractFromFilename(fileData.name),
      () => inferFromSequence(fileData.name, fileId, accessToken),
      () => useGoogleDriveDates(fileData)
    ];

    let metadata: MetadataResult | null = null;

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`🔍 Trying extraction strategy ${i + 1}/${strategies.length}`);
        metadata = await strategies[i]();
        
        if (metadata?.originalDate) {
          console.log(`✅ Strategy ${i + 1} succeeded: ${metadata.extractionMethod}`);
          response.originalDate = metadata.originalDate;
          response.extractionMethod = metadata.extractionMethod;
          response.confidence = metadata.confidence;
          
          // Add additional metadata if available
          if (metadata.gpsCoordinates) {
            response.gpsCoordinates = metadata.gpsCoordinates;
          }
          if (metadata.deviceInfo) {
            response.deviceInfo = metadata.deviceInfo;
          }
          
          break;
        }
      } catch (error) {
        console.error(`❌ Strategy ${i + 1} failed:`, error.message);
        // Continue to next strategy
      }
    }

    if (!response.originalDate) {
      console.log('⚠️ All extraction strategies failed - this should not happen');
      response.extractionMethod = 'failed';
    }

    console.log(`🎯 Final result: ${response.originalDate ? 'SUCCESS' : 'FAILED'} (${response.extractionMethod})`);

    return new Response(JSON.stringify(response), {
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

async function extractFromAtomStructure(
  fileId: string, 
  accessToken: string, 
  fileName: string, 
  fileSize: number
): Promise<MetadataResult | null> {
  
  console.log(`🎬 Extracting metadata for ${fileName} (${fileSize} bytes)`);
  
  try {
    // CRITICAL: For MOV files, the moov atom is often at the END
    // Download BOTH beginning and end of file
    const chunks = [];
    
    // Get first 5MB
    const startSize = Math.min(5 * 1024 * 1024, fileSize);
    const startResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': `bytes=0-${startSize - 1}`
        }
      }
    );
    
    if (startResponse.ok) {
      chunks.push(new Uint8Array(await startResponse.arrayBuffer()));
    }
    
    // Get last 5MB (where iPhone often puts moov atom)
    if (fileSize > startSize) {
      const endSize = Math.min(5 * 1024 * 1024, fileSize);
      const endResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Range': `bytes=${fileSize - endSize}-${fileSize - 1}`
          }
        }
      );
      
      if (endResponse.ok) {
        chunks.push(new Uint8Array(await endResponse.arrayBuffer()));
      }
    }
    
    // Try to find metadata in each chunk
    for (const data of chunks) {
      const result = await parseQuickTimeAtoms(data);
      if (result?.originalDate) {
        console.log(`✅ Found creation date: ${result.originalDate}`);
        return result;
      }
    }
    
    console.log('❌ No metadata found in any chunks');
    return null;
    
  } catch (error) {
    console.error('💥 Extraction failed:', error);
    return null;
  }
}

// Simplified but WORKING QuickTime parser
async function parseQuickTimeAtoms(data: Uint8Array): Promise<MetadataResult | null> {
  let offset = 0;
  
  while (offset < data.length - 8) {
    // Read atom size and type
    const size = (data[offset] << 24) | (data[offset + 1] << 16) | 
                 (data[offset + 2] << 8) | data[offset + 3];
    const type = String.fromCharCode(data[offset + 4], data[offset + 5], 
                                     data[offset + 6], data[offset + 7]);
    
    console.log(`Found atom: ${type} at offset ${offset}, size ${size}`);
    
    if (size < 8 || offset + size > data.length) {
      offset += 8;
      continue;
    }
    
    // Found moov atom - parse it
    if (type === 'moov') {
      return parseMoovAtom(data, offset + 8, size - 8);
    }
    
    offset += size;
  }
  
  return null;
}

function parseMoovAtom(data: Uint8Array, moovStart: number, moovSize: number): MetadataResult | null {
  let offset = moovStart;
  const moovEnd = moovStart + moovSize;
  
  while (offset < moovEnd - 8) {
    const size = (data[offset] << 24) | (data[offset + 1] << 16) | 
                 (data[offset + 2] << 8) | data[offset + 3];
    const type = String.fromCharCode(data[offset + 4], data[offset + 5], 
                                     data[offset + 6], data[offset + 7]);
    
    if (size < 8 || offset + size > moovEnd) break;
    
    // Found mvhd atom - this has creation time!
    if (type === 'mvhd') {
      const version = data[offset + 8];
      const creationTimeOffset = offset + 12; // After 8-byte header + 4-byte version/flags
      
      let timestamp;
      if (version === 0) {
        // 32-bit timestamp
        timestamp = (data[creationTimeOffset] << 24) >>> 0 | 
                   (data[creationTimeOffset + 1] << 16) | 
                   (data[creationTimeOffset + 2] << 8) | 
                   data[creationTimeOffset + 3];
      } else {
        // 64-bit timestamp - skip high bytes for dates after 2001
        timestamp = (data[creationTimeOffset + 4] << 24) >>> 0 | 
                   (data[creationTimeOffset + 5] << 16) | 
                   (data[creationTimeOffset + 6] << 8) | 
                   data[creationTimeOffset + 7];
      }
      
      // Convert from Mac epoch (1904) to Unix epoch (1970)
      // Mac epoch starts at Jan 1, 1904 00:00:00
      // Unix epoch starts at Jan 1, 1970 00:00:00
      // Difference is 2082844800 seconds
      const unixTimestamp = timestamp - 2082844800;
      const date = new Date(unixTimestamp * 1000);
      
      console.log(`Raw timestamp: ${timestamp}`);
      console.log(`Unix timestamp: ${unixTimestamp}`);
      console.log(`Parsed date: ${date.toISOString()}`);
      
      // Validate the date
      if (date.getFullYear() >= 2000 && date.getFullYear() <= 2025) {
        return {
          originalDate: date.toISOString(),
          extractionMethod: 'mvhd-atom',
          confidence: 'high'
        };
      }
    }
    
    offset += size;
  }
  
  return null;
}

// Remove old broken parsing functions - we're using the working parser above

async function extractFromFilename(fileName: string): Promise<MetadataResult | null> {
  console.log(`📝 Trying filename extraction: ${fileName}`);
  
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
          return {
            originalDate: date.toISOString(),
            extractionMethod: 'filename-pattern',
            confidence: 'medium'
          };
        }
      } catch (error) {
        console.error('Error parsing filename date:', error);
      }
    }
  }
  
  return null;
}

async function inferFromSequence(fileName: string, fileId: string, accessToken: string): Promise<MetadataResult | null> {
  console.log(`🔢 Trying sequence inference: ${fileName}`);
  
  const imgMatch = fileName.match(/IMG_(\d{4,})/);
  if (!imgMatch) {
    return null;
  }
  
  const sequenceNumber = parseInt(imgMatch[1]);
  
  try {
    // Search for similar files in the same folder
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!fileResponse.ok) {
      throw new Error('Failed to get parent folder');
    }
    
    const fileData = await fileResponse.json();
    const parentId = fileData.parents?.[0];
    
    const searchQuery = parentId 
      ? `name contains 'IMG_' and '${parentId}' in parents`
      : "name contains 'IMG_'";
    
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,modifiedTime)&pageSize=100`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!searchResponse.ok) {
      throw new Error('Failed to search for sequence files');
    }
    
    const searchData = await searchResponse.json();
    const sequences: Array<{number: number, date: Date}> = [];
    
    for (const file of searchData.files || []) {
      const match = file.name.match(/IMG_(\d{4,})/);
      if (match && file.modifiedTime) {
        const seqNum = parseInt(match[1]);
        const date = new Date(file.modifiedTime);
        
        // Only include files with reasonable dates (not future dates)
        if (date <= new Date() && date.getFullYear() >= 2020) {
          sequences.push({ number: seqNum, date });
        }
      }
    }
    
    if (sequences.length >= 2) {
      sequences.sort((a, b) => a.number - b.number);
      
      // Find surrounding sequences or closest neighbors
      let beforeSeq = null;
      let afterSeq = null;
      
      for (const seq of sequences) {
        if (seq.number < sequenceNumber) {
          beforeSeq = seq;
        } else if (seq.number > sequenceNumber && !afterSeq) {
          afterSeq = seq;
          break;
        }
      }
      
      // If we have both before and after, interpolate
      if (beforeSeq && afterSeq) {
        const ratio = (sequenceNumber - beforeSeq.number) / (afterSeq.number - beforeSeq.number);
        const timeDiff = afterSeq.date.getTime() - beforeSeq.date.getTime();
        const interpolatedTime = beforeSeq.date.getTime() + (timeDiff * ratio);
        const interpolatedDate = new Date(interpolatedTime);
        
        // Sanity check - don't return future dates
        if (interpolatedDate <= new Date() && interpolatedDate.getFullYear() >= 2020) {
          console.log(`📊 Interpolated between IMG_${beforeSeq.number} (${beforeSeq.date.toISOString()}) and IMG_${afterSeq.number} (${afterSeq.date.toISOString()})`);
          return {
            originalDate: interpolatedDate.toISOString(),
            extractionMethod: 'sequence-interpolation',
            confidence: 'medium'
          };
        }
      }
      
      // If we only have before sequence, use it as reference
      if (beforeSeq && !afterSeq) {
        // Use the most recent date from before sequences
        console.log(`📊 Using closest before sequence IMG_${beforeSeq.number} (${beforeSeq.date.toISOString()})`);
        return {
          originalDate: beforeSeq.date.toISOString(),
          extractionMethod: 'sequence-approximation',
          confidence: 'low'
        };
      }
      
      // If we only have after sequence, use it as reference  
      if (afterSeq && !beforeSeq) {
        console.log(`📊 Using closest after sequence IMG_${afterSeq.number} (${afterSeq.date.toISOString()})`);
        return {
          originalDate: afterSeq.date.toISOString(),
          extractionMethod: 'sequence-approximation',
          confidence: 'low'
        };
      }
    }
    
  } catch (error) {
    console.error('Sequence inference failed:', error);
  }
  
  return null;
}

function useGoogleDriveDates(fileData: any): MetadataResult {
  console.log(`📅 Using Google Drive dates as fallback`);
  
  // Prefer modifiedTime over createdTime for videos
  const dateToUse = fileData.modifiedTime || fileData.createdTime;
  
  return {
    originalDate: dateToUse,
    extractionMethod: 'google-drive-fallback',
    confidence: 'low'
  };
}