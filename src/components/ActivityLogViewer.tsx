import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, FileAudio, Settings, Shield, LogIn, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityLog {
  id: string;
  action_type: string;
  action_description: string;
  metadata: any;
  created_at: string;
}

const getActionIcon = (actionType: string) => {
  switch (actionType) {
    case "login":
      return <LogIn className="h-4 w-4" />;
    case "transcription":
      return <FileAudio className="h-4 w-4" />;
    case "upload":
      return <Upload className="h-4 w-4" />;
    case "settings":
      return <Settings className="h-4 w-4" />;
    case "admin":
      return <Shield className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
};

const getActionColor = (actionType: string) => {
  switch (actionType) {
    case "login":
      return "bg-green-500/10 text-green-500";
    case "transcription":
      return "bg-blue-500/10 text-blue-500";
    case "upload":
      return "bg-purple-500/10 text-purple-500";
    case "settings":
      return "bg-orange-500/10 text-orange-500";
    case "admin":
      return "bg-red-500/10 text-red-500";
    default:
      return "bg-gray-500/10 text-gray-500";
  }
};

export const ActivityLogViewer = () => {
  const queryClient = useQueryClient();

  const { data: activityLogs, isLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as ActivityLog[];
    },
  });

  // Subscribe to real-time updates
  useEffect(() => {
    let userId: string | null = null;

    const initRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;

      const channel = supabase
        .channel('activity-logs-viewer')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'activity_logs',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            // Invalidate and refetch activity logs
            queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    initRealtime();
  }, [queryClient]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>Recent account activity and actions</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">Loading activity...</p>
            </div>
          ) : !activityLogs || activityLogs.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">No activity recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${getActionColor(log.action_type)}`}>
                    {getActionIcon(log.action_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {log.action_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{log.action_description}</p>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {Object.entries(log.metadata).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium">{key}:</span> {String(value)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
