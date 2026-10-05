// Supabase Edge Function: storage-cleanup-worker
// Purpose: Periodic resource maintenance to release expired reservations and prune stale media records

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req: Request) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing service credentials" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Release expired inventory reservations
    const { data: releasedReservations, error: resErr } = await supabase.rpc(
      "release_expired_inventory_reservations"
    );

    if (resErr) {
      console.error("Error releasing expired reservations:", resErr);
    } else {
      console.log(`Released ${releasedReservations ?? 0} expired inventory reservations.`);
    }

    // 2. Settle pending seller proceeds that reached T+2
    const { data: settledProceeds, error: settleErr } = await supabase.rpc(
      "settle_seller_proceeds_batch"
    );

    if (settleErr) {
      console.error("Error executing settlement batch:", settleErr);
    } else {
      console.log(`Settled ${settledProceeds ?? 0} seller orders to available balance.`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        releasedReservations: releasedReservations ?? 0,
        settledOrders: settledProceeds ?? 0,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
