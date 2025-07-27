import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
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
    console.log(`Starting metadata extraction for file: ${fileId}`);

    // Get file metadata from Google Drive
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType,createdTime,modifiedTime,videoMediaMetadata`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!metadataResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch file metadata' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fileData = await metadataResponse.json();
    console.log('File metadata:', JSON.stringify(fileData, null, 2));

    // Prepare response object
    const response = {
      fileId,
      fileName: fileData.name,
      fileSize: fileData.size,
      mimeType: fileData.mimeType,
      googleCreatedTime: fileData.createdTime,
      googleModifiedTime: fileData.modifiedTime,
      originalDate: null as string | null
    };

    // Add video metadata if available
    if (fileData.videoMediaMetadata) {
      response.videoMetadata = fileData.videoMediaMetadata;
      console.log('Google Drive video metadata:', JSON.stringify(fileData.videoMediaMetadata, null, 2));
    }

    console.log(`Attempting metadata extraction for ${fileData.name} (${fileData.size} bytes)`);

    // Try multiple strategies to extract original date
    let originalDate: string | null = null;
    
    // Strategy 1: Extract from filename patterns (fastest)
    console.log(`Trying filename extraction for: ${fileData.name}`);
    originalDate = extractDateFromFilename(fileData.name);
    
    if (originalDate) {
      console.log(`✓ SUCCESS: Extracted date from filename: ${originalDate}`);
    } else {
      console.log('✗ No date found in filename, trying video file metadata extraction...');
      
      // Strategy 2: Extract from actual video file metadata
      originalDate = await extractVideoMetadata(fileId, accessToken, fileData.name, parseInt(fileData.size || '0'));
      
      if (originalDate) {
        console.log(`✓ SUCCESS: Extracted date from file metadata: ${originalDate}`);
      } else {
        console.log('✗ No date found in file metadata, trying sequence inference...');
        
        // Strategy 3: Infer from sequence of similar files
        originalDate = await inferDateFromSequence(fileData.name, fileId, accessToken);
        
        if (originalDate) {
          console.log(`✓ SUCCESS: Inferred date from sequence: ${originalDate}`);
        } else {
          console.log('✗ Could not infer from sequence, using Google Drive dates as fallback...');
          
          // Strategy 4: FALLBACK - Use Google Drive modification date
          if (fileData.modifiedTime) {
            const modifiedDate = new Date(fileData.modifiedTime);
            if (modifiedDate.getFullYear() >= 2020 && modifiedDate.getFullYear() <= new Date().getFullYear() + 1) {
              originalDate = modifiedDate.toISOString();
              console.log(`✓ SUCCESS: Using Google Drive modification date: ${originalDate}`);
            }
          }
          
          // Strategy 5: Last resort - Use creation date
          if (!originalDate && fileData.createdTime) {
            const createdDate = new Date(fileData.createdTime);
            if (createdDate.getFullYear() >= 2020 && createdDate.getFullYear() <= new Date().getFullYear() + 1) {
              originalDate = createdDate.toISOString();
              console.log(`✓ SUCCESS: Using Google Drive creation date: ${originalDate}`);
            }
          }
          
          if (!originalDate) {
            console.log('✗ FAILED: Could not determine any usable date');
          }
        }
      }
    }

    // Set the original date in response
    if (originalDate) {
      response.originalDate = originalDate;
      response.confidence = originalDate.includes('inferred') ? 'inferred' : 'extracted';
    } else {
      console.log('ERROR: No date could be extracted despite fallbacks');
    }

    // Try to extract additional metadata (GPS, device info, etc.)
    try {
      console.log(`Extracting additional metadata for ${fileData.name}...`);
      const additionalMetadata = await extractAdditionalVideoMetadata(fileId, accessToken, fileData.name, parseInt(fileData.size || '0'));
      
      if (additionalMetadata) {
        if (additionalMetadata.gpsCoordinates) {
          response.gpsCoordinates = additionalMetadata.gpsCoordinates;
          console.log(`✓ GPS coordinates: ${additionalMetadata.gpsCoordinates.latitude}, ${additionalMetadata.gpsCoordinates.longitude}`);
          
          if (additionalMetadata.locationName) {
            response.locationName = additionalMetadata.locationName;
            console.log(`✓ Location: ${additionalMetadata.locationName}`);
          }
        }
        
        if (additionalMetadata.deviceInfo) {
          response.deviceInfo = additionalMetadata.deviceInfo;
          console.log(`✓ Device: ${additionalMetadata.deviceInfo}`);
        }
      }
    } catch (error) {
      console.error('Error extracting additional metadata:', error);
    }

    console.log(`Metadata extraction complete for ${fileData.name}. Original date: ${originalDate || 'NOT FOUND'}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in metadata extraction:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractDateFromFilename(fileName: string): string | null {
  // Common date patterns in filenames
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})[-_](\d{2})[-:](\d{2})[-:](\d{2})/,
    /(\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})/,
    /(\d{4})[-_](\d{2})[-_](\d{2})[-_](\d{2})[-_](\d{2})[-_](\d{2})/,
    /(\d{2})-(\d{2})-(\d{4})[-_](\d{2})[-:](\d{2})[-:](\d{2})/,
    /(\d{2})(\d{2})(\d{4})[-_](\d{2})(\d{2})(\d{2})/,
    /(\d{4})-(\d{2})-(\d{2})/
  ];
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      try {
        let year, month, day, hour = '00', minute = '00', second = '00';
        
        if (pattern === patterns[0] || pattern === patterns[1] || pattern === patterns[2]) {
          [, year, month, day, hour, minute, second] = match;
        } else if (pattern === patterns[3] || pattern === patterns[4]) {
          [, day, month, year, hour, minute, second] = match;
        } else if (pattern === patterns[5]) {
          [, year, month, day] = match;
        }

        const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.000Z`);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch (error) {
        console.error('Error parsing date from filename:', error);
      }
    }
  }

  return null;
}

async function extractVideoMetadata(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<string | null> {
  try {
    console.log(`Attempting metadata extraction for ${fileName} (${fileSize} bytes)`);
    
    // Download first 5MB for metadata extraction
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': 'bytes=0-5242880' // First 5MB for better iPhone metadata detection
        }
      }
    );

    if (!downloadResponse.ok) {
      console.error(`Failed to download file: ${downloadResponse.status}`);
      return null;
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    console.log(`Downloaded ${data.length} bytes for analysis`);

    // Try multiple extraction methods in order of reliability
    let creationDate: string | null = null;
    
    // Method 1: Parse QuickTime movie header (mvhd) atom - most reliable for iPhone
    creationDate = extractQuickTimeCreationDate(data);
    if (creationDate) {
      console.log(`✓ Found creation date in QuickTime mvhd atom: ${creationDate}`);
      return creationDate;
    }
    
    // Method 2: Look for Apple metadata atoms
    creationDate = searchForAppleMetadataAtoms(data);
    if (creationDate) {
      console.log(`✓ Found creation date in Apple metadata atoms: ${creationDate}`);
      return creationDate;
    }
    
    // Method 3: Search for date strings in metadata
    creationDate = findCreationTimeString(data);
    if (creationDate) {
      console.log(`✓ Found creation date string: ${creationDate}`);
      return creationDate;
    }
    
    console.log('✗ No creation date found in file metadata');
    return null;

  } catch (error) {
    console.error('Error extracting video metadata:', error);
    return null;
  }
}

function extractQuickTimeCreationDate(data: Uint8Array): string | null {
  try {
    // Find the 'moov' atom which contains movie metadata
    const moovOffset = findAtom(data, 'moov');
    if (moovOffset === -1) {
      console.log('No moov atom found');
      return null;
    }
    
    // Within moov, find the 'mvhd' (movie header) atom
    const moovSize = getAtomSize(data, moovOffset);
    const mvhdOffset = findAtom(data, 'mvhd', moovOffset + 8, moovOffset + moovSize);
    if (mvhdOffset === -1) {
      console.log('No mvhd atom found in moov');
      return null;
    }
    
    // Parse mvhd atom - creation time is at offset 12 (version 0) or 16 (version 1)
    const version = data[mvhdOffset + 8];
    let creationTimeOffset = mvhdOffset + 12;
    if (version === 1) {
      creationTimeOffset = mvhdOffset + 16;
    }
    
    // Read 32-bit timestamp (seconds since Jan 1, 1904)
    const timestamp = (data[creationTimeOffset] << 24) | 
                     (data[creationTimeOffset + 1] << 16) | 
                     (data[creationTimeOffset + 2] << 8) | 
                     data[creationTimeOffset + 3];
    
    if (timestamp === 0) {
      console.log('Invalid timestamp in mvhd atom');
      return null;
    }
    
    // Convert from Mac epoch (1904) to Unix epoch (1970)
    const macToUnixOffset = 2082844800; // seconds between 1904 and 1970
    const unixTimestamp = timestamp - macToUnixOffset;
    
    // Validate timestamp is reasonable
    if (unixTimestamp < 0 || unixTimestamp > Date.now() / 1000) {
      console.log(`Invalid converted timestamp: ${unixTimestamp}`);
      return null;
    }
    
    const date = new Date(unixTimestamp * 1000);
    console.log(`Extracted QuickTime creation date: ${date.toISOString()}`);
    return date.toISOString();
    
  } catch (error) {
    console.error('Error parsing QuickTime creation date:', error);
    return null;
  }
}

function findAtom(data: Uint8Array, atomType: string, start = 0, end?: number): number {
  const atomTypeBytes = new TextEncoder().encode(atomType);
  const searchEnd = end || data.length - 8;
  
  for (let i = start; i < searchEnd; i += 4) {
    // Check if we found the atom type
    if (data[i + 4] === atomTypeBytes[0] && 
        data[i + 5] === atomTypeBytes[1] && 
        data[i + 6] === atomTypeBytes[2] && 
        data[i + 7] === atomTypeBytes[3]) {
      return i;
    }
  }
  return -1;
}

function getAtomSize(data: Uint8Array, offset: number): number {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function searchForAppleMetadataAtoms(data: Uint8Array): string | null {
  try {
    // Look for udta (user data) atom which contains Apple metadata
    const udtaOffset = findAtom(data, 'udta');
    if (udtaOffset === -1) return null;
    
    const udtaSize = getAtomSize(data, udtaOffset);
    return searchUdtaAtom(data, udtaOffset + 8, udtaOffset + udtaSize);
  } catch (error) {
    console.error('Error searching Apple metadata atoms:', error);
    return null;
  }
}

function searchUdtaAtom(data: Uint8Array, start: number, end: number): string | null {
  try {
    for (let i = start; i < end - 20; i++) {
      // Look for Apple metadata atoms like ©day
      if (data[i] === 0xA9 && data[i + 1] === 0x64 && data[i + 2] === 0x61 && data[i + 3] === 0x79) {
        console.log(`Found ©day atom at position ${i}`);
        return extractAppleMetadata(data, i, end - i, 'day');
      }
      
      // Look for creation time
      if (data[i] === 0x63 && data[i + 1] === 0x72 && data[i + 2] === 0x65 && data[i + 3] === 0x61) {
        console.log(`Found creation atom at position ${i}`);
        return extractDateStringAfterPosition(data, i + 4);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching udta atom:', error);
    return null;
  }
}

function extractAppleMetadata(data: Uint8Array, offset: number, size: number, atomType: string): string | null {
  try {
    // Apple metadata format - skip to actual data
    const atomSize = (data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7];
    
    if (atomSize > size || atomSize < 16) {
      return null;
    }
    
    // Look for 'data' atom
    let dataOffset = offset + 8;
    if (data[dataOffset] === 0x64 && data[dataOffset + 1] === 0x61 && 
        data[dataOffset + 2] === 0x74 && data[dataOffset + 3] === 0x61) {
      
      // Skip data atom header to get to actual data
      dataOffset += 16;
      
      // Extract date string
      const dateStr = extractDateStringFromBytes(data, dataOffset, atomSize - 16);
      if (dateStr) {
        const parsedDate = parseAppleDateString(dateStr);
        if (parsedDate) {
          return parsedDate;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting Apple metadata:', error);
    return null;
  }
}

function extractDateStringFromBytes(data: Uint8Array, offset: number, length: number): string | null {
  try {
    const bytes = data.slice(offset, offset + length);
    const text = new TextDecoder('utf-8').decode(bytes);
    
    // Clean up the string
    const cleanText = text.replace(/\0/g, '').trim();
    
    if (cleanText.length > 0) {
      console.log(`Extracted date string: "${cleanText}"`);
      return cleanText;
    }
    
    return null;
  } catch (error) {
    console.error('Error decoding date string:', error);
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

function extractDateStringAfterPosition(data: Uint8Array, startPos: number): string | null {
  try {
    // Look for date patterns in the next 100 bytes
    const searchLength = Math.min(100, data.length - startPos);
    
    for (let i = startPos; i < startPos + searchLength - 19; i++) {
      // Look for ISO date pattern (YYYY-MM-DD)
      if (data[i] >= 0x32 && data[i] <= 0x39 && // 2-9
          data[i + 1] >= 0x30 && data[i + 1] <= 0x39 && // 0-9
          data[i + 2] >= 0x30 && data[i + 2] <= 0x39 && // 0-9
          data[i + 3] >= 0x30 && data[i + 3] <= 0x39) { // 0-9
        
        // Try to extract a 19-character ISO string
        try {
          const dateBytes = data.slice(i, i + 19);
          const dateStr = new TextDecoder('utf-8').decode(dateBytes);
          
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
            const date = new Date(dateStr + '.000Z');
            if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
              return date.toISOString();
            }
          }
        } catch (e) {
          // Continue searching
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting date string after position:', error);
    return null;
  }
}

function findCreationTimeString(data: Uint8Array): string | null {
  try {
    // Convert to string and look for common date patterns
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
    
    // Look for various date formats
    const patterns = [
      /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/g,
      /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g,
      /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        try {
          const [fullMatch, year, month, day, hour, minute, second] = match;
          const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
          
          if (!isNaN(date.getTime()) && 
              date.getFullYear() >= 2000 && 
              date.getFullYear() <= new Date().getFullYear() + 1) {
            console.log(`Found date pattern: ${fullMatch}`);
            return date.toISOString();
          }
        } catch (e) {
          // Continue searching
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching for creation time string:', error);
    return null;
  }
}

async function inferDateFromSequence(fileName: string, fileId: string, accessToken: string): Promise<string | null> {
  try {
    // Extract sequence number from filename - support various patterns
    let sequenceNumber: number | null = null;
    let pattern = '';
    
    // Try iPhone pattern IMG_XXXX
    const imgMatch = fileName.match(/IMG_(\d{4,})/);
    if (imgMatch) {
      sequenceNumber = parseInt(imgMatch[1]);
      pattern = 'IMG_';
    }
    
    // Try numbered files like 1.mov, 2.mov, etc.
    if (!sequenceNumber) {
      const numMatch = fileName.match(/^(\d+)\./);
      if (numMatch) {
        sequenceNumber = parseInt(numMatch[1]);
        pattern = 'numbered';
      }
    }
    
    if (!sequenceNumber) {
      console.log('No sequence number found in filename');
      return null;
    }
    
    console.log(`Found sequence number: ${sequenceNumber} (pattern: ${pattern})`);
    
    // First, get the parent folder of the current file
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    let searchQuery = '';
    if (fileResponse.ok) {
      const fileData = await fileResponse.json();
      const parentId = fileData.parents?.[0];
      
      if (parentId) {
        // Search within the same folder
        if (pattern === 'IMG_') {
          searchQuery = `name contains 'IMG_' and '${parentId}' in parents`;
        } else {
          // For numbered files, search for video files in the same folder
          searchQuery = `mimeType contains 'video' and '${parentId}' in parents`;
        }
      }
    }
    
    // Fallback to global search if folder-specific search fails
    if (!searchQuery) {
      searchQuery = pattern === 'IMG_' ? "name contains 'IMG_'" : "mimeType contains 'video'";
    }
    
    console.log(`Searching with query: ${searchQuery}`);
    
    // Get a list of nearby files to establish sequence pattern
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,createdTime,modifiedTime)&pageSize=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    if (!searchResponse.ok) {
      console.log('Failed to search for sequence files');
      return null;
    }
    
    const searchData = await searchResponse.json();
    const sequenceFiles = searchData.files || [];
    
    console.log(`Found ${sequenceFiles.length} potential sequence files`);
    
    // Extract sequence numbers and dates
    const sequences: Array<{number: number, date: Date}> = [];
    
    for (const file of sequenceFiles) {
      let seqNum: number | null = null;
      
      if (pattern === 'IMG_') {
        const match = file.name.match(/IMG_(\d{4,})/);
        if (match) {
          seqNum = parseInt(match[1]);
        }
      } else if (pattern === 'numbered') {
        const match = file.name.match(/^(\d+)\./);
        if (match) {
          seqNum = parseInt(match[1]);
        }
      }
      
      if (seqNum !== null) {
        // Use modifiedTime if available, fallback to createdTime
        const dateToUse = file.modifiedTime || file.createdTime;
        const date = new Date(dateToUse);
        
        // Only include files with reasonable sequence numbers (within range)
        const maxRange = pattern === 'IMG_' ? 1000 : 100;
        if (Math.abs(seqNum - sequenceNumber) <= maxRange) {
          sequences.push({ number: seqNum, date });
          console.log(`Added sequence ${seqNum} with date ${date.toISOString()}`);
        }
      }
    }
    
    if (sequences.length < 2) {
      console.log('Not enough sequence files for inference');
      return null;
    }
    
    // Sort by sequence number
    sequences.sort((a, b) => a.number - b.number);
    
    // Find the closest sequences to our target
    let beforeSeq = null;
    let afterSeq = null;
    
    for (let i = 0; i < sequences.length; i++) {
      if (sequences[i].number < sequenceNumber) {
        beforeSeq = sequences[i];
      } else if (sequences[i].number > sequenceNumber && !afterSeq) {
        afterSeq = sequences[i];
        break;
      }
    }
    
    if (!beforeSeq && !afterSeq) {
      console.log('No reference sequences found');
      return null;
    }
    
    // Interpolate date
    let inferredDate: Date;
    
    if (beforeSeq && afterSeq) {
      // Interpolate between the two
      const ratio = (sequenceNumber - beforeSeq.number) / (afterSeq.number - beforeSeq.number);
      const timeDiff = afterSeq.date.getTime() - beforeSeq.date.getTime();
      const interpolatedTime = beforeSeq.date.getTime() + (timeDiff * ratio);
      inferredDate = new Date(interpolatedTime);
      
      console.log(`Interpolated between seq ${beforeSeq.number} and ${afterSeq.number}`);
    } else if (beforeSeq) {
      // Extrapolate forward from the before sequence
      const daysDiff = sequenceNumber - beforeSeq.number;
      inferredDate = new Date(beforeSeq.date.getTime() + (daysDiff * 24 * 60 * 60 * 1000));
      
      console.log(`Extrapolated forward from seq ${beforeSeq.number}`);
    } else if (afterSeq) {
      // Extrapolate backward from the after sequence
      const daysDiff = afterSeq.number - sequenceNumber;
      inferredDate = new Date(afterSeq.date.getTime() - (daysDiff * 24 * 60 * 60 * 1000));
      
      console.log(`Extrapolated backward from seq ${afterSeq.number}`);
    } else {
      return null;
    }
    
    // Validate the inferred date
    if (!validateInferredDate(inferredDate.toISOString(), fileName)) {
      console.log('Inferred date failed validation');
      return null;
    }
    
    console.log(`Successfully inferred date: ${inferredDate.toISOString()}`);
    return inferredDate.toISOString();
    
  } catch (error) {
    console.error('Error inferring date from sequence:', error);
    return null;
  }
}

function validateInferredDate(inferredDate: string, fileName: string): boolean {
  try {
    const date = new Date(inferredDate);
    const now = new Date();
    
    // Check if date is within reasonable bounds (2000 to 1 year in future)
    if (date.getFullYear() < 2000 || date.getFullYear() > now.getFullYear() + 1) {
      console.log(`Invalid year: ${date.getFullYear()}`);
      return false;
    }
    
    // Check if date is not too far in the future
    if (date.getTime() > now.getTime() + (365 * 24 * 60 * 60 * 1000)) {
      console.log('Date is too far in the future');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error validating inferred date:', error);
    return false;
  }
}

async function extractAdditionalVideoMetadata(fileId: string, accessToken: string, fileName: string, fileSize: number): Promise<{ gpsCoordinates?: { latitude: number, longitude: number }, locationName?: string, deviceInfo?: string } | null> {
  try {
    // Download a larger chunk for GPS and device info extraction
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Range': 'bytes=0-10485760' // First 10MB for comprehensive metadata
        }
      }
    );

    if (!downloadResponse.ok) {
      console.error(`Failed to download file for additional metadata: ${downloadResponse.status}`);
      return null;
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const result: { gpsCoordinates?: { latitude: number, longitude: number }, locationName?: string, deviceInfo?: string } = {};

    // Extract GPS coordinates
    const gpsCoordinates = extractGPSCoordinates(data);
    if (gpsCoordinates) {
      result.gpsCoordinates = gpsCoordinates;
      
      // Try to get location name from coordinates
      try {
        const locationResponse = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${gpsCoordinates.latitude}+${gpsCoordinates.longitude}&key=YOUR_API_KEY&limit=1`);
        if (locationResponse.ok) {
          const locationData = await locationResponse.json();
          if (locationData.results && locationData.results.length > 0) {
            result.locationName = locationData.results[0].formatted;
          }
        }
      } catch (error) {
        console.error('Error getting location name:', error);
      }
    }

    // Extract device info
    const deviceInfo = extractDeviceInfo(data);
    if (deviceInfo) {
      result.deviceInfo = deviceInfo;
    }

    return Object.keys(result).length > 0 ? result : null;

  } catch (error) {
    console.error('Error extracting additional metadata:', error);
    return null;
  }
}

