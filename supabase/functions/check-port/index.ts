const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// EastGate brands configuration
const BRANDS: Record<string, { host: string; default_port: number; brain_net_ip: string; live_ip: string }> = {
  "Bareeze": { host: "barz.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.25", live_ip: "202.59.94.86" },
  "Bareeze Men": { host: "bman.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.26", live_ip: "202.59.94.92" },
  "Chineyere": { host: "chny.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.28", live_ip: "202.59.94.88" },
  "Mini Minor": { host: "mmnr.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.29", live_ip: "202.59.94.87" },
  "Rangja": { host: "rnja.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.30", live_ip: "202.59.94.91" },
  "The Entertainer": { host: "te.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.32", live_ip: "202.59.94.93" },
};

async function checkPortConnection(
  hostname: string,
  port: number,
  timeout: number = 3000
): Promise<{ open: boolean; time_ms: number; message: string }> {
  const startTime = performance.now();
  
  try {
    // Use Deno.connect to attempt TCP connection
    const conn = await Promise.race([
      Deno.connect({ hostname, port }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), timeout)
      ),
    ]);
    
    conn.close();
    const elapsed = performance.now() - startTime;
    
    return {
      open: true,
      time_ms: Math.round(elapsed),
      message: 'Successfully connected',
    };
  } catch (error: any) {
    const elapsed = performance.now() - startTime;
    
    if (error.message === 'Connection timeout') {
      return {
        open: false,
        time_ms: Math.round(elapsed),
        message: 'Connection timed out',
      };
    }
    
    return {
      open: false,
      time_ms: Math.round(elapsed),
      message: `Connection error: ${error.message}`,
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brand, port, timeout = 3, ip } = await req.json();

    // Validate brand
    if (!brand || !BRANDS[brand]) {
      return new Response(
        JSON.stringify({ error: 'Unknown or missing brand' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Use provided IP or fall back to brand host
    const host = ip || BRANDS[brand].host;

    // Validate port
    if (!port || port < 1 || port > 65535) {
      return new Response(
        JSON.stringify({ error: 'Invalid port number' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate timeout
    const timeoutMs = Math.min(Math.max(timeout * 1000, 1000), 30000);

    console.log(`Checking port: ${host}:${port} (timeout: ${timeoutMs}ms)`);

    // Perform the actual port check
    const result = await checkPortConnection(host, port, timeoutMs);

    return new Response(
      JSON.stringify({
        open: result.open,
        host,
        port,
        time_ms: result.time_ms,
        message: result.message,
        brand,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('Error in check-port function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
