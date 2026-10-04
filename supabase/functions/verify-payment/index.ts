// Supabase Edge Function: verify-payment
// Purpose: Server-authoritative payment webhook & verification handler

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PAYMENT_SECRET_KEY = Deno.env.get("PAYMENT_SECRET_KEY") ?? "whsec_test_secret";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const signature = req.headers.get("x-payment-signature") || "";
    const body = await req.json();

    const { order_id, provider, transaction_id, amount, status } = body;

    if (!order_id || !transaction_id || status !== "succeeded") {
      return new Response(JSON.stringify({ error: "Invalid payment payload" }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Call atomic server-side payment fulfillment RPC
    const { data, error } = await supabase.rpc("fulfill_payment_and_credit_ledger", {
      p_order_id: order_id,
      p_provider: provider || "stripe",
      p_transaction_id: transaction_id,
      p_amount: amount,
      p_payload: body,
    });

    if (error) {
      console.error("Payment fulfillment RPC failed:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log("Payment fulfilled successfully:", data);

    return new Response(JSON.stringify({ received: true, status: data }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
