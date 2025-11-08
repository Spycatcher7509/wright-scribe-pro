import { useMemo } from "react";
import { startOfWeek, startOfMonth, subWeeks, subMonths, isWithinInterval, format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Award, Calendar, BarChart3 } from "lucide-react";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TranscriptionLog {
  id: string;
  created_at: string;
  tags?: Tag[];
}

interface TagUsageStatisticsProps {
  logs: TranscriptionLog[];
  tags: Tag[];
  startDate?: Date;
  endDate?: Date;
}

interface TagStats {
  id: string;
  name: string;
  color: string;
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  lastMonth: number;
  total: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
  trend: 'up' | 'down' | 'stable';
}

export default function TagUsageStatistics({ logs, tags, startDate, endDate }: TagUsageStatisticsProps) {
  const statistics = useMemo(() => {
    const now = endDate || new Date();
    
    // Filter logs by date range
    const filteredLogs = logs.filter(log => {
      const logDate = new Date(log.created_at);
      if (startDate && logDate < startDate) return false;
      if (endDate && logDate > endDate) return false;
      return true;
    });

    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = startOfWeek(subWeeks(now, 1));
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));

    const tagStatsMap = new Map<string, TagStats>();

    // Initialize stats for all tags
    tags.forEach(tag => {
      tagStatsMap.set(tag.id, {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        thisWeek: 0,
        lastWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
        total: 0,
        weeklyGrowth: 0,
        monthlyGrowth: 0,
        trend: 'stable',
      });
    });

    // Count tag usage across different time periods
    filteredLogs.forEach(log => {
      if (!log.tags || log.tags.length === 0) return;

      const logDate = new Date(log.created_at);

      log.tags.forEach(tag => {
        const stats = tagStatsMap.get(tag.id);
        if (!stats) return;

        stats.total++;

        if (isWithinInterval(logDate, { start: thisWeekStart, end: now })) {
          stats.thisWeek++;
        }

        if (isWithinInterval(logDate, { start: lastWeekStart, end: thisWeekStart })) {
          stats.lastWeek++;
        }

        if (isWithinInterval(logDate, { start: thisMonthStart, end: now })) {
          stats.thisMonth++;
        }

        if (isWithinInterval(logDate, { start: lastMonthStart, end: thisMonthStart })) {
          stats.lastMonth++;
        }
      });
    });

    // Calculate growth percentages and trends
    tagStatsMap.forEach(stats => {
      // Weekly growth
      if (stats.lastWeek > 0) {
        stats.weeklyGrowth = ((stats.thisWeek - stats.lastWeek) / stats.lastWeek) * 100;
      } else if (stats.thisWeek > 0) {
        stats.weeklyGrowth = 100;
      }

      // Monthly growth
      if (stats.lastMonth > 0) {
        stats.monthlyGrowth = ((stats.thisMonth - stats.lastMonth) / stats.lastMonth) * 100;
      } else if (stats.thisMonth > 0) {
        stats.monthlyGrowth = 100;
      }

      // Determine trend
      if (stats.weeklyGrowth > 10) {
        stats.trend = 'up';
      } else if (stats.weeklyGrowth < -10) {
        stats.trend = 'down';
      } else {
        stats.trend = 'stable';
      }
    });

    const allStats = Array.from(tagStatsMap.values());

    // Get trending tags (highest weekly growth with minimum usage)
    const trendingTags = allStats
      .filter(s => s.thisWeek >= 2) // Minimum usage to be considered trending
      .sort((a, b) => b.weeklyGrowth - a.weeklyGrowth)
      .slice(0, 5);

    // Get most active tags this week
    const mostActiveThisWeek = allStats
      .filter(s => s.thisWeek > 0)
      .sort((a, b) => b.thisWeek - a.thisWeek)
      .slice(0, 5);

    // Get fastest growing tags by month
    const fastestGrowingMonth = allStats
      .filter(s => s.thisMonth >= 3)
      .sort((a, b) => b.monthlyGrowth - a.monthlyGrowth)
      .slice(0, 5);

    return {
      trendingTags,
      mostActiveThisWeek,
      fastestGrowingMonth,
      totalTagsUsed: allStats.filter(s => s.total > 0).length,
    };
  }, [logs, tags, startDate, endDate]);

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatGrowth = (growth: number) => {
    if (growth === 0) return '0%';
    const sign = growth > 0 ? '+' : '';
    return `${sign}${growth.toFixed(0)}%`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Active Tags</CardDescription>
            <CardTitle className="text-3xl">{statistics.totalTagsUsed}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">of {tags.length} total tags</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">This Week's Activity</CardDescription>
            <CardTitle className="text-3xl">
              {statistics.mostActiveThisWeek.reduce((sum, tag) => sum + tag.thisWeek, 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">total tag usages</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Trending Tags</CardDescription>
            <CardTitle className="text-3xl">{statistics.trendingTags.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">showing growth</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Trending Tags */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" />
              Trending Tags
            </CardTitle>
            <CardDescription className="text-xs">Highest weekly growth rate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statistics.trendingTags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No trending tags</p>
            ) : (
              statistics.trendingTags.map((tag, index) => (
                <div key={tag.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-muted-foreground text-sm font-medium w-4">#{index + 1}</span>
                    <Badge
                      variant="outline"
                      style={{ borderColor: tag.color, color: tag.color }}
                      className="truncate"
                    >
                      {tag.name}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTrendIcon(tag.trend)}
                    <span className={`text-sm font-medium ${
                      tag.weeklyGrowth > 0 ? 'text-green-600' : 
                      tag.weeklyGrowth < 0 ? 'text-red-600' : 
                      'text-muted-foreground'
                    }`}>
                      {formatGrowth(tag.weeklyGrowth)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Most Active This Week */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-5 w-5" />
              Most Active This Week
            </CardTitle>
            <CardDescription className="text-xs">Tags used most frequently</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statistics.mostActiveThisWeek.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No activity this week</p>
            ) : (
              statistics.mostActiveThisWeek.map((tag, index) => (
                <div key={tag.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-muted-foreground text-sm font-medium w-4">#{index + 1}</span>
                    <Badge
                      variant="outline"
                      style={{ borderColor: tag.color, color: tag.color }}
                      className="truncate"
                    >
                      {tag.name}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-medium">{tag.thisWeek}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Fastest Growing (Monthly) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5" />
              Monthly Growth Leaders
            </CardTitle>
            <CardDescription className="text-xs">Fastest growing this month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statistics.fastestGrowingMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No growth data</p>
            ) : (
              statistics.fastestGrowingMonth.map((tag, index) => (
                <div key={tag.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-muted-foreground text-sm font-medium w-4">#{index + 1}</span>
                    <Badge
                      variant="outline"
                      style={{ borderColor: tag.color, color: tag.color }}
                      className="truncate"
                    >
                      {tag.name}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{tag.thisMonth} uses</span>
                    <span className={`text-sm font-medium ${
                      tag.monthlyGrowth > 0 ? 'text-green-600' : 
                      tag.monthlyGrowth < 0 ? 'text-red-600' : 
                      'text-muted-foreground'
                    }`}>
                      {formatGrowth(tag.monthlyGrowth)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
