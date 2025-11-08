import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRealtimeNotifications } from "@/contexts/RealtimeNotificationsContext";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

export const NotificationBell = () => {
  const { recentActivities, unreadCount, markAsRead } = useRealtimeNotifications();
  const navigate = useNavigate();

  const handleOpenChange = (open: boolean) => {
    if (open) {
      markAsRead();
    }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Recent Activity</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {recentActivities.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No recent activity
            </div>
          ) : (
            recentActivities.map((activity) => (
              <DropdownMenuItem
                key={activity.id}
                className="flex flex-col items-start p-3 cursor-pointer"
              >
                <div className="flex items-center gap-2 w-full">
                  <Badge variant="outline" className="text-xs">
                    {activity.action_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm mt-1">{activity.action_description}</p>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-center justify-center"
          onClick={() => navigate("/profile")}
        >
          View All Activity
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
