import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User as SupabaseUser, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogOut, FileAudio, History, Mail, Database, Users, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { DisclaimerModal } from "@/components/DisclaimerModal";
import { TranscriptionUpload } from "@/components/TranscriptionUpload";
import { DuplicateCleanupConfig } from "@/components/DuplicateCleanupConfig";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
      } else {
        fetchUserRole(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error fetching role:", error);
      return;
    }

    if (data) {
      setUserRole(data.role);
      setIsAdmin(data.role === "admin");
      
      if (data.role === "admin") {
        fetchAllUsers();
      }
    }
  };

  const fetchAllUsers = async () => {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, user_group, must_change_password, created_at");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return;
    }

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
      return;
    }

    const usersWithRoles = profiles?.map(profile => {
      const userRole = roles?.find(r => r.user_id === profile.id);
      return {
        ...profile,
        role: userRole?.role || "user",
      };
    }) || [];

    setAllUsers(usersWithRoles);
  };

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

  const handleResetPassword = async (userId: string, email: string) => {
    const { error } = await supabase.functions.invoke("reset-user-password", {
      body: { userId },
    });

    if (error) {
      toast.error("Failed to reset password");
      console.error(error);
      return;
    }

    toast.success(`Password reset for ${email}. User must change password on next login.`);
    fetchAllUsers();
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: newRole });

    if (error) {
      toast.error("Failed to update role");
      console.error(error);
      return;
    }

    toast.success(`Role updated to ${newRole}`);
    fetchAllUsers();
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
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{user.email}</p>
              {userRole && (
                <Badge variant={isAdmin ? "default" : "secondary"}>
                  <Shield className="w-3 h-3 mr-1" />
                  {userRole}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/profile")}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="transcribe" className="w-full">
          <TabsList className={`grid w-full mb-8 ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <TabsTrigger value="transcribe">
              <FileAudio className="mr-2 h-4 w-4" />
              Transcribe
            </TabsTrigger>
            <TabsTrigger value="logs" onClick={() => navigate("/history")}>
              <History className="mr-2 h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="tickets">
              <Mail className="mr-2 h-4 w-4" />
              Support
            </TabsTrigger>
            <TabsTrigger value="backup">
              <Database className="mr-2 h-4 w-4" />
              Backup
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="users">
                <Users className="mr-2 h-4 w-4" />
                Users
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="transcribe">
            <TranscriptionUpload />
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
            <div className="space-y-6">
              <DuplicateCleanupConfig />
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Backup & Export</h2>
                <p className="text-muted-foreground">
                  Export your data and view backup history.
                </p>
              </Card>
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage user accounts and permissions (Admin only)</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Password Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allUsers.map((userItem) => (
                        <TableRow key={userItem.id}>
                          <TableCell className="font-medium">{userItem.email}</TableCell>
                          <TableCell>
                            <Badge variant={userItem.role === "admin" ? "default" : "secondary"}>
                              {userItem.role}
                            </Badge>
                          </TableCell>
                          <TableCell>{userItem.user_group}</TableCell>
                          <TableCell>
                            {userItem.must_change_password ? (
                              <Badge variant="destructive">Must Change</Badge>
                            ) : (
                              <Badge variant="outline">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {new Date(userItem.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleResetPassword(userItem.id, userItem.email)}
                              >
                                Reset Password
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleRole(userItem.id, userItem.role)}
                              >
                                {userItem.role === "admin" ? "Make User" : "Make Admin"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
