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

    const { fileIds, sourceFolderId, organizationType = 'date', categories = [] } = await req.json()
    
    if (!fileIds || !Array.isArray(fileIds)) {
      return new Response(
        JSON.stringify({ error: 'File IDs array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Organizing ${fileIds.length} photos from source folder: ${sourceFolderId || 'root'} by ${organizationType}`)

    const organizationResults = []
    
    for (const fileId of fileIds) {
      try {
        // Get file metadata
        console.log(`Getting metadata for file ${fileId}...`)
        
        const fileResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,createdTime,modifiedTime,imageMediaMetadata`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        )
        
        if (!fileResponse.ok) {
          console.log(`Failed to get info for ${fileId}`)
          continue
        }
        
        const fileData = await fileResponse.json()
        console.log(`Processing photo: ${fileData.name}`)
        
        let folderName = ''
        let dateKey = ''
        
        if (organizationType === 'date') {
          // Use file creation date for photos
          const createdDate = new Date(fileData.createdTime || fileData.modifiedTime)
          folderName = `Photos_${createdDate.getFullYear()}_${String(createdDate.getMonth() + 1).padStart(2, '0')}`
          dateKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`
          console.log(`Using creation date for ${fileData.name}: ${createdDate.toISOString()}`)
        } else if (organizationType === 'category') {
          // Find category for this file
          const category = categories.find((cat: any) => 
            cat.photos.some((photo: any) => photo.id === fileId)
          )
          
          if (category) {
            folderName = `Photos_${category.name.replace(/[^a-zA-Z0-9]/g, '_')}`
            dateKey = category.id
          } else {
            folderName = 'Photos_Uncategorized'
            dateKey = 'uncategorized'
          }
        }
        
        let folderId = null
        
        // Search for existing folder
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
          console.log(`Found existing folder ${folderName}: ${folderId}`)
        }
        
        // Create folder if not found
        if (!folderId) {
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
            console.log(`Created new folder ${folderName}: ${folderId}`)
          } else {
            const errorText = await createResponse.text()
            console.error(`Failed to create folder ${folderName}: ${errorText}`)
            continue
          }
        }
        
        // Move file to folder
        if (folderId) {
          console.log(`Moving photo ${fileData.name} to folder ${folderName}...`)
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
          dateKey,
          success: true 
        })
      } catch (error) {
        console.error(`Error processing file ${fileId}:`, error)
        organizationResults.push({ fileId, success: false, error: error.message })
      }
    }

    return new Response(
      JSON.stringify({ results: organizationResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Organization function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})