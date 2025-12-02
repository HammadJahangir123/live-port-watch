import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailAlertRequest {
  brand: string;
  ip: string;
  ipType: string;
  closedSince: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brand, ip, ipType, closedSince }: EmailAlertRequest = await req.json();
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    console.log(`Sending email alert for ${brand} - ${ipType}: ${ip}`);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Port Monitor <onboarding@resend.dev>",
        to: ["hammad.jahangir@eastgateindustries.com"],
        subject: `🚨 PORT CLOSED: ${brand} - ${ipType}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #dc2626; margin-bottom: 20px;">⚠️ Port Closed Alert</h1>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0;"><strong>Brand:</strong> ${brand}</p>
              <p style="margin: 0 0 10px 0;"><strong>IP Type:</strong> ${ipType}</p>
              <p style="margin: 0 0 10px 0;"><strong>IP Address:</strong> ${ip}</p>
              <p style="margin: 0 0 10px 0;"><strong>Port:</strong> 20000</p>
              <p style="margin: 0 0 10px 0;"><strong>Closed Since:</strong> ${closedSince}</p>
              <p style="margin: 0;"><strong>Alert Time:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <p style="color: #991b1b; font-weight: bold;">This port has been closed for more than 2 minutes. Please check the connection immediately.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">EastGate Port Status Monitor</p>
          </div>
        `,
      }),
    });

    const data = await res.json();
    console.log("Email sent:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-email-alert:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
