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

  try {
    const { code, refresh_token, grant_type } = await req.json()
    
    let tokenResponse;
    
    if (grant_type === 'refresh_token' && refresh_token) {
      // Handle refresh token request
      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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
    } else if (code) {
      // Handle authorization code exchange
      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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
    } else {
      return new Response(
        JSON.stringify({ error: 'Either authorization code or refresh token required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      return new Response(
        JSON.stringify({ error: tokenData.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return both access token and refresh token (if provided)
    const response: any = { access_token: tokenData.access_token }
    if (tokenData.refresh_token) {
      response.refresh_token = tokenData.refresh_token
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})