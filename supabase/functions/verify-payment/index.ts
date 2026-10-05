// Supabase Edge Function: verify-payment
// Purpose: Cryptographically verified server-authoritative payment webhook handler

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PAYMENT_WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") ?? Deno.env.get("PAYMENT_SECRET_KEY") ?? "";

// Constant-time buffer comparison to prevent timing attacks
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let c = 0;
  for (let i = 0; i < a.byteLength; i++) {
    c |= a[i] ^ b[i];
  }
  return c === 0;
}

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, "");
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function verifyHmacSignature(rawBody: Uint8Array, signatureHeader: string, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const signatureBytes = hexToBytes(signatureHeader);
    const expectedSignature = await crypto.subtle.sign("HMAC", key, rawBody);
    return timingSafeEqual(new Uint8Array(expectedSignature), signatureBytes);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fail closed if secrets are missing (Rule: no fallback secrets)
  if (!PAYMENT_WEBHOOK_SECRET) {
    console.error("CRITICAL: PAYMENT_WEBHOOK_SECRET is not configured.");
    return new Response(JSON.stringify({ error: "Server payment configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("CRITICAL: Supabase service credentials missing.");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const signature = req.headers.get("x-payment-signature") ||
                      req.headers.get("x-signature") ||
                      req.headers.get("stripe-signature") || "";

    const rawBuffer = await req.arrayBuffer();
    const rawBytes = new Uint8Array(rawBuffer);

    // Cryptographic signature check
    const isValid = await verifyHmacSignature(rawBytes, signature, PAYMENT_WEBHOOK_SECRET);
    if (!isValid) {
      console.warn("Unauthorized webhook: invalid signature");
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyText = new TextDecoder().decode(rawBytes);
    const payload = JSON.parse(bodyText);

    const {
      order_id,
      provider,
      transaction_id,
      amount,
      currency,
      status,
    } = payload;

    // Strict payload validation
    if (!order_id || !transaction_id || !amount || status !== "succeeded") {
      return new Response(
        JSON.stringify({ error: "Invalid payment payload. Required: order_id, transaction_id, amount, status=succeeded" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid payment amount" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Execute atomic private settlement RPC
    const { data, error } = await supabase.rpc("fulfill_verified_payment", {
      p_order_id: order_id,
      p_provider: provider || "mobile_money",
      p_transaction_id: String(transaction_id),
      p_amount: numAmount,
      p_currency: currency || "ZMW",
      p_event_payload: payload,
    });

    if (error) {
      console.error("Payment settlement RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ received: true, settlement: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
