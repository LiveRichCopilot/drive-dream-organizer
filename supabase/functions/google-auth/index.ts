import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log(`🚀 Google Auth function called - Method: ${req.method}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
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
    const requestBody = await req.json()
    console.log('📝 Request body:', requestBody);
    
    const { code, refresh_token, grant_type, redirect_uri } = requestBody;
    
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    
    console.log('🔑 Client ID exists:', !!clientId);
    console.log('🔒 Client Secret exists:', !!clientSecret);
    
    if (!clientId || !clientSecret) {
      console.error('❌ Missing Google OAuth credentials');
      return new Response(
        JSON.stringify({ error: 'Google OAuth credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    let tokenResponse;
    
    if (grant_type === 'refresh_token' && refresh_token) {
      console.log('🔄 Handling refresh token request');
      // Handle refresh token request
      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
        }),
      })
    } else if (code) {
      console.log('🔄 Handling authorization code exchange');
      // Use explicit redirect URI or fall back to origin-based one
      const finalRedirectUri = redirect_uri || `${req.headers.get('origin') || 'https://8eaca3d5-3299-4cce-9fff-4aa630fbc5d6.lovableproject.com'}/auth/callback`;
      console.log('🔗 Using redirect URI:', finalRedirectUri);
      
      // Handle authorization code exchange
      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: finalRedirectUri,
          grant_type: 'authorization_code',
        }),
      })
    } else {
      console.error('❌ No code or refresh token provided');
      return new Response(
        JSON.stringify({ error: 'Either authorization code or refresh token required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('📡 Google token response status:', tokenResponse.status);
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Google token response error:', errorText);
      return new Response(
        JSON.stringify({ error: `Google OAuth error: ${errorText}` }),
        { status: tokenResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokenData = await tokenResponse.json()
    console.log('✅ Token data received:', { 
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in
    });

    if (tokenData.error) {
      console.error('❌ Token data contains error:', tokenData.error);
      return new Response(
        JSON.stringify({ error: tokenData.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return comprehensive token response
    const response: any = { 
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in || 3600,
      token_type: tokenData.token_type || 'Bearer'
    }
    
    if (tokenData.refresh_token) {
      response.refresh_token = tokenData.refresh_token
    }
    
    if (tokenData.scope) {
      response.scope = tokenData.scope
    }

    console.log('✅ Returning successful response');
    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('💥 Edge function error:', error);
    return new Response(
      JSON.stringify({ error: `Internal error: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})