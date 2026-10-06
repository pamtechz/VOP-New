// Supabase Edge Function: short-link-handler
// Purpose: Base62 Short Link Resolver & Redirector with aggregated analytics tracking

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://pamtechz.com";

serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.pathname.replace(/^\//, "");

  if (!code) {
    return new Response("Invalid Short Code", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Look up active short link
  const { data: shortLink, error } = await supabase
    .from("short_links")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .single();

  const isExpired = shortLink?.expires_at && new Date(shortLink.expires_at) <= new Date();

  if (error || !shortLink || isExpired) {
    const notFoundHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Link No Longer Available</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 3rem 1rem; background: #0f172a; color: #f8fafc; }
            .card { max-width: 420px; margin: 0 auto; background: #1e293b; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h1 { color: #f43f5e; font-size: 1.5rem; margin-bottom: 0.5rem; }
            p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
            a { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #3b82f6; color: white; border-radius: 8px; text-decoration: none; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Link No Longer Available</h1>
            <p>The marketplace link you followed may have expired, been updated, or removed.</p>
            <a href="${APP_BASE_URL}">Open Marketplace</a>
          </div>
        </body>
      </html>
    `;
    return new Response(notFoundHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 404,
    });
  }

  // Increment daily click metric asynchronously
  supabase.rpc("track_short_link_click", {
    p_short_link_id: shortLink.id,
  }).catch((err) => console.error("Error logging click metric:", err));

  // Determine redirect URL according to destination type
  let destinationUrl = APP_BASE_URL;
  if (shortLink.destination_type === "product") {
    destinationUrl = `${APP_BASE_URL}/product/${shortLink.destination_id}`;
  } else if (shortLink.destination_type === "store") {
    destinationUrl = `${APP_BASE_URL}/store/${shortLink.destination_id}`;
  } else if (shortLink.destination_type === "category") {
    destinationUrl = `${APP_BASE_URL}/category/${shortLink.destination_id}`;
  } else if (shortLink.destination_type === "campaign") {
    destinationUrl = `${APP_BASE_URL}/campaign/${shortLink.destination_id}`;
  } else if (shortLink.destination_type === "external" && shortLink.external_url) {
    if (shortLink.external_url.startsWith("http://") || shortLink.external_url.startsWith("https://")) {
      destinationUrl = shortLink.external_url;
    }
  }

  // 302 Temporary Redirect to target destination
  return Response.redirect(destinationUrl, 302);
});
