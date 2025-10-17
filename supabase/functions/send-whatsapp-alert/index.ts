import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppRequest {
  phoneNumber: string;
  brand: string;
  host: string;
  port: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, brand, host, port }: WhatsAppRequest = await req.json();
    
    console.log(`Sending WhatsApp alert for ${brand} - ${host}:${port} to ${phoneNumber}`);
    
    // Format the message
    const message = `🚨 PORT CLOSED ALERT\n\nBrand: ${brand}\nHost: ${host}\nPort: ${port}\nTime: ${new Date().toLocaleString()}\n\nPlease check the connection immediately.`;
    
    // Using WhatsApp Business API via WhatsApp Cloud API
    // Note: User needs to set up Meta Business Account and get access token
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    
    if (!accessToken || !phoneNumberId) {
      console.log('WhatsApp credentials not configured. Message would be:', message);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'WhatsApp not configured, but alert logged',
          alert: message 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Send via WhatsApp Cloud API
    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'text',
          text: { body: message }
        })
      }
    );

    const responseData = await whatsappResponse.json();
    
    if (!whatsappResponse.ok) {
      console.error('WhatsApp API error:', responseData);
      throw new Error('Failed to send WhatsApp message');
    }

    console.log('WhatsApp message sent successfully:', responseData);

    return new Response(
      JSON.stringify({ success: true, data: responseData }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in send-whatsapp-alert:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
