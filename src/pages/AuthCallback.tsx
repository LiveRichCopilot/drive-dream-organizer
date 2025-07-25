import { useEffect } from 'react';

const AuthCallback = () => {
  useEffect(() => {
    console.log('AuthCallback component loaded');
    console.log('Current URL:', window.location.href);
    console.log('Has opener?', !!window.opener);
    
    // Extract the authorization code from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    
    console.log('Auth code:', code);
    console.log('Auth error:', error);
    console.log('All URL params:', Array.from(urlParams.entries()));

    if (code) {
      console.log('Sending success message to parent');
      // Send authorization code to parent window
      window.opener?.postMessage({
        type: 'GOOGLE_AUTH_SUCCESS',
        code: code
      }, window.location.origin);
    } else if (error) {
      console.log('Sending error message to parent');
      // Send error message to parent window
      window.opener?.postMessage({
        type: 'GOOGLE_AUTH_ERROR',
        error: error
      }, window.location.origin);
    } else {
      console.log('No code or error found in URL');
    }

    // Close the popup after a small delay to allow debugging
    setTimeout(() => {
      console.log('Closing popup window');
      window.close();
    }, 1000);
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