import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Activity, Search, Filter, FileAudio, Settings, Shield, LogIn, Upload, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  action_description: string;
  metadata: any;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  user_group: string;
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

const AdminActivityDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roles?.role !== "admin") {
        toast.error("Access denied. Admin privileges required.");
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
    };

    checkAdmin();
  }, [navigate]);

  // Fetch all users for mapping
  const { data: users } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, user_group");

      if (error) throw error;
      return data as UserProfile[];
    },
    enabled: isAdmin,
  });

  // Fetch all activity logs
  const { data: activityLogs, isLoading } = useQuery({
    queryKey: ["admin-activity-logs", actionTypeFilter],
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (actionTypeFilter !== "all") {
        query = query.eq("action_type", actionTypeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ActivityLog[];
    },
    enabled: isAdmin,
    refetchInterval: 5000, // Refetch every 5 seconds for near real-time updates
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('admin-activity-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
        },
        () => {
          // Trigger refetch when new activity is logged
          queryClient.invalidateQueries({ queryKey: ["admin-activity-logs"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const getUserEmail = (userId: string) => {
    return users?.find(u => u.id === userId)?.email || "Unknown User";
  };

  const filteredLogs = activityLogs?.filter(log => {
    const userEmail = getUserEmail(log.user_id);
    const matchesSearch = 
      log.action_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      userEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="max-w-7xl mx-auto pt-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard")}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <CardTitle>Admin Activity Dashboard</CardTitle>
                  <CardDescription>
                    Monitor all user activity across the system
                  </CardDescription>
                </div>
              </div>
              <Badge variant="destructive" className="h-6">
                <Shield className="h-3 w-3 mr-1" />
                Admin Only
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user email or activity..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="transcription">Transcription</SelectItem>
                  <SelectItem value="upload">Upload</SelectItem>
                  <SelectItem value="settings">Settings</SelectItem>
                  <SelectItem value="admin">Admin Actions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Activity Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{activityLogs?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">Total Activities</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {activityLogs?.filter(l => l.action_type === "login").length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Logins</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {activityLogs?.filter(l => l.action_type === "transcription").length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Transcriptions</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {new Set(activityLogs?.map(l => l.user_id)).size || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Active Users</p>
                </CardContent>
              </Card>
            </div>

            {/* Activity Log */}
            <ScrollArea className="h-[600px] pr-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !filteredLogs || filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-sm text-muted-foreground">No activity found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                    >
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${getActionColor(log.action_type)}`}>
                        {getActionIcon(log.action_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {log.action_type}
                          </Badge>
                          <span className="text-sm font-medium">
                            {getUserEmail(log.user_id)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">{log.action_description}</p>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
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
      </div>
    </div>
  );
};

export default AdminActivityDashboard;
