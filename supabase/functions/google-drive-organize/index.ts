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

    const { fileIds, sourceFolderId, existingFolders = new Map() } = await req.json()
    
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
        const dateKey = `${originalDate.getFullYear()}-${String(originalDate.getMonth() + 1).padStart(2, '0')}`
        
        let folderId
        
        // First check project memory for existing folder
        if (existingFolders && existingFolders[dateKey] && existingFolders[dateKey].googleDriveFolderId) {
          folderId = existingFolders[dateKey].googleDriveFolderId
          console.log(`Found folder in project memory ${folderName}: ${folderId}`)
          
          // Verify the folder still exists in Google Drive
          const verifyResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,parents`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            }
          )
          
          if (!verifyResponse.ok) {
            console.log(`Folder ${folderId} from memory no longer exists, searching for new one`)
            folderId = null
          }
        }
        
        // If not found in memory or verification failed, search Google Drive
        if (!folderId) {
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
          
          const searchData = await searchResponse.json()
          
          if (searchData.files && searchData.files.length > 0) {
            folderId = searchData.files[0].id
            console.log(`Found existing folder ${folderName} in Google Drive: ${folderId}`)
          }
        }
        
        // Create folder if still not found
        if (!folderId) {
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
          console.log(`Moving file ${fileData.name} to folder ${folderName}...`)
          const moveResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            }
          )
          
          if (moveResponse.ok) {
            console.log(`✓ Successfully moved ${fileData.name} to ${folderName}`)
          } else {
            const errorText = await moveResponse.text()
            console.error(`✗ Failed to move ${fileData.name}: ${errorText}`)
          }
        }
        
        organizationResults.push({ 
          fileId, 
          folderName, 
          googleDriveFolderId: folderId,
          originalDate: originalDate.toISOString(),
          dateKey,
          success: true 
        })
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