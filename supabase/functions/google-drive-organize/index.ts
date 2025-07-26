import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    const accessToken = authHeader?.replace('Bearer ', '')
    
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Access token required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { fileIds, sourceFolderId } = await req.json()
    
    if (!fileIds || !Array.isArray(fileIds)) {
      return new Response(
        JSON.stringify({ error: 'File IDs array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Organizing ${fileIds.length} videos from source folder: ${sourceFolderId || 'root'}`)

    // Create folders by date and organize files
    const organizationResults = []
    
    for (const fileId of fileIds) {
      try {
        // Get file metadata including enhanced video metadata
        console.log(`Getting metadata for file ${fileId}...`)
        
        // First get basic file info
        const fileResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        )
        
        if (!fileResponse.ok) {
          console.log(`Failed to get basic info for ${fileId}`)
          continue
        }
        
        const fileData = await fileResponse.json()
        console.log(`Processing file: ${fileData.name}`)
        
        // Extract real metadata to get original shooting date (same logic as VideoProcessor)
        const metadataResponse = await fetch(
          'https://iffvjtfrqaesoehbwtgi.supabase.co/functions/v1/video-metadata-extractor',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileId })
          }
        )
        
        let originalDate = null
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json()
          if (metadata.originalDate) {
            originalDate = new Date(metadata.originalDate)
            console.log(`✓ Found original date for ${fileData.name}: ${originalDate.toISOString()}`)
          }
        }
        
        // Skip files without extractable original dates
        if (!originalDate) {
          console.log(`✗ No original date found for ${fileData.name} - skipping organization`)
          continue
        }
        
        const folderName = `Videos_${originalDate.getFullYear()}_${String(originalDate.getMonth() + 1).padStart(2, '0')}`
        
        // Check if folder exists in the source directory
        const searchQuery = sourceFolderId 
          ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${sourceFolderId}' in parents`
          : `name='${folderName}' and mimeType='application/vnd.google-apps.folder'`
        
        const searchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        )
        
        let folderId
        const searchData = await searchResponse.json()
        
        if (searchData.files && searchData.files.length > 0) {
          folderId = searchData.files[0].id
          console.log(`Found existing folder ${folderName} in source directory: ${folderId}`)
        } else {
          // Create folder in the same directory as the source videos
          const createResponse = await fetch(
            'https://www.googleapis.com/drive/v3/files',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: sourceFolderId ? [sourceFolderId] : undefined
              }),
            }
          )
          
          if (createResponse.ok) {
            const createData = await createResponse.json()
            folderId = createData.id
            console.log(`Created new folder ${folderName} in source directory: ${folderId}`)
          }
        }
        
        // Move file to folder
        if (folderId) {
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            }
          )
        }
        
        organizationResults.push({ fileId, folderName, success: true })
      } catch (error) {
        organizationResults.push({ fileId, success: false, error: error.message })
      }
    }

    return new Response(
      JSON.stringify({ results: organizationResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})