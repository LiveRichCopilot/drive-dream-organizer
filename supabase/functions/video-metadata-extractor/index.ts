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
  
  console.log(`🔬 Deep atom analysis for ${fileName}`);
  
  // Determine optimal chunk size based on file size
  const chunkSize = Math.min(Math.max(fileSize * 0.1, 1024 * 1024), 10 * 1024 * 1024); // 10% of file, min 1MB, max 10MB
  
  try {
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': `bytes=0-${chunkSize - 1}`
        }
      }
    );

    if (!downloadResponse.ok) {
      throw new Error(`Download failed: ${downloadResponse.status}`);
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    console.log(`📦 Downloaded ${data.length} bytes for analysis`);

    // Parse the complete atom structure
    const parser = new MOVAtomParser(data);
    const atoms = parser.parseAtomTree();
    
    console.log(`🌳 Found ${atoms.length} top-level atoms`);

    // Extract metadata using comprehensive atom traversal
    return extractMetadataFromAtoms(atoms, data);

  } catch (error) {
    console.error('🚫 Atom extraction failed:', error);
    throw error;
  }
}

class MOVAtomParser {
  private data: Uint8Array;
  private offset: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  parseAtomTree(): AtomInfo[] {
    const atoms: AtomInfo[] = [];
    this.offset = 0;

    while (this.offset < this.data.length - 8) {
      try {
        const atom = this.parseAtom();
        if (atom) {
          atoms.push(atom);
          // Skip to next atom
          this.offset = atom.offset + atom.size;
        } else {
          break;
        }
      } catch (error) {
        console.error(`⚠️ Error parsing atom at offset ${this.offset}:`, error);
        this.offset += 4; // Try to recover
      }
    }

    return atoms;
  }

  private parseAtom(): AtomInfo | null {
    if (this.offset + 8 > this.data.length) {
      return null;
    }

    // Read atom size (4 bytes, big-endian)
    const size = this.readUInt32BE(this.offset);
    
    // Read atom type (4 bytes)
    const type = this.readUInt32BE(this.offset + 4);
    
    // Validate atom
    if (size < 8 || this.offset + size > this.data.length) {
      return null;
    }

    const atom: AtomInfo = {
      type,
      size,
      offset: this.offset,
      dataOffset: this.offset + 8
    };

    // Handle extended size (64-bit)
    if (size === 1) {
      if (this.offset + 16 > this.data.length) {
        return null;
      }
      // Read 64-bit size (we'll use lower 32 bits)
      atom.size = this.readUInt32BE(this.offset + 12);
      atom.dataOffset = this.offset + 16;
    }

    return atom;
  }

  private readUInt32BE(offset: number): number {
    return (this.data[offset] << 24) | 
           (this.data[offset + 1] << 16) | 
           (this.data[offset + 2] << 8) | 
           this.data[offset + 3];
  }

  parseChildAtoms(parentAtom: AtomInfo): AtomInfo[] {
    const children: AtomInfo[] = [];
    let childOffset = parentAtom.dataOffset;
    const parentEnd = parentAtom.offset + parentAtom.size;

    while (childOffset < parentEnd - 8) {
      const childSize = this.readUInt32BE(childOffset);
      const childType = this.readUInt32BE(childOffset + 4);

      if (childSize < 8 || childOffset + childSize > parentEnd) {
        break;
      }

      children.push({
        type: childType,
        size: childSize,
        offset: childOffset,
        dataOffset: childOffset + 8
      });

      childOffset += childSize;
    }

    return children;
  }
}

function extractMetadataFromAtoms(atoms: AtomInfo[], data: Uint8Array): MetadataResult | null {
  const parser = new MOVAtomParser(data);
  let result: MetadataResult = {
    extractionMethod: 'atom-parsing',
    confidence: 'high'
  };

  console.log(`🔍 Analyzing ${atoms.length} atoms for metadata`);

  for (const atom of atoms) {
    const atomName = uint32ToAtomName(atom.type);
    console.log(`📋 Processing atom: ${atomName} (${atom.size} bytes)`);

    switch (atom.type) {
      case ATOM_TYPES.MOOV:
        const moovResult = processMoovAtom(atom, data, parser);
        if (moovResult) {
          Object.assign(result, moovResult);
        }
        break;

      case ATOM_TYPES.UDTA:
        const udtaResult = processUdtaAtom(atom, data, parser);
        if (udtaResult) {
          Object.assign(result, udtaResult);
        }
        break;
    }
  }

  // Validate and return result
  if (result.originalDate) {
    console.log(`🎯 Successfully extracted metadata: ${result.originalDate}`);
    return result;
  }

  console.log(`❌ No date found in atom structure`);
  return null;
}

function processMoovAtom(moovAtom: AtomInfo, data: Uint8Array, parser: MOVAtomParser): Partial<MetadataResult> {
  const children = parser.parseChildAtoms(moovAtom);
  let result: Partial<MetadataResult> = {};

  for (const child of children) {
    const childName = uint32ToAtomName(child.type);
    
    switch (child.type) {
      case ATOM_TYPES.MVHD:
        const date = extractMvhdCreationTime(child, data);
        if (date) {
          result.originalDate = date;
          result.confidence = 'high';
          console.log(`📅 Found creation time in mvhd: ${date}`);
        }
        break;

      case ATOM_TYPES.UDTA:
        const udtaResult = processUdtaAtom(child, data, parser);
        if (udtaResult) {
          Object.assign(result, udtaResult);
        }
        break;

      case ATOM_TYPES.TRAK:
        // Could process track-specific metadata here
        break;
    }
  }

  return result;
}

