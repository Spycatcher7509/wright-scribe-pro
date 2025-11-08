import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend, ResponsiveContainer } from "recharts";

interface TranscriptionStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  pending: number;
  completionRate: number;
}

interface ErrorStat {
  error: string;
  count: number;
}

export default function AdminTranscriptionAnalytics() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<TranscriptionStats>({
    total: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    pending: 0,
    completionRate: 0,
  });
  const [errorStats, setErrorStats] = useState<ErrorStat[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAdminAndFetchData();
  }, []);

  const checkAdminAndFetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (roleData?.role !== "admin") {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    setIsAdmin(true);
    await fetchAnalytics();
  };

  const fetchAnalytics = async () => {
    setLoading(true);

    // Fetch transcription logs statistics
    const { data: logs, error: logsError } = await supabase
      .from("transcription_logs")
      .select("status, error_message");

    if (logsError) {
      toast({
        title: "Error",
        description: "Failed to fetch transcription analytics.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Calculate statistics
    const total = logs?.length || 0;
    const completed = logs?.filter(log => log.status === "completed").length || 0;
    const failed = logs?.filter(log => log.status === "failed").length || 0;
    const processing = logs?.filter(log => log.status === "processing").length || 0;
    const pending = logs?.filter(log => log.status === "pending").length || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    setStats({
      total,
      completed,
      failed,
      processing,
      pending,
      completionRate,
    });

    // Calculate error statistics
    const failedLogs = logs?.filter(log => log.status === "failed" && log.error_message) || [];
    const errorMap = new Map<string, number>();

    failedLogs.forEach(log => {
      const error = log.error_message || "Unknown error";
      // Truncate long error messages
      const shortError = error.length > 50 ? error.substring(0, 50) + "..." : error;
      errorMap.set(shortError, (errorMap.get(shortError) || 0) + 1);
    });

    const errorStatsArray = Array.from(errorMap.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 errors

    setErrorStats(errorStatsArray);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const statusChartData = [
    { name: "Completed", value: stats.completed, fill: "hsl(var(--chart-1))" },
    { name: "Failed", value: stats.failed, fill: "hsl(var(--chart-2))" },
    { name: "Processing", value: stats.processing, fill: "hsl(var(--chart-3))" },
    { name: "Pending", value: stats.pending, fill: "hsl(var(--chart-4))" },
  ];

  const chartConfig = {
    completed: {
      label: "Completed",
      color: "hsl(var(--chart-1))",
    },
    failed: {
      label: "Failed",
      color: "hsl(var(--chart-2))",
    },
    processing: {
      label: "Processing",
      color: "hsl(var(--chart-3))",
    },
    pending: {
      label: "Pending",
      color: "hsl(var(--chart-4))",
    },
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              className="mb-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <h1 className="text-4xl font-bold text-foreground">Transcription Analytics</h1>
            <p className="text-muted-foreground mt-2">Monitor transcription progress and error patterns</p>
          </div>
          <Button onClick={fetchAnalytics} variant="outline">
            Refresh Data
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transcriptions</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completionRate}%</div>
              <p className="text-xs text-muted-foreground">{stats.completed} completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.failed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.processing + stats.pending}</div>
              <p className="text-xs text-muted-foreground">
                {stats.processing} processing, {stats.pending} pending
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Status Distribution</CardTitle>
              <CardDescription>Breakdown of transcription statuses</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Top Error Types */}
          <Card>
            <CardHeader>
              <CardTitle>Common Error Types</CardTitle>
              <CardDescription>Most frequent transcription errors</CardDescription>
            </CardHeader>
            <CardContent>
              {errorStats.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis 
                        type="category" 
                        dataKey="error" 
                        width={150}
                        tick={{ fontSize: 10 }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="hsl(var(--chart-2))" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                    <p>No errors found - all transcriptions successful!</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Error Details Table */}
        {errorStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Error Details</CardTitle>
              <CardDescription>Detailed breakdown of error occurrences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {errorStats.map((stat, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{stat.error}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{stat.count}</p>
                      <p className="text-xs text-muted-foreground">
                        {stats.failed > 0 ? Math.round((stat.count / stats.failed) * 100) : 0}% of failures
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
