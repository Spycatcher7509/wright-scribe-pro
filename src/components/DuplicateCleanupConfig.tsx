import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const scheduleOptions = [
  { value: "0 0 * * 0", label: "Weekly (Sunday midnight)" },
  { value: "0 0 * * 1", label: "Weekly (Monday midnight)" },
  { value: "0 0 1 * *", label: "Monthly (1st day)" },
  { value: "0 0 */7 * *", label: "Every 7 days" },
  { value: "0 2 * * *", label: "Daily (2 AM)" },
];

export function DuplicateCleanupConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [keepLatest, setKeepLatest] = useState(true);
  const [deleteOlderThanDays, setDeleteOlderThanDays] = useState(30);
  const [runSchedule, setRunSchedule] = useState("0 0 * * 0");
  const [configId, setConfigId] = useState<string | null>(null);

  const { isLoading } = useQuery({
    queryKey: ["duplicate-cleanup-config"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/duplicate_cleanup_config?user_id=eq.${user.id}&select=*`, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      const data = await response.json();
      if (data && data.length > 0) {
        const config = data[0];
        setEnabled(config.enabled);
        setKeepLatest(config.keep_latest);
        setDeleteOlderThanDays(config.delete_older_than_days);
        setRunSchedule(config.run_schedule);
        setConfigId(config.id);
      }
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const session = await supabase.auth.getSession();

      const configData = {
        user_id: user.id,
        enabled,
        keep_latest: keepLatest,
        delete_older_than_days: deleteOlderThanDays,
        run_schedule: runSchedule,
      };

      if (configId) {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/duplicate_cleanup_config?id=eq.${configId}`, {
          method: 'PATCH',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(configData),
        });

        if (!response.ok) throw new Error('Failed to update config');
      } else {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/duplicate_cleanup_config`, {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(configData),
        });

        if (!response.ok) throw new Error('Failed to create config');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duplicate-cleanup-config"] });
      toast({
        title: "Configuration saved",
        description: "Cleanup settings have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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
    <Card>
      <CardHeader>
        <CardTitle>Automatic Cleanup Configuration</CardTitle>
        <CardDescription>
          Configure automatic cleanup rules for duplicate transcriptions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full"
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
}
