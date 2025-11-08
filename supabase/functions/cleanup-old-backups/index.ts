import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    console.log('Starting old backup cleanup...');

    // Get all users with auto-cleanup enabled
    const { data: retentionSettings, error: settingsError } = await supabaseClient
      .from('backup_retention_settings')
      .select('user_id, retention_days')
      .eq('auto_cleanup_enabled', true);

    if (settingsError) {
      console.error('Error fetching retention settings:', settingsError);
      throw settingsError;
    }

    console.log(`Found ${retentionSettings?.length || 0} users with auto-cleanup enabled`);

    let totalDeleted = 0;

    // Process each user's backups
    for (const setting of retentionSettings || []) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - setting.retention_days);

      console.log(`Cleaning backups for user ${setting.user_id} older than ${cutoffDate.toISOString()}`);

      const { data: deletedBackups, error: deleteError } = await supabaseClient
        .from('preset_backups')
        .delete()
        .eq('user_id', setting.user_id)
        .lt('backed_up_at', cutoffDate.toISOString())
        .select('id');

      if (deleteError) {
        console.error(`Error deleting backups for user ${setting.user_id}:`, deleteError);
        continue;
      }

      const deletedCount = deletedBackups?.length || 0;
      totalDeleted += deletedCount;

      if (deletedCount > 0) {
        console.log(`Deleted ${deletedCount} old backups for user ${setting.user_id}`);
      }
    }

    console.log(`Cleanup completed. Total backups deleted: ${totalDeleted}`);

    return new Response(
      JSON.stringify({
        success: true,
        totalDeleted,
        processedUsers: retentionSettings?.length || 0,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in cleanup-old-backups function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
