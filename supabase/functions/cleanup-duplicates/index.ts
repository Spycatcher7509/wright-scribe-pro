import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CleanupConfig {
  user_id: string;
  enabled: boolean;
  delete_older_than_days: number;
  keep_latest: boolean;
}

interface TranscriptionLog {
  id: string;
  user_id: string;
  file_checksum: string;
  created_at: string;
  file_title: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting duplicate cleanup process...");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    console.log(`Processing cleanup for user: ${user.id}`);

    // Get user's cleanup configuration
    const { data: config, error: configError } = await supabase
      .from("duplicate_cleanup_config")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (configError) {
      console.log("No cleanup config found for user");
      return new Response(
        JSON.stringify({ 
          message: "No cleanup configuration found",
          filesDeleted: 0,
          spaceFreed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanupConfig = config as CleanupConfig;

    // Check if cleanup is enabled
    if (!cleanupConfig.enabled) {
      console.log("Cleanup is disabled for this user");
      return new Response(
        JSON.stringify({ 
          message: "Cleanup is disabled",
          filesDeleted: 0,
          spaceFreed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - cleanupConfig.delete_older_than_days);
    console.log(`Cutoff date: ${cutoffDate.toISOString()}`);

    // Get all transcriptions for the user (excluding protected files)
    const { data: allLogs, error: logsError } = await supabase
      .from("transcription_logs")
      .select("id, user_id, file_checksum, created_at, file_title, file_path, is_protected")
      .eq("user_id", user.id)
      .eq("is_protected", false)
      .not("file_checksum", "is", null)
      .order("created_at", { ascending: false });

    if (logsError) {
      throw logsError;
    }

    if (!allLogs || allLogs.length === 0) {
      console.log("No transcriptions found");
      return new Response(
        JSON.stringify({ 
          message: "No transcriptions to clean",
          filesDeleted: 0,
          spaceFreed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${allLogs.length} total transcriptions`);

    // Group by checksum
    const checksumGroups = new Map<string, TranscriptionLog[]>();
    for (const log of allLogs) {
      if (!log.file_checksum) continue;
      
      if (!checksumGroups.has(log.file_checksum)) {
        checksumGroups.set(log.file_checksum, []);
      }
      checksumGroups.get(log.file_checksum)!.push(log as TranscriptionLog);
    }

    console.log(`Found ${checksumGroups.size} unique checksums`);

    // Find duplicates to delete
    const toDelete: string[] = [];
    let spaceFreedBytes = 0;

    for (const [checksum, logs] of checksumGroups.entries()) {
      // Only process if there are duplicates
      if (logs.length > 1) {
        console.log(`Found ${logs.length} duplicates for checksum: ${checksum}`);
        
        // Sort by created_at descending (newest first)
        logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Determine which ones to delete
        const itemsToDelete = cleanupConfig.keep_latest 
          ? logs.slice(1) // Keep the first (newest), delete the rest
          : logs.filter(log => new Date(log.created_at) < cutoffDate);

        for (const log of itemsToDelete) {
          toDelete.push(log.id);
          // Estimate space freed (rough estimate: 1MB per transcription)
          spaceFreedBytes += 1024 * 1024;
        }
      }
    }

    console.log(`Found ${toDelete.length} duplicates to delete`);

    // Delete duplicates
    let filesDeleted = 0;
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("transcription_logs")
        .delete()
        .in("id", toDelete);

      if (deleteError) {
        throw deleteError;
      }

      filesDeleted = toDelete.length;
      console.log(`Deleted ${filesDeleted} duplicate transcriptions`);
    }

    // Log the cleanup activity
    const { error: historyError } = await supabase
      .from("duplicate_cleanup_history")
      .insert({
        user_id: user.id,
        files_deleted: filesDeleted,
        space_freed_bytes: spaceFreedBytes,
        status: "completed",
      });

    if (historyError) {
      console.error("Error logging cleanup history:", historyError);
    }

    // Log user activity
    await supabase.from("activity_logs").insert({
      user_id: user.id,
      action_type: "admin",
      action_description: `Cleanup completed: ${filesDeleted} duplicates removed`,
      metadata: {
        files_deleted: filesDeleted,
        space_freed_mb: Math.round(spaceFreedBytes / (1024 * 1024)),
      },
    });

    const response = {
      message: "Cleanup completed successfully",
      filesDeleted,
      spaceFreed: Math.round(spaceFreedBytes / (1024 * 1024)), // Convert to MB
      checksumGroupsFound: checksumGroups.size,
    };

    console.log("Cleanup completed:", response);

    return new Response(
      JSON.stringify(response),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("Error in cleanup function:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
