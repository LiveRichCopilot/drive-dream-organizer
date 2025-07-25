import { useEffect } from 'react';

const AuthCallback = () => {
  useEffect(() => {
    // Extract the access token from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const error = urlParams.get('error');

    if (accessToken) {
      // Send success message to parent window
      window.opener?.postMessage({
        type: 'GOOGLE_AUTH_SUCCESS',
        accessToken: accessToken
      }, window.location.origin);
    } else if (error) {
      // Send error message to parent window
      window.opener?.postMessage({
        type: 'GOOGLE_AUTH_ERROR',
        error: error
      }, window.location.origin);
    }

    // Close the popup
    window.close();
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