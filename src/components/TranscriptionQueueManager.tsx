import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Loader2, Pause, Play, Trash2, Eye, CheckCircle2, 
  XCircle, Clock, AlertCircle, RefreshCw 
} from "lucide-react";
import { format } from "date-fns";

interface QueueItem {
  id: string;
  video_id: string;
  video_url: string;
  video_title: string;
  video_thumbnail: string | null;
  channel_title: string | null;
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
  progress: number;
  error_message: string | null;
  result_text: string | null;
  result_duration: number | null;
  result_language: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export function TranscriptionQueueManager() {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed'>('all');

  useEffect(() => {
    fetchQueueItems();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('transcription-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transcription_queue'
        },
        (payload) => {
          console.log('Queue update:', payload);
          fetchQueueItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchQueueItems = async () => {
    try {
      const { data, error } = await supabase
        .from('transcription_queue')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQueueItems((data || []) as QueueItem[]);
    } catch (error: any) {
      console.error('Error fetching queue:', error);
      toast.error('Failed to load queue');
    } finally {
      setIsLoading(false);
    }
  };

  const processQueue = async () => {
    const pendingItems = queueItems.filter(item => item.status === 'pending');
    
    if (pendingItems.length === 0) {
      toast.info('No pending items to process');
      return;
    }

    setIsProcessing(true);
    toast.info(`Starting to process ${pendingItems.length} video${pendingItems.length > 1 ? 's' : ''}...`);

    for (const item of pendingItems) {
      // Check if processing has been paused
      const { data: currentItem } = await supabase
        .from('transcription_queue')
        .select('status')
        .eq('id', item.id)
        .single();

      if (currentItem?.status === 'paused') {
        console.log(`Skipping paused item: ${item.id}`);
        continue;
      }

      try {
        // Update status to processing
        await supabase
          .from('transcription_queue')
          .update({ 
            status: 'processing', 
            started_at: new Date().toISOString(),
            progress: 10
          })
          .eq('id', item.id);

        // Simulate progress updates
        const progressInterval = setInterval(async () => {
          const { data: check } = await supabase
            .from('transcription_queue')
            .select('status, progress')
            .eq('id', item.id)
            .single();

          if (check?.status === 'processing' && check.progress < 90) {
            await supabase
              .from('transcription_queue')
              .update({ progress: Math.min(check.progress + 15, 90) })
              .eq('id', item.id);
          }
        }, 1000);

        // Call the transcription edge function
        const { data, error } = await supabase.functions.invoke('transcribe-youtube', {
          body: {
            youtubeUrl: item.video_url,
            language: item.language,
            downloadVideo: false
          }
        });

        clearInterval(progressInterval);

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        // Update with completed status
        await supabase
          .from('transcription_queue')
          .update({
            status: 'completed',
            progress: 100,
            completed_at: new Date().toISOString(),
            result_text: data.text,
            result_duration: data.duration,
            result_language: data.language,
            transcription_log_id: data.logId
          })
          .eq('id', item.id);

        toast.success(`Completed: ${item.video_title.substring(0, 50)}...`);

      } catch (error: any) {
        console.error(`Error processing ${item.id}:`, error);
        
        await supabase
          .from('transcription_queue')
          .update({
            status: 'failed',
            progress: 0,
            error_message: error.message || 'Transcription failed'
          })
          .eq('id', item.id);

        toast.error(`Failed: ${item.video_title.substring(0, 50)}...`);
      }

      // Small delay between videos
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsProcessing(false);
    toast.success('Queue processing complete!');
  };

  const pauseItem = async (id: string) => {
    try {
      await supabase
        .from('transcription_queue')
        .update({ status: 'paused' })
        .eq('id', id);
      
      toast.success('Item paused');
    } catch (error: any) {
      toast.error('Failed to pause item');
    }
  };

  const resumeItem = async (id: string) => {
    try {
      await supabase
        .from('transcription_queue')
        .update({ status: 'pending' })
        .eq('id', id);
      
      toast.success('Item resumed');
    } catch (error: any) {
      toast.error('Failed to resume item');
    }
  };

  const retryItem = async (id: string) => {
    try {
      await supabase
        .from('transcription_queue')
        .update({ 
          status: 'pending',
          progress: 0,
          error_message: null
        })
        .eq('id', id);
      
      toast.success('Item added back to queue');
    } catch (error: any) {
      toast.error('Failed to retry item');
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await supabase
        .from('transcription_queue')
        .delete()
        .eq('id', id);
      
      toast.success('Item deleted');
    } catch (error: any) {
      toast.error('Failed to delete item');
    }
  };

  const clearCompleted = async () => {
    try {
      await supabase
        .from('transcription_queue')
        .delete()
        .eq('status', 'completed');
      
      toast.success('Cleared completed items');
    } catch (error: any) {
      toast.error('Failed to clear completed items');
    }
  };

  const getFilteredItems = () => {
    if (activeTab === 'all') return queueItems;
    return queueItems.filter(item => item.status === activeTab);
  };

  const getStatusBadge = (status: QueueItem['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case 'processing':
        return <Badge className="gap-1 bg-blue-500"><Loader2 className="h-3 w-3 animate-spin" /> Processing</Badge>;
      case 'completed':
        return <Badge className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      case 'paused':
        return <Badge variant="outline" className="gap-1"><Pause className="h-3 w-3" /> Paused</Badge>;
    }
  };

  const getStats = () => {
    return {
      pending: queueItems.filter(i => i.status === 'pending').length,
      processing: queueItems.filter(i => i.status === 'processing').length,
      completed: queueItems.filter(i => i.status === 'completed').length,
      failed: queueItems.filter(i => i.status === 'failed').length,
      paused: queueItems.filter(i => i.status === 'paused').length,
    };
  };

  const stats = getStats();
  const filteredItems = getFilteredItems();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Transcription Queue Manager</CardTitle>
            <CardDescription>
              Monitor and manage all transcription jobs
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchQueueItems}
              disabled={isProcessing}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={processQueue}
              disabled={isProcessing || stats.pending === 0}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Process Queue ({stats.pending})
                </>
              )}
            </Button>
            {stats.completed > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearCompleted}
                disabled={isProcessing}
              >
                Clear Completed
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mt-4">
          <Card className="bg-muted/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
              <div className="text-xs text-muted-foreground">Processing</div>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/10">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.paused}</div>
              <div className="text-xs text-muted-foreground">Paused</div>
            </CardContent>
          </Card>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all">All ({queueItems.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
            <TabsTrigger value="processing">Processing ({stats.processing})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
            <TabsTrigger value="failed">Failed ({stats.failed})</TabsTrigger>
            <TabsTrigger value="paused">Paused ({stats.paused})</TabsTrigger>
          </TabsList>

          {['all', 'pending', 'processing', 'completed', 'failed', 'paused'].map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No {tab === 'all' ? '' : tab} items in queue</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {filteredItems.map((item) => (
                      <Card key={item.id} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            {item.video_thumbnail && (
                              <img 
                                src={item.video_thumbnail} 
                                alt={item.video_title}
                                className="w-32 h-20 object-cover rounded flex-shrink-0"
                              />
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1">
                                  <h4 className="font-medium line-clamp-1">{item.video_title}</h4>
                                  {item.channel_title && (
                                    <p className="text-sm text-muted-foreground">{item.channel_title}</p>
                                  )}
                                </div>
                                {getStatusBadge(item.status)}
                              </div>

                              {item.status === 'processing' && (
                                <div className="mb-2">
                                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                    <span>Processing...</span>
                                    <span>{item.progress}%</span>
                                  </div>
                                  <Progress value={item.progress} className="h-2" />
                                </div>
                              )}

                              {item.error_message && (
                                <p className="text-sm text-red-600 mb-2">{item.error_message}</p>
                              )}

                              <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground space-y-1">
                                  <p>Created: {format(new Date(item.created_at), 'MMM dd, yyyy HH:mm')}</p>
                                  {item.completed_at && (
                                    <p>Completed: {format(new Date(item.completed_at), 'MMM dd, yyyy HH:mm')}</p>
                                  )}
                                </div>

                                <div className="flex gap-2">
                                  {item.status === 'pending' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => pauseItem(item.id)}
                                      disabled={isProcessing}
                                    >
                                      <Pause className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {item.status === 'paused' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => resumeItem(item.id)}
                                      disabled={isProcessing}
                                    >
                                      <Play className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {item.status === 'failed' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => retryItem(item.id)}
                                      disabled={isProcessing}
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {item.status === 'completed' && item.result_text && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        // TODO: Show result in modal or navigate to result page
                                        toast.info('View result functionality coming soon');
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteItem(item.id)}
                                    disabled={isProcessing && item.status === 'processing'}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
