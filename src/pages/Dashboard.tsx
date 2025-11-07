import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, FileAudio, History, Mail, Database } from "lucide-react";
import { toast } from "sonner";
import { DisclaimerModal } from "@/components/DisclaimerModal";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleDisclaimerAgree = () => {
    setDisclaimerAccepted(true);
    setShowDisclaimer(false);
    toast.success("Welcome to The Wright Scriber Pro");
  };

  const handleDisclaimerDisagree = () => {
    toast.error("You must agree to the terms to use this application");
    handleSignOut();
  };

  if (!user || !disclaimerAccepted) {
    return showDisclaimer ? (
      <DisclaimerModal onAgree={handleDisclaimerAgree} onDisagree={handleDisclaimerDisagree} />
    ) : null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">The Wright Scriber Pro</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="transcribe" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="transcribe">
              <FileAudio className="mr-2 h-4 w-4" />
              Transcribe
            </TabsTrigger>
            <TabsTrigger value="logs">
              <History className="mr-2 h-4 w-4" />
              Activity Logs
            </TabsTrigger>
            <TabsTrigger value="tickets">
              <Mail className="mr-2 h-4 w-4" />
              Support
            </TabsTrigger>
            <TabsTrigger value="backup">
              <Database className="mr-2 h-4 w-4" />
              Backup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transcribe">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Audio Transcription</h2>
              <p className="text-muted-foreground">
                Transcription feature coming soon. Upload audio files or paste YouTube URLs to transcribe.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Activity Logs</h2>
              <p className="text-muted-foreground">
                View all transcription activity with GB formatted timestamps (dd/MM/yyyy HH:mm:ss).
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="tickets">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Support Tickets</h2>
              <p className="text-muted-foreground">
                Submit and track support tickets.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="backup">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Backup & Export</h2>
              <p className="text-muted-foreground">
                Export your data and view backup history.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
