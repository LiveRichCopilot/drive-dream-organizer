import { useEffect } from 'react';

const AuthCallback = () => {
  useEffect(() => {
    console.log('=== AUTH CALLBACK COMPONENT LOADED ===');
    console.log('Current URL:', window.location.href);
    console.log('Current pathname:', window.location.pathname);
    console.log('Current search:', window.location.search);
    console.log('Current hash:', window.location.hash);
    console.log('Has opener?', !!window.opener);
    console.log('Document ready state:', document.readyState);
    
    // Extract the authorization code from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const state = urlParams.get('state');
    
    console.log('Auth code:', code);
    console.log('Auth error:', error);
    console.log('State:', state);
    console.log('All URL params:', Array.from(urlParams.entries()));

    // Verify state parameter for security
    const storedState = sessionStorage.getItem('oauth_state');
    if (state !== storedState) {
      console.error('State mismatch - possible CSRF attack');
      if (window.opener) {
        window.opener.postMessage({
          type: 'OAUTH_ERROR',
          error: 'Security validation failed'
        }, window.location.origin);
      }
      window.close();
      return;
    }

    if (code) {
      console.log('Sending success message to parent');
      // Send authorization code to parent window
      window.opener?.postMessage({
        type: 'OAUTH_SUCCESS',
        code: code
      }, window.location.origin);
      
      // Show success message
      document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
          <div style="text-align: center;">
            <h2 style="color: #059669; margin-bottom: 16px;">Authentication Successful</h2>
            <p style="color: #666;">Completing authorization...</p>
          </div>
        </div>
      `;
      
      setTimeout(() => window.close(), 1000);
      return;
    } 
    
    if (error) {
      console.log('Sending error message to parent');
      const errorDescription = urlParams.get('error_description') || error;
      
      // Send error message to parent window
      window.opener?.postMessage({
        type: 'OAUTH_ERROR',
        error: errorDescription
      }, window.location.origin);
      
      // Show error message
      document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
          <div style="text-align: center; max-width: 400px;">
            <h2 style="color: #dc2626; margin-bottom: 16px;">Authentication Failed</h2>
            <p style="color: #666; margin-bottom: 24px;">${errorDescription}</p>
            <p style="color: #666; font-size: 14px;">This window will close automatically.</p>
          </div>
        </div>
      `;
      
      setTimeout(() => window.close(), 2000);
      return;
    }

    // No code or error - something went wrong
    console.error('No authorization code or error received');
    if (window.opener) {
      window.opener.postMessage({
        type: 'OAUTH_ERROR',
        error: 'No authorization code received'
      }, window.location.origin);
    }
    
    document.body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
        <div style="text-align: center;">
          <h2 style="color: #dc2626; margin-bottom: 16px;">Authentication Error</h2>
          <p style="color: #666;">No authorization received. This window will close automatically.</p>
        </div>
      </div>
    `;
    
    setTimeout(() => window.close(), 2000);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Authentication Complete</h2>
        <p className="text-muted-foreground">You can close this window.</p>
      </div>
    </div>
  );
};

export default AuthCallback;