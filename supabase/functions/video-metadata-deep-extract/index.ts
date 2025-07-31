import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MOVAtom {
  type: string;
  size: number;
  data: Uint8Array;
  children?: MOVAtom[];
}

class MOVParser {
  private view: DataView;
  private offset: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  parseAtoms(): MOVAtom[] {
    const atoms: MOVAtom[] = [];
    
    while (this.offset < this.view.byteLength - 8) {
      const atom = this.parseAtom();
      if (atom) {
        atoms.push(atom);
      }
    }
    
    return atoms;
  }

  private parseAtom(): MOVAtom | null {
    if (this.offset + 8 > this.view.byteLength) return null;

    const size = this.view.getUint32(this.offset);
    const type = this.getString(this.offset + 4, 4);
    
    if (size < 8 || this.offset + size > this.view.byteLength) {
      this.offset += 8;
      return null;
    }

    const dataStart = this.offset + 8;
    const dataSize = size - 8;
    const data = new Uint8Array(this.view.buffer, dataStart, dataSize);

    const atom: MOVAtom = { type, size, data };

    // Parse container atoms
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'meta'].includes(type)) {
      const oldOffset = this.offset;
      this.offset = dataStart;
      atom.children = [];
      
      while (this.offset < dataStart + dataSize - 8) {
        const childAtom = this.parseAtom();
        if (childAtom) {
          atom.children.push(childAtom);
        } else {
          break;
        }
      }
      
      this.offset = oldOffset;
    }

    this.offset += size;
    return atom;
  }

  private getString(offset: number, length: number): string {
    const bytes = new Uint8Array(this.view.buffer, offset, length);
    return new TextDecoder().decode(bytes);
  }

  extractMetadata(atoms: MOVAtom[]): any {
    const metadata: any = {};

    for (const atom of atoms) {
      if (atom.type === 'moov') {
        this.extractFromMoov(atom, metadata);
      }
    }

    return metadata;
  }

  private extractFromMoov(moovAtom: MOVAtom, metadata: any) {
    if (!moovAtom.children) return;

    for (const child of moovAtom.children) {
      if (child.type === 'mvhd') {
        this.extractFromMvhd(child, metadata);
      } else if (child.type === 'udta') {
        this.extractFromUdta(child, metadata);
      } else if (child.children) {
        this.extractFromMoov(child, metadata);
      }
    }
  }

  private extractFromMvhd(mvhdAtom: MOVAtom, metadata: any) {
    const view = new DataView(mvhdAtom.data.buffer, mvhdAtom.data.byteOffset);
    
    // Skip version and flags (4 bytes)
    const creationTime = view.getUint32(4);
    const modificationTime = view.getUint32(8);
    
    // Convert from Mac epoch (1904) to Unix epoch (1970)
    const macToUnixOffset = 2082844800;
    if (creationTime > macToUnixOffset) {
      metadata.originalDate = new Date((creationTime - macToUnixOffset) * 1000).toISOString();
    }
  }

  private extractFromUdta(udtaAtom: MOVAtom, metadata: any) {
    if (!udtaAtom.children) return;

    for (const child of udtaAtom.children) {
      // Apple creation date
      if (child.type === '©day') {
        const dateStr = new TextDecoder().decode(child.data.slice(8));
        metadata.originalDate = dateStr;
      }
      // GPS coordinates
      else if (child.type === '©xyz') {
        const gpsStr = new TextDecoder().decode(child.data.slice(8));
        metadata.location = this.parseGPS(gpsStr);
      }
      // Device info
      else if (child.type === '©too') {
        metadata.device = new TextDecoder().decode(child.data.slice(8));
      }
      // Handle meta atom
      else if (child.type === 'meta' && child.children) {
        this.extractFromMeta(child, metadata);
      }
    }
  }

  private extractFromMeta(metaAtom: MOVAtom, metadata: any) {
    if (!metaAtom.children) return;

    for (const child of metaAtom.children) {
      if (child.type === 'ilst' && child.children) {
        this.extractFromIlst(child, metadata);
      }
    }
  }

  private extractFromIlst(ilstAtom: MOVAtom, metadata: any) {
    if (!ilstAtom.children) return;

    for (const child of ilstAtom.children) {
      const key = child.type;
      if (child.children && child.children.length > 0) {
        const dataAtom = child.children.find(c => c.type === 'data');
        if (dataAtom) {
          const value = new TextDecoder().decode(dataAtom.data.slice(8));
          if (key.includes('day') || key.includes('date')) {
            metadata.originalDate = value;
          }
        }
      }
    }
  }

  private parseGPS(gpsStr: string): { latitude: number; longitude: number } | undefined {
    try {
      // Parse GPS string format: "+37.7749-122.4194/"
      const match = gpsStr.match(/([+-]\d+\.?\d*)([+-]\d+\.?\d*)/);
      if (match) {
        return {
          latitude: parseFloat(match[1]),
          longitude: parseFloat(match[2])
        };
      }
    } catch (error) {
      console.warn('Failed to parse GPS:', error);
    }
    return undefined;
  }
}

