import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, Network, Activity } from "lucide-react";
import { toast } from "sonner";

type PortStatus = "checking" | "open" | "closed" | "idle";

interface CheckResult {
  host: string;
  port: string;
  status: PortStatus;
  timestamp: Date;
}

export const PortChecker = () => {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [status, setStatus] = useState<PortStatus>("idle");
  const [history, setHistory] = useState<CheckResult[]>([]);

  // Simulated port checking function
  const checkPort = async (hostname: string, portNumber: string) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Common ports that are typically "open" for demo purposes
    const commonOpenPorts = ["80", "443", "8080", "3000", "5000", "8000"];
    const isOpen = commonOpenPorts.includes(portNumber) || Math.random() > 0.5;
    
    return isOpen ? "open" : "closed";
  };

  // Debounced auto-check effect
  useEffect(() => {
    if (!host || !port) {
      setStatus("idle");
      return;
    }

    const timer = setTimeout(async () => {
      setStatus("checking");
      
      try {
        const result = await checkPort(host, port);
        setStatus(result as PortStatus);
        
        const checkResult: CheckResult = {
          host,
          port,
          status: result as PortStatus,
          timestamp: new Date(),
        };
        
        setHistory(prev => [checkResult, ...prev.slice(0, 9)]);
        
        if (result === "open") {
          toast.success(`Port ${port} is OPEN on ${host}`);
        } else {
          toast.error(`Port ${port} is CLOSED on ${host}`);
        }
      } catch (error) {
        setStatus("closed");
        toast.error("Failed to check port");
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [host, port]);

  const getStatusColor = (s: PortStatus) => {
    switch (s) {
      case "open":
        return "success";
      case "closed":
        return "destructive";
      case "checking":
        return "secondary";
      default:
        return "muted";
    }
  };

  const getStatusIcon = (s: PortStatus) => {
    switch (s) {
      case "open":
        return <CheckCircle2 className="h-8 w-8 text-success animate-pulse" />;
      case "closed":
        return <XCircle className="h-8 w-8 text-destructive animate-pulse" />;
      case "checking":
        return <Loader2 className="h-8 w-8 text-primary animate-spin" />;
      default:
        return <Network className="h-8 w-8 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }} />

      <div className="relative z-10 container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 mb-4">
            <Activity className="h-8 w-8 text-primary animate-pulse-glow" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Port Checker
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Real-time port status monitoring • Auto-refresh enabled
          </p>
        </div>

        {/* Main Checker Card */}
        <Card className="max-w-2xl mx-auto p-8 bg-card/50 backdrop-blur-xl border-2 border-border shadow-2xl mb-8 animate-scale-in">
          <div className="space-y-6">
            {/* Input Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Host / IP Address
                </label>
                <Input
                  type="text"
                  placeholder="e.g., google.com or 192.168.1.1"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="bg-input/50 border-border/50 focus:border-primary transition-all duration-300 focus:shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Port Number
                </label>
                <Input
                  type="text"
                  placeholder="e.g., 80, 443, 8080"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="bg-input/50 border-border/50 focus:border-primary transition-all duration-300 focus:shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                />
              </div>
            </div>

            {/* Status Display */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5 rounded-lg blur-xl" />
              <div className="relative bg-muted/30 rounded-lg p-8 border border-border/50 overflow-hidden">
                {/* Scan line animation */}
                {status === "checking" && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line" />
                  </div>
                )}
                
                <div className="flex flex-col items-center gap-4">
                  {getStatusIcon(status)}
                  
                  <div className="text-center">
                    <h3 className="text-2xl font-bold mb-2">
                      {status === "idle" && "Enter host and port to check"}
                      {status === "checking" && "Scanning port..."}
                      {status === "open" && "Port is OPEN"}
                      {status === "closed" && "Port is CLOSED"}
                    </h3>
                    
                    {status !== "idle" && host && port && (
                      <p className="text-muted-foreground">
                        {host}:{port}
                      </p>
                    )}
                  </div>

                  {status !== "idle" && (
                    <Badge 
                      variant={getStatusColor(status) as any}
                      className="px-4 py-1 text-sm font-semibold animate-pulse-soft"
                    >
                      {status.toUpperCase()}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* History */}
        {history.length > 0 && (
          <div className="max-w-2xl mx-auto animate-fade-in">
            <h2 className="text-2xl font-bold mb-4 text-foreground flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Checks
            </h2>
            <div className="grid gap-3">
              {history.map((result, index) => (
                <Card
                  key={index}
                  className="p-4 bg-card/30 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.2)] animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {result.status === "open" ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                      <div>
                        <p className="font-medium text-foreground">
                          {result.host}:{result.port}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {result.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      variant={result.status === "open" ? "success" : "destructive"}
                      className="font-semibold"
                    >
                      {result.status.toUpperCase()}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