function extractGPSCoordinates(data: Uint8Array): { latitude: number, longitude: number } | null {
  try {
    // Look for various GPS coordinate formats in QuickTime metadata
    
    // Method 1: Look for ©xyz atom (Apple's compressed GPS format)
    const xyzAtom = findGPSXYZAtom(data);
    if (xyzAtom) {
      return xyzAtom;
    }
    
    // Method 2: Look for standard GPS atoms
    const standardGPS = findStandardGPSAtoms(data);
    if (standardGPS) {
      return standardGPS;
    }
    
    // Method 3: Look in EXIF data
    const exifGPS = findEXIFGPS(data);
    if (exifGPS) {
      return exifGPS;
    }
    
    console.log('No GPS coordinates found in video metadata');
    return null;
    
  } catch (error) {
    console.error('Error extracting GPS coordinates:', error);
    return null;
  }
}

function findGPSXYZAtom(data: Uint8Array): { latitude: number, longitude: number } | null {
  // Look for ©xyz atom which contains compressed GPS coordinates
  for (let i = 0; i < data.length - 20; i++) {
    if (data[i] === 0xA9 && data[i + 1] === 0x78 && data[i + 2] === 0x79 && data[i + 3] === 0x7A) {
      try {
        // Found ©xyz atom, extract coordinates
        const atomSize = (data[i - 4] << 24) | (data[i - 3] << 16) | (data[i - 2] << 8) | data[i - 1];
        
        if (atomSize > 20 && atomSize < 100) {
          // Skip to data section
          const dataStart = i + 16;
          
          // Parse the compressed format (varies by device)
          const coords = parseCompressedGPS(data, dataStart, atomSize - 16);
          if (coords) {
            console.log(`Found GPS coordinates in ©xyz atom: ${coords.latitude}, ${coords.longitude}`);
            return coords;
          }
        }
      } catch (error) {
        console.error('Error parsing ©xyz atom:', error);
      }
    }
  }
  
  return null;
}

