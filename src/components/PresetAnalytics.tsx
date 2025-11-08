import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { TrendingUp, Eye, Copy, Zap, Calendar } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface PresetUsageStats {
  preset_id: string;
  preset_name: string;
  total_views: number;
  total_clones: number;
  total_applies: number;
  recent_activity: number;
}

interface DailyUsageStats {
  date: string;
  views: number;
  clones: number;
  applies: number;
}

export function PresetAnalytics() {
  const [presetStats, setPresetStats] = useState<PresetUsageStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyUsageStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 30>(7);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const startDate = startOfDay(subDays(new Date(), timeRange));
    const endDate = endOfDay(new Date());

    // Fetch preset usage statistics
    const { data: usageData } = await supabase
      .from('preset_usage')
      .select(`
        preset_id,
        event_type,
        created_at,
        filter_presets!inner(
          id,
          name,
          user_id,
          is_shared
        )
      `)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (usageData) {
      // Aggregate stats by preset
      const statsMap = new Map<string, PresetUsageStats>();
      
      usageData.forEach((entry: any) => {
        const preset = entry.filter_presets;
        // Only include user's own presets or shared presets
        if (preset.user_id !== user.id && !preset.is_shared) return;

        const presetId = entry.preset_id;
        const existing = statsMap.get(presetId) || {
          preset_id: presetId,
          preset_name: preset.name,
          total_views: 0,
          total_clones: 0,
          total_applies: 0,
          recent_activity: 0,
        };

        if (entry.event_type === 'view') existing.total_views++;
        if (entry.event_type === 'clone') existing.total_clones++;
        if (entry.event_type === 'apply') existing.total_applies++;
        existing.recent_activity++;

        statsMap.set(presetId, existing);
      });

      setPresetStats(Array.from(statsMap.values()).sort((a, b) => b.recent_activity - a.recent_activity));

      // Aggregate daily stats
      const dailyMap = new Map<string, DailyUsageStats>();
      
      for (let i = 0; i < timeRange; i++) {
        const date = format(subDays(new Date(), timeRange - i - 1), 'MMM dd');
        dailyMap.set(date, { date, views: 0, clones: 0, applies: 0 });
      }

      usageData.forEach((entry: any) => {
        const date = format(new Date(entry.created_at), 'MMM dd');
        const existing = dailyMap.get(date);
        if (existing) {
          if (entry.event_type === 'view') existing.views++;
          if (entry.event_type === 'clone') existing.clones++;
          if (entry.event_type === 'apply') existing.applies++;
        }
      });

      setDailyStats(Array.from(dailyMap.values()));
    }

    setLoading(false);
  };

  const getTotalStats = () => {
    return presetStats.reduce(
      (acc, preset) => ({
        views: acc.views + preset.total_views,
        clones: acc.clones + preset.total_clones,
        applies: acc.applies + preset.total_applies,
      }),
      { views: 0, clones: 0, applies: 0 }
    );
  };

  const totalStats = getTotalStats();

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading analytics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.views}</div>
            <p className="text-xs text-muted-foreground">
              Last {timeRange} days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clones</CardTitle>
            <Copy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.clones}</div>
            <p className="text-xs text-muted-foreground">
              Last {timeRange} days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.applies}</div>
            <p className="text-xs text-muted-foreground">
              Last {timeRange} days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Tabs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Preset Analytics</CardTitle>
              <CardDescription>
                Track usage and popularity of your filter presets
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge
                variant={timeRange === 7 ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setTimeRange(7)}
              >
                7 Days
              </Badge>
              <Badge
                variant={timeRange === 30 ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setTimeRange(30)}
              >
                30 Days
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {presetStats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg mb-2">No Activity Yet</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Share your presets to start tracking usage analytics
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Most Popular Presets</h4>
                  {presetStats.slice(0, 10).map((preset) => (
                    <div
                      key={preset.preset_id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{preset.preset_name}</p>
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {preset.total_views} views
                          </span>
                          <span className="flex items-center gap-1">
                            <Copy className="h-3 w-3" />
                            {preset.total_clones} clones
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {preset.total_applies} applies
                          </span>
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {preset.recent_activity} total
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              {dailyStats.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">No trend data available</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-medium mb-4">Activity Over Time</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={dailyStats}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" name="Views" />
                        <Line type="monotone" dataKey="clones" stroke="hsl(var(--accent))" name="Clones" />
                        <Line type="monotone" dataKey="applies" stroke="hsl(var(--secondary))" name="Applications" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-4">Daily Breakdown</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dailyStats}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="views" fill="hsl(var(--primary))" name="Views" />
                        <Bar dataKey="clones" fill="hsl(var(--accent))" name="Clones" />
                        <Bar dataKey="applies" fill="hsl(var(--secondary))" name="Applications" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}