// Gmail API utility for sending emails using existing Google OAuth

interface GmailMessage {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export const sendGmailMessage = async (message: GmailMessage): Promise<void> => {
  const token = localStorage.getItem('google_access_token');
  
  if (!token) {
    throw new Error('No Google access token available');
  }

  // Create email message in RFC 2822 format
  const emailLines = [
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Content-Type: text/html; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    message.html
  ];
  
  const email = emailLines.join('\r\n');
  
  // Base64url encode the message
  const encodedMessage = btoa(email)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedMessage
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Gmail API error:', errorData);
    throw new Error(`Failed to send email: ${response.status} ${response.statusText}`);
  }

  console.log('Email sent successfully via Gmail API');
};

// Helper to get user's email from Google API
export const getUserEmail = async (): Promise<string> => {
  const token = localStorage.getItem('google_access_token');
  
  if (!token) {
    throw new Error('No Google access token available');
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  const userInfo = await response.json();
  return userInfo.email;
};