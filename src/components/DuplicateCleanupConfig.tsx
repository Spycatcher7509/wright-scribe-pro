import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Database, Loader2, Trash2, Play, Clock } from "lucide-react";
import { DuplicateCleanupPreview } from "./DuplicateCleanupPreview";

const scheduleOptions = [
  { value: "0 0 * * 0", label: "Weekly (Sunday midnight)" },
  { value: "0 0 * * 1", label: "Weekly (Monday midnight)" },
  { value: "0 0 1 * *", label: "Monthly (1st day)" },
  { value: "0 0 */7 * *", label: "Every 7 days" },
  { value: "0 2 * * *", label: "Daily (2 AM)" },
];

export function DuplicateCleanupConfig() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [keepLatest, setKeepLatest] = useState(true);
  const [deleteOlderThanDays, setDeleteOlderThanDays] = useState(30);
  const [runSchedule, setRunSchedule] = useState("0 0 * * 0");

  const { data: config, isLoading } = useQuery({
    queryKey: ["cleanup-config"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("duplicate_cleanup_config")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setEnabled(data.enabled);
        setKeepLatest(data.keep_latest);
        setDeleteOlderThanDays(data.delete_older_than_days);
        setRunSchedule(data.run_schedule);
      }

      return data;
    },
  });

  const { data: lastCleanup } = useQuery({
    queryKey: ["last-cleanup"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("duplicate_cleanup_history")
        .select("run_at")
        .eq("user_id", user.id)
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: enabled,
  });

  const getNextScheduledRun = () => {
    if (!enabled || !lastCleanup?.run_at) return null;

    const lastRun = new Date(lastCleanup.run_at);
    const now = new Date();

    // Parse schedule to determine next run
    const parts = runSchedule.split(' ');
    if (parts.length < 5) return null;

    const weekday = parts[4];
    const dayOfMonth = parts[2];

    let nextRun = new Date(lastRun);

    if (weekday !== '*') {
      // Weekly schedule
      nextRun.setDate(nextRun.getDate() + 7);
    } else if (dayOfMonth !== '*' && dayOfMonth !== '1') {
      // Specific day of month
      nextRun.setMonth(nextRun.getMonth() + 1);
    } else if (dayOfMonth === '1') {
      // Monthly on first day
      nextRun.setMonth(nextRun.getMonth() + 1);
    } else {
      // Daily
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun > now ? nextRun : null;
  };

  const nextRun = getNextScheduledRun();

  const updateConfigMutation = useMutation({
    mutationFn: async (e: React.FormEvent) => {
      e.preventDefault();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const configData = {
        user_id: user.id,
        enabled,
        keep_latest: keepLatest,
        delete_older_than_days: deleteOlderThanDays,
        run_schedule: runSchedule,
      };

      if (config?.id) {
        const { error } = await supabase
          .from("duplicate_cleanup_config")
          .update(configData)
          .eq("id", config.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("duplicate_cleanup_config")
          .insert(configData);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-config"] });
      toast.success("Configuration saved successfully");
    },
    onError: (error: any) => {
      toast.error("Failed to save configuration: " + error.message);
    },
  });

  // Manual cleanup trigger
  const runCleanupMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("cleanup-duplicates", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-config"] });
      queryClient.invalidateQueries({ queryKey: ["cleanup-history"] });
      toast.success(
        `Cleanup completed! Removed ${data.filesDeleted} duplicates (${data.spaceFreed}MB freed)`
      );
    },
    onError: (error: any) => {
      toast.error("Cleanup failed: " + error.message);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle>Automatic Cleanup Configuration</CardTitle>
              <CardDescription>
                Configure automatic cleanup rules for duplicate transcriptions
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
        <form onSubmit={(e) => updateConfigMutation.mutate(e)} className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enabled">Enable Automatic Cleanup</Label>
              <p className="text-sm text-muted-foreground">
                Automatically remove duplicate transcriptions based on schedule
              </p>
            </div>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {enabled && nextRun && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <span className="text-muted-foreground">Next scheduled cleanup: </span>
                <span className="font-medium">
                  {nextRun.toLocaleDateString("en-GB")} at {nextRun.toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="schedule">Cleanup Schedule</Label>
            <Select value={runSchedule} onValueChange={setRunSchedule}>
              <SelectTrigger id="schedule">
                <SelectValue placeholder="Select schedule" />
              </SelectTrigger>
              <SelectContent>
                {scheduleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="retention">Delete Files Older Than (days)</Label>
            <Input
              id="retention"
              type="number"
              min="1"
              value={deleteOlderThanDays}
              onChange={(e) => setDeleteOlderThanDays(parseInt(e.target.value) || 30)}
            />
            <p className="text-sm text-muted-foreground">
              Only duplicate files older than this many days will be deleted
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="keep-latest">Keep Latest Version</Label>
              <p className="text-sm text-muted-foreground">
                Always keep the most recent duplicate
              </p>
            </div>
            <Switch
              id="keep-latest"
              checked={keepLatest}
              onCheckedChange={setKeepLatest}
            />
          </div>

          <div className="pt-4 border-t">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Label className="text-base">Manual Cleanup</Label>
                <p className="text-sm text-muted-foreground">
                  Run cleanup now based on current settings
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => runCleanupMutation.mutate()}
                disabled={runCleanupMutation.isPending || !enabled}
              >
                {runCleanupMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Run Now
                  </>
                )}
              </Button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={updateConfigMutation.isPending}
            className="w-full"
          >
            {updateConfigMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                Save Configuration
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>

    <DuplicateCleanupPreview
      keepLatest={keepLatest}
      deleteOlderThanDays={deleteOlderThanDays}
      enabled={enabled}
    />
  </div>
  );
}
