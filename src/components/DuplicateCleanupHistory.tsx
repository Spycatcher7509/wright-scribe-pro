import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart, Pie, PieChart, Cell } from "recharts";
import { formatGBDateTime } from "@/lib/dateFormat";
import { Loader2, Trash2, HardDrive, CheckCircle2, XCircle } from "lucide-react";

export const DuplicateCleanupHistory = () => {
  const { data: cleanupHistory, isLoading } = useQuery({
    queryKey: ["duplicate-cleanup-history"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("duplicate_cleanup_history")
        .select("*")
        .eq("user_id", user.id)
        .order("run_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const totalCleanups = cleanupHistory?.length || 0;
  const successfulCleanups = cleanupHistory?.filter(h => h.status === "completed").length || 0;
  const totalFilesDeleted = cleanupHistory?.reduce((sum, h) => sum + h.files_deleted, 0) || 0;
  const totalSpaceFreed = cleanupHistory?.reduce((sum, h) => sum + Number(h.space_freed_bytes), 0) || 0;
  const successRate = totalCleanups > 0 ? Math.round((successfulCleanups / totalCleanups) * 100) : 0;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const chartData = cleanupHistory?.slice(0, 10).reverse().map(h => ({
    date: new Date(h.run_at).toLocaleDateString("en-GB"),
    files: h.files_deleted,
    space: Number(h.space_freed_bytes) / (1024 * 1024), // MB
  })) || [];

  const statusData = [
    { name: "Successful", value: successfulCleanups, color: "hsl(var(--chart-1))" },
    { name: "Failed", value: totalCleanups - successfulCleanups, color: "hsl(var(--chart-2))" },
  ];

  const chartConfig = {
    files: {
      label: "Files Deleted",
      color: "hsl(var(--chart-1))",
    },
    space: {
      label: "Space Freed (MB)",
      color: "hsl(var(--chart-2))",
    },
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cleanups</CardTitle>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCleanups}</div>
            <p className="text-xs text-muted-foreground">
              {successRate}% success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Files Deleted</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFilesDeleted}</div>
            <p className="text-xs text-muted-foreground">
              Duplicate files removed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Space Freed</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalSpaceFreed)}</div>
            <p className="text-xs text-muted-foreground">
              Storage recovered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            {successRate >= 80 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {successfulCleanups} of {totalCleanups} successful
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cleanup Trend</CardTitle>
            <CardDescription>Files deleted over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="files" fill="var(--color-files)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Space Freed Trend</CardTitle>
            <CardDescription>Storage recovered over time (MB)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="space" 
                  stroke="var(--color-space)" 
                  strokeWidth={2}
                  dot={{ fill: "var(--color-space)" }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Status Distribution */}
      {totalCleanups > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cleanup Status Distribution</CardTitle>
            <CardDescription>Success vs failure rate</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Cleanup History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Cleanup History</CardTitle>
          <CardDescription>Last 10 cleanup runs</CardDescription>
        </CardHeader>
        <CardContent>
          {cleanupHistory && cleanupHistory.length > 0 ? (
            <div className="space-y-3">
              {cleanupHistory.slice(0, 10).map((cleanup) => (
                <div
                  key={cleanup.id}
                  className="flex items-center justify-between border-b border-border pb-3 last:border-0"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {cleanup.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="text-sm font-medium">
                        {formatGBDateTime(cleanup.run_at)}
                      </span>
                    </div>
                    {cleanup.error_message && (
                      <p className="text-xs text-destructive">{cleanup.error_message}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{cleanup.files_deleted} files</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(Number(cleanup.space_freed_bytes))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No cleanup history yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
