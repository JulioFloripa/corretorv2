const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = Deno.env.get("OMR_API_URL") || null;
  const hasToken = !!Deno.env.get("OMR_API_TOKEN");
  return new Response(JSON.stringify({ OMR_API_URL: url, has_token: hasToken }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});