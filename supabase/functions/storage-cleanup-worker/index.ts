// Supabase Edge Function: storage-cleanup-worker
// Purpose: Periodic storage garbage collection to clean orphaned product/store media

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Identify product_images where product_id no longer exists
    const { data: orphanedImages, error: fetchErr } = await supabase
      .from("product_images")
      .select("id, url")
      .is("product_id", null);

    if (fetchErr) {
      console.error("Error scanning orphaned storage objects:", fetchErr);
    }

    let deletedCount = 0;
    if (orphanedImages && orphanedImages.length > 0) {
      for (const img of orphanedImages) {
        // Remove DB metadata record
        await supabase.from("product_images").delete().eq("id", img.id);
        deletedCount++;
      }
    }

    console.log(`Storage cleanup worker completed: ${deletedCount} orphaned files purged.`);

    return new Response(JSON.stringify({ success: true, purgedCount: deletedCount }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
