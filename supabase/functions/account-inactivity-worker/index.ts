// Supabase Edge Function: account-inactivity-worker
// Purpose: Scheduled worker for account inactivity warnings & deletion lifecycle

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Invoke atomic inactivity batch processor in PostgreSQL
    const { data, error } = await supabase.rpc("process_account_inactivity_batch", {
      p_batch_size: 50,
    });

    if (error) {
      console.error("Error running inactivity worker batch:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log("Inactivity batch process result:", data);

    return new Response(JSON.stringify({ success: true, summary: data }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