function processUdtaAtom(udtaAtom: AtomInfo, data: Uint8Array, parser: MOVAtomParser): Partial<MetadataResult> {
  const children = parser.parseChildAtoms(udtaAtom);
  let result: Partial<MetadataResult> = {};

  console.log(`📝 Processing udta atom with ${children.length} children`);

  for (const child of children) {
    switch (child.type) {
      case APPLE_ATOMS.DAY:
        const dayDate = extractAppleTextAtom(child, data);
        if (dayDate) {
          const parsedDate = parseAppleDateString(dayDate);
          if (parsedDate) {
            result.originalDate = parsedDate;
            result.confidence = 'high';
            console.log(`📅 Found ©day atom: ${parsedDate}`);
          }
        }
        break;

      case APPLE_ATOMS.XYZ:
        const gps = extractGPSFromXYZAtom(child, data);
        if (gps) {
          result.gpsCoordinates = gps;
          console.log(`🌍 Found GPS in ©xyz atom: ${gps.latitude}, ${gps.longitude}`);
        }
        break;

      case APPLE_ATOMS.MAKE:
      case APPLE_ATOMS.MODEL:
        const deviceText = extractAppleTextAtom(child, data);
        if (deviceText) {
          result.deviceInfo = (result.deviceInfo || '') + ' ' + deviceText;
          console.log(`📱 Found device info: ${deviceText}`);
        }
        break;

      case ATOM_TYPES.META:
        const metaResult = processMetaAtom(child, data, parser);
        if (metaResult) {
          Object.assign(result, metaResult);
        }
        break;
    }
  }

  return result;
}

function processMetaAtom(metaAtom: AtomInfo, data: Uint8Array, parser: MOVAtomParser): Partial<MetadataResult> {
  // Meta atoms have a version/flags header
  const children = parser.parseChildAtoms({
    ...metaAtom,
    dataOffset: metaAtom.dataOffset + 4 // Skip version/flags
  });

  let result: Partial<MetadataResult> = {};

  for (const child of children) {
    if (child.type === ATOM_TYPES.ILST) {
      // Process iTunes-style metadata list
      const ilstResult = processIlstAtom(child, data, parser);
      if (ilstResult) {
        Object.assign(result, ilstResult);
      }
    }
  }

  return result;
}

function processIlstAtom(ilstAtom: AtomInfo, data: Uint8Array, parser: MOVAtomParser): Partial<MetadataResult> {
  const children = parser.parseChildAtoms(ilstAtom);
  let result: Partial<MetadataResult> = {};

  // iTunes-style metadata parsing would go here
  // This is where modern iPhone metadata is often stored

  return result;
}

function extractMvhdCreationTime(mvhdAtom: AtomInfo, data: Uint8Array): string | null {
  try {
    // mvhd structure:
    // 1 byte version, 3 bytes flags
    // 4 bytes creation time (version 0) or 8 bytes (version 1)
    
    const version = data[mvhdAtom.dataOffset];
    let timeOffset = mvhdAtom.dataOffset + 4;
    
    if (version === 1) {
      timeOffset += 4; // Skip to lower 32 bits of 64-bit timestamp
    }

    const timestamp = (data[timeOffset] << 24) | 
                     (data[timeOffset + 1] << 16) | 
                     (data[timeOffset + 2] << 8) | 
                     data[timeOffset + 3];

    if (timestamp === 0) {
      return null;
    }

    // Convert from Mac epoch (1904) to Unix epoch (1970)
    const unixTimestamp = timestamp - 2082844800;
    
    // Validate timestamp
    if (unixTimestamp < 0 || unixTimestamp > Date.now() / 1000) {
      console.log(`⚠️ Invalid timestamp: ${unixTimestamp}`);
      return null;
    }

    const date = new Date(unixTimestamp * 1000);
    return date.toISOString();

  } catch (error) {
    console.error('Error extracting mvhd creation time:', error);
    return null;
  }
}

function extractAppleTextAtom(atom: AtomInfo, data: Uint8Array): string | null {
  try {
    // Apple text atoms contain a 'data' sub-atom
    let offset = atom.dataOffset;
    
    // Look for 'data' atom
    while (offset < atom.offset + atom.size - 8) {
      const subSize = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
      const subType = (data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7];
      
      if (subType === 0x64617461) { // 'data'
        // Skip data atom header (8 bytes) + type info (8 bytes)
        const textStart = offset + 16;
        const textLength = Math.min(subSize - 16, 100);
        
        if (textStart + textLength <= data.length) {
          const text = new TextDecoder('utf-8').decode(data.slice(textStart, textStart + textLength));
          const cleanText = text.replace(/\0/g, '').trim();
          
          if (cleanText.length > 0) {
            return cleanText;
          }
        }
        break;
      }
      
      offset += Math.max(subSize, 8);
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting Apple text atom:', error);
    return null;
  }
}

function extractGPSFromXYZAtom(atom: AtomInfo, data: Uint8Array): { latitude: number; longitude: number } | null {
  try {
    const text = extractAppleTextAtom(atom, data);
    if (!text) return null;

    // Parse ISO 6709 format: +40.7589-073.9851/
    const match = text.match(/([+-]\d+\.?\d*)([+-]\d+\.?\d*)/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { latitude: lat, longitude: lng };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting GPS from ©xyz:', error);
    return null;
  }
}

function parseAppleDateString(dateStr: string): string | null {
  try {
    // Try various Apple date formats
    const formats = [
      /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
      /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
      /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
        
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
          return date.toISOString();
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing Apple date string:', error);
    return null;
  }
}

function uint32ToAtomName(type: number): string {
  return String.fromCharCode(
    (type >> 24) & 0xFF,
    (type >> 16) & 0xFF,
    (type >> 8) & 0xFF,
    type & 0xFF
  );
}

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