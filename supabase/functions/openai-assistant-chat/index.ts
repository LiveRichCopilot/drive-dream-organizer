import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASSISTANT_ID = 'asst_ZyzVMqt7uCPhfkOeZofSHR6N';
const ORGANIZATION_ID = 'org-bhqsCv9pmbOqWllRjkPbfaMr';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, threadId, action } = await req.json();
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not found');
    }

    const headers = {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2',
      'OpenAI-Organization': ORGANIZATION_ID,
    };

    // Create thread if needed
    let currentThreadId = threadId;
    if (!currentThreadId && action !== 'list_threads') {
      const threadResponse = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          metadata: {
            user_context: 'photo_organization_app',
            created_at: new Date().toISOString()
          }
        }),
      });

      if (!threadResponse.ok) {
        throw new Error(`Failed to create thread: ${await threadResponse.text()}`);
      }

      const threadData = await threadResponse.json();
      currentThreadId = threadData.id;
    }

    // Handle different actions
    switch (action) {
      case 'send_message':
        // Add message to thread
        await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            role: 'user',
            content: message,
            metadata: {
              timestamp: new Date().toISOString()
            }
          }),
        });

        // Run the assistant (using pre-configured instructions and functions)
        const runResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            assistant_id: ASSISTANT_ID,
            // No custom instructions - use the assistant's pre-configured instructions and functions
            metadata: {
              user_session: new Date().toISOString()
            }
          }),
        });

        if (!runResponse.ok) {
          throw new Error(`Failed to run assistant: ${await runResponse.text()}`);
        }

        const runData = await runResponse.json();

        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30;
        let status = runData.status;

        while (status === 'queued' || status === 'in_progress') {
          if (attempts >= maxAttempts) {
            throw new Error('Assistant response timeout');
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const statusResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs/${runData.id}`, {
            headers,
          });

          if (!statusResponse.ok) {
            throw new Error(`Failed to check run status: ${await statusResponse.text()}`);
          }

          const statusData = await statusResponse.json();
          status = statusData.status;
          attempts++;
        }

        if (status === 'failed') {
          throw new Error('Assistant run failed');
        }

        // Get messages
        const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages?order=desc&limit=1`, {
          headers,
        });

        if (!messagesResponse.ok) {
          throw new Error(`Failed to get messages: ${await messagesResponse.text()}`);
        }

        const messagesData = await messagesResponse.json();
        const assistantMessage = messagesData.data[0];

        return new Response(JSON.stringify({
          threadId: currentThreadId,
          message: assistantMessage.content[0].text.value,
          messageId: assistantMessage.id,
          timestamp: assistantMessage.created_at
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'get_messages':
        const getMessagesResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages?order=asc`, {
          headers,
        });

        if (!getMessagesResponse.ok) {
          throw new Error(`Failed to get messages: ${await getMessagesResponse.text()}`);
        }

        const allMessages = await getMessagesResponse.json();
        
        return new Response(JSON.stringify({
          threadId: currentThreadId,
          messages: allMessages.data.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content[0].text.value,
            timestamp: msg.created_at
          }))
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Error in assistant chat:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Assistant chat failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});