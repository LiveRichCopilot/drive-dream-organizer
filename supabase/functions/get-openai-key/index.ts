import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Retrieving OpenAI API key from Supabase secrets...');
    
    // Get the OpenAI API key from Supabase secrets
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY not found in Supabase secrets');
      return new Response(
        JSON.stringify({ 
          error: 'OpenAI API key not configured in Supabase secrets',
          message: 'Please set the OPENAI_API_KEY secret in your Supabase project'
        }), 
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('OpenAI API key found and ready to use');
    
    return new Response(
      JSON.stringify({ 
        apiKey: openAIApiKey,
        status: 'success'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error retrieving OpenAI API key:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        message: 'Failed to retrieve OpenAI API key from Supabase secrets'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});