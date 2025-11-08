import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupConfig {
  id: string;
  user_id: string;
  enabled: boolean;
  run_schedule: string;
  delete_older_than_days: number;
  keep_latest: boolean;
}

interface CleanupHistory {
  run_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting scheduled cleanup check...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all enabled cleanup configurations
    const { data: configs, error: configError } = await supabase
      .from('duplicate_cleanup_config')
      .select('*')
      .eq('enabled', true);

    if (configError) {
      console.error('Error fetching configs:', configError);
      throw configError;
    }

    console.log(`Found ${configs?.length || 0} enabled cleanup configurations`);

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No enabled cleanup configurations found', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const results = [];
    let processed = 0;

    for (const config of configs as CleanupConfig[]) {
      try {
        console.log(`Checking schedule for user ${config.user_id}, schedule: ${config.run_schedule}`);

        // Get the last cleanup run for this user
        const { data: lastRun, error: historyError } = await supabase
          .from('duplicate_cleanup_history')
          .select('run_at')
          .eq('user_id', config.user_id)
          .order('run_at', { ascending: false })
          .limit(1)
          .single();

        if (historyError && historyError.code !== 'PGRST116') {
          console.error(`Error fetching history for user ${config.user_id}:`, historyError);
          continue;
        }

        const shouldRun = shouldRunCleanup(config.run_schedule, lastRun as CleanupHistory | null);
        
        if (!shouldRun) {
          console.log(`Skipping cleanup for user ${config.user_id} - not time yet`);
          continue;
        }

        console.log(`Running cleanup for user ${config.user_id}`);

        // Run the cleanup logic
        const cleanupResult = await runCleanupForUser(supabase, config);
        
        results.push({
          user_id: config.user_id,
          success: true,
          ...cleanupResult,
        });
        
        processed++;
      } catch (error) {
        console.error(`Error processing cleanup for user ${config.user_id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          user_id: config.user_id,
          success: false,
          error: errorMessage,
        });
      }
    }

    console.log(`Scheduled cleanup completed. Processed ${processed} users.`);

    return new Response(
      JSON.stringify({
        message: 'Scheduled cleanup completed',
        processed,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in scheduled cleanup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function shouldRunCleanup(schedule: string, lastRun: CleanupHistory | null): boolean {
  if (!lastRun) {
    // Never run before, so run now
    return true;
  }

  const now = new Date();
  const lastRunDate = new Date(lastRun.run_at);
  const hoursSinceLastRun = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);

  // Parse cron-like schedule format
  // Format: "minute hour day month weekday"
  // Common patterns:
  // Daily: "0 0 * * *"
  // Weekly (Sunday): "0 0 * * 0"
  // Monthly: "0 0 1 * *"
  
  const parts = schedule.split(' ');
  
  if (parts.length >= 5) {
    const weekday = parts[4];
    const dayOfMonth = parts[2];
    
    // Weekly schedule (specific day of week)
    if (weekday !== '*') {
      // Run if it's been more than 6.5 days
      return hoursSinceLastRun >= 156;
    }
    
    // Monthly schedule (specific day of month)
    if (dayOfMonth !== '*' && dayOfMonth !== '1') {
      // Run if it's been more than 29 days
      return hoursSinceLastRun >= 696;
    }
    
    if (dayOfMonth === '1') {
      // First of month - run if it's been more than 29 days
      return hoursSinceLastRun >= 696;
    }
    
    // Daily schedule
    // Run if it's been more than 23 hours
    return hoursSinceLastRun >= 23;
  }
  
  // Default to daily if can't parse
  return hoursSinceLastRun >= 23;
}

async function runCleanupForUser(supabase: any, config: CleanupConfig) {
  console.log(`Running cleanup for user ${config.user_id}`);

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.delete_older_than_days);

  // Fetch all transcription logs for this user (excluding protected files)
  const { data: logs, error: logsError } = await supabase
    .from('transcription_logs')
    .select('*')
    .eq('user_id', config.user_id)
    .eq('is_protected', false);

  if (logsError) {
    throw new Error(`Failed to fetch logs: ${logsError.message}`);
  }

  if (!logs || logs.length === 0) {
    console.log(`No logs found for user ${config.user_id}`);
    return { files_deleted: 0, space_freed: 0 };
  }

  // Group by file_checksum
  const checksumGroups = new Map<string, any[]>();
  
  for (const log of logs) {
    if (!log.file_checksum) continue;
    
    if (!checksumGroups.has(log.file_checksum)) {
      checksumGroups.set(log.file_checksum, []);
    }
    checksumGroups.get(log.file_checksum)!.push(log);
  }

  // Find duplicates to delete
  const toDelete: string[] = [];
  let totalSpaceFreed = 0;

  for (const [checksum, duplicates] of checksumGroups) {
    if (duplicates.length <= 1) continue;

    // Sort by created_at descending (newest first)
    duplicates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Determine which to delete based on configuration
    const itemsToDelete = config.keep_latest ? duplicates.slice(1) : duplicates.slice(0, -1);

    for (const item of itemsToDelete) {
      const itemDate = new Date(item.created_at);
      if (itemDate <= cutoffDate) {
        toDelete.push(item.id);
        // Estimate file size (this is approximate)
        if (item.transcription_text) {
          totalSpaceFreed += item.transcription_text.length;
        }
      }
    }
  }

  console.log(`Found ${toDelete.length} duplicate files to delete for user ${config.user_id}`);

  // Delete the duplicates
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('transcription_logs')
      .delete()
      .in('id', toDelete);

    if (deleteError) {
      throw new Error(`Failed to delete duplicates: ${deleteError.message}`);
    }
  }

  // Log the cleanup
  const { error: historyError } = await supabase
    .from('duplicate_cleanup_history')
    .insert({
      user_id: config.user_id,
      files_deleted: toDelete.length,
      space_freed_bytes: totalSpaceFreed,
      status: 'completed',
    });

  if (historyError) {
    console.error('Failed to log cleanup history:', historyError);
  }

  // Log user activity
  const { error: activityError } = await supabase
    .from('activity_logs')
    .insert({
      user_id: config.user_id,
      action_type: 'cleanup',
      action_description: `Scheduled cleanup: Deleted ${toDelete.length} duplicate files`,
      metadata: {
        files_deleted: toDelete.length,
        space_freed_bytes: totalSpaceFreed,
        scheduled: true,
      },
    });

  if (activityError) {
    console.error('Failed to log activity:', activityError);
  }

  return {
    files_deleted: toDelete.length,
    space_freed: totalSpaceFreed,
  };
}
