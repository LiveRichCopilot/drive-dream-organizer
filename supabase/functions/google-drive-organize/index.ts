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

    const { fileIds } = await req.json()
    
    if (!fileIds || !Array.isArray(fileIds)) {
      return new Response(
        JSON.stringify({ error: 'File IDs array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create folders by date and organize files
    const organizationResults = []
    
    for (const fileId of fileIds) {
      try {
        // Get file metadata
        const fileResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=createdTime,name`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        )
        
        if (!fileResponse.ok) continue
        
        const fileData = await fileResponse.json()
        const createdDate = new Date(fileData.createdTime)
        const folderName = `Videos_${createdDate.getFullYear()}_${String(createdDate.getMonth() + 1).padStart(2, '0')}`
        
        // Check if folder exists
        const searchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder'`,
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
        } else {
          // Create folder
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
              }),
            }
          )
          
          if (createResponse.ok) {
            const createData = await createResponse.json()
            folderId = createData.id
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