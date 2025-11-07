import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileAudio } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="text-center space-y-6 px-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
          <FileAudio className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-5xl font-bold text-foreground">The Wright Scriber Pro</h1>
        <p className="text-xl text-muted-foreground max-w-md mx-auto">
          Professional audio transcription with secure, GB-formatted logging
        </p>
        <div className="pt-4">
          <Button size="lg" onClick={() => navigate("/auth")}>
            Get Started
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