async function extractMetadataFromFile(fileId: string, accessToken: string) {
  console.log(`🔍 Starting atom parsing for file ${fileId}`);
  
  // Download file in chunks to parse atoms
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Range': 'bytes=0-1048576' // First 1MB should contain metadata
    }
  });

  if (!response.ok) {
    console.error(`❌ Failed to download file: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  console.log(`📊 Downloaded ${buffer.byteLength} bytes for parsing`);
  
  const parser = new MOVParser(buffer);
  const atoms = parser.parseAtoms();
  console.log(`🔬 Found ${atoms.length} top-level atoms:`, atoms.map(a => a.type));
  
  const metadata = parser.extractMetadata(atoms);
  console.log(`📋 Extracted metadata:`, metadata);

  return metadata;
}

async function fallbackFilenameExtraction(fileName: string) {
  const metadata: any = {};
  
  // iPhone patterns: IMG_1234.MOV, IMG_E1234.MOV (edited)
  if (fileName.match(/IMG_E?\d+\.(MOV|mp4)/i)) {
    metadata.device = 'iPhone';
    if (fileName.includes('IMG_E')) {
      metadata.isEdited = true;
      metadata.editingSoftware = 'iPhone Photos Edit';
    }
  }
  
  // Date patterns in filename
  const dateMatch = fileName.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})/);
  if (dateMatch) {
    try {
      const [_, year, month, day] = dateMatch;
      metadata.originalDate = new Date(`${year}-${month}-${day}`).toISOString();
    } catch (error) {
      console.warn('Invalid date in filename:', error);
    }
  }

  return metadata;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileId, fileName, accessToken } = await req.json()
    
    if (!fileId || !accessToken) {
      return new Response(
        JSON.stringify({ error: 'File ID and access token required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let metadata: any = {};
    let extractionMethod = 'none';

    // Strategy 1: Deep atom parsing
    try {
      metadata = await extractMetadataFromFile(fileId, accessToken);
      if (metadata.originalDate) {
        extractionMethod = 'atom_parsing';
      }
    } catch (error) {
      console.warn('Atom parsing failed:', error);
    }

    // Strategy 2: Filename pattern extraction
    if (!metadata.originalDate && fileName) {
      const filenameMetadata = await fallbackFilenameExtraction(fileName);
      metadata = { ...metadata, ...filenameMetadata };
      if (metadata.originalDate) {
        extractionMethod = 'filename_pattern';
      }
    }

    // Strategy 3: Google Drive API (existing fallback)
    if (!metadata.originalDate) {
      try {
        const driveResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=createdTime,videoMediaMetadata,imageMediaMetadata`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );
        
        if (driveResponse.ok) {
          const driveData = await driveResponse.json();
          if (driveData.imageMediaMetadata?.time) {
            metadata.originalDate = driveData.imageMediaMetadata.time;
            extractionMethod = 'google_drive_api';
          } else if (driveData.createdTime) {
            metadata.originalDate = driveData.createdTime;
            extractionMethod = 'drive_creation_time';
          }
        }
      } catch (error) {
        console.warn('Google Drive API fallback failed:', error);
      }
    }

    return new Response(
      JSON.stringify({
        metadata,
        extractionMethod,
        success: !!metadata.originalDate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})