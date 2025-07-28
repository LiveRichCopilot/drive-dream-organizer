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
    
    const cloudRunUrl = 'https://video-metadata-service-1070421026009.us-central1.run.app/extract-metadata';
    
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