function parseCompressedGPS(data: Uint8Array, offset: number, length: number): { latitude: number, longitude: number } | null {
  try {
    // Try to parse as ISO 6709 format first
    const text = new TextDecoder('utf-8').decode(data.slice(offset, offset + length));
    const iso6709Match = text.match(/([+-]\d+\.?\d*)([+-]\d+\.?\d*)/);
    
    if (iso6709Match) {
      const lat = parseFloat(iso6709Match[1]);
      const lng = parseFloat(iso6709Match[2]);
      
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { latitude: lat, longitude: lng };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing compressed GPS:', error);
    return null;
  }
}

function findStandardGPSAtoms(data: Uint8Array): { latitude: number, longitude: number } | null {
  // Look for standard GPS coordinate atoms
  // This is a simplified implementation - real GPS parsing is more complex
  return null;
}

function findEXIFGPS(data: Uint8Array): { latitude: number, longitude: number } | null {
  // Look for EXIF GPS data in video metadata
  // This is a simplified implementation - real EXIF parsing is more complex
  return null;
}

function extractDeviceInfo(data: Uint8Array): string | null {
  try {
    // Look for device information in various metadata atoms
    
    // Look for ©make and ©modl atoms
    const make = findTextAtom(data, 'make');
    const model = findTextAtom(data, 'modl');
    
    if (make || model) {
      const device = `${make || 'Unknown'} ${model || 'Device'}`.trim();
      console.log(`Found device info: ${device}`);
      return device;
    }
    
    // Look for common device strings
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
    
    if (text.includes('iPhone')) {
      const iphoneMatch = text.match(/iPhone[\s\w]*\d+/i);
      if (iphoneMatch) {
        return iphoneMatch[0];
      }
      return 'iPhone';
    }
    
    if (text.includes('Apple')) {
      return 'Apple Device';
    }
    
    return null;
    
  } catch (error) {
    console.error('Error extracting device info:', error);
    return null;
  }
}

function findTextAtom(data: Uint8Array, atomType: string): string | null {
  // Look for text atoms in QuickTime metadata
  const atomBytes = new TextEncoder().encode(`©${atomType}`);
  
  for (let i = 0; i < data.length - atomBytes.length; i++) {
    let match = true;
    for (let j = 0; j < atomBytes.length; j++) {
      if (data[i + j] !== atomBytes[j]) {
        match = false;
        break;
      }
    }
    
    if (match) {
      try {
        // Found the atom, extract text
        const atomSize = (data[i - 4] << 24) | (data[i - 3] << 16) | (data[i - 2] << 8) | data[i - 1];
        
        if (atomSize > 16 && atomSize < 200) {
          // Skip to text data
          const textStart = i + atomBytes.length + 8;
          const textLength = Math.min(atomSize - 16, 50);
          
          const text = new TextDecoder('utf-8').decode(data.slice(textStart, textStart + textLength));
          const cleanText = text.replace(/\0/g, '').trim();
          
          if (cleanText.length > 0) {
            return cleanText;
          }
        }
      } catch (error) {
        console.error(`Error extracting ${atomType} atom:`, error);
      }
    }
  }
  
  return null;
}