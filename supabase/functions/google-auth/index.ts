import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method === 'GET') {
    // Return the client ID for OAuth URL construction
    return new Response(
      JSON.stringify({ 
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (req.method === 'PUT') {
    // Handle refresh token request
    try {
      const { refresh_token } = await req.json()
      
      if (!refresh_token) {
        return new Response(
          JSON.stringify({ error: 'Refresh token required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Refresh the access token
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token,
          client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
          grant_type: 'refresh_token',
        }),
      })

      const refreshData = await refreshResponse.json()

      if (refreshData.error) {
        return new Response(
          JSON.stringify({ error: refreshData.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ 
          access_token: refreshData.access_token,
          expires_in: refreshData.expires_in 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  if (req.method === 'POST') {
    try {
      const { code } = await req.json()
      
      if (!code) {
        return new Response(
          JSON.stringify({ error: 'Authorization code required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
          redirect_uri: `${req.headers.get('origin')}/auth/callback`,
          grant_type: 'authorization_code',
        }),
      })

      const tokenData = await tokenResponse.json()

      if (tokenData.error) {
        return new Response(
          JSON.stringify({ error: tokenData.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ 
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }
})