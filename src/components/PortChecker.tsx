import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type PortStatus = "checking" | "open" | "closed" | "idle";

interface BrandStatus {
  brand: string;
  brainNetIp: string;
  liveIp: string;
  brainNetStatus: PortStatus;
  liveIpStatus: PortStatus;
  brainNetClosedAt?: string;
  brainNetOpenedAt?: string;
  liveIpClosedAt?: string;
  liveIpOpenedAt?: string;
}

// EastGate brands configuration
const BRANDS: Record<string, { host: string; default_port: number; brain_net_ip: string; live_ip: string }> = {
  "Bareeze": { host: "barz.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.25", live_ip: "202.59.94.86" },
  "Bareeze Men": { host: "bman.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.26", live_ip: "202.59.94.92" },
  "Chineyere": { host: "chny.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.28", live_ip: "202.59.94.88" },
  "Mini Minor": { host: "mmnr.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.29", live_ip: "202.59.94.87" },
  "Rangja": { host: "rnja.eastgateindustries.com", default_port: 20000, brain_net_ip: "122.129.92.30", live_ip: "202.59.94.91" },
  "The Entertainer": { host: "te.eastgateindustries.com", default_port: 20000, brain_net_ip: "", live_ip: "202.59.94.93" },
};

interface ClosedTimestamps {
  [key: string]: number; // key format: "brand-ipType", value: timestamp when port first closed
}

interface EmailSent {
  [key: string]: boolean; // Track if email was already sent for this closure
}

export const PortChecker = () => {
  const [brandStatuses, setBrandStatuses] = useState<BrandStatus[]>(
    Object.keys(BRANDS).map(brand => ({
      brand,
      brainNetIp: BRANDS[brand].brain_net_ip,
      liveIp: BRANDS[brand].live_ip,
      brainNetStatus: "idle" as PortStatus,
      liveIpStatus: "idle" as PortStatus,
    }))
  );
  const [alarmIntervals, setAlarmIntervals] = useState<{[key: string]: NodeJS.Timeout}>({});
  const closedTimestamps = useRef<ClosedTimestamps>({});
  const emailSent = useRef<EmailSent>({});

  // Simple notification beep sound
  const playSimpleBeep = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  // Start continuous alarm for a specific brand/IP
  const startContinuousAlarm = (key: string) => {
    if (alarmIntervals[key]) {
      clearInterval(alarmIntervals[key]);
    }
    
    playSimpleBeep();
    
    const intervalId = setInterval(() => {
      playSimpleBeep();
    }, 3000);
    
    setAlarmIntervals(prev => ({ ...prev, [key]: intervalId }));
  };

  // Stop continuous alarm for a specific brand/IP
  const stopContinuousAlarm = (key: string) => {
    if (alarmIntervals[key]) {
      clearInterval(alarmIntervals[key]);
      setAlarmIntervals(prev => {
        const newIntervals = { ...prev };
        delete newIntervals[key];
        return newIntervals;
      });
    }
  };

  // Send email alert
  const sendEmailAlert = async (brand: string, ip: string, ipType: string, closedSince: string) => {
    try {
      await supabase.functions.invoke('send-email-alert', {
        body: { brand, ip, ipType, closedSince }
      });
      toast.info(`Email alert sent for ${brand} - ${ipType}`);
    } catch (error) {
      console.error("Email alert error:", error);
    }
  };

  // Real port checking function using backend
  const checkPort = async (brand: string, ip: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-port', {
        body: { brand, port: 20000, timeout: 3, ip }
      });

      if (error) throw error;
      
      return data.open ? "open" : "closed";
    } catch (error) {
      console.error("Port check error:", error);
      return "closed";
    }
  };

  // Check all brands and both IPs
  const checkAllPorts = async () => {
    const brandKeys = Object.keys(BRANDS);
    
    for (const brand of brandKeys) {
      const brandConfig = BRANDS[brand];
      
      // Update status to checking
      setBrandStatuses(prev => prev.map(b => 
        b.brand === brand 
          ? { ...b, brainNetStatus: "checking", liveIpStatus: "checking" }
          : b
      ));

      // Check Brain Net IP (skip if empty)
      const brainNetResult = brandConfig.brain_net_ip 
        ? await checkPort(brand, brandConfig.brain_net_ip)
        : "idle";
      
      // Check Live IP
      const liveIpResult = await checkPort(brand, brandConfig.live_ip);

      // Update statuses
      setBrandStatuses(prev => prev.map(b => 
        b.brand === brand 
          ? { 
              ...b, 
              brainNetStatus: brainNetResult as PortStatus, 
              liveIpStatus: liveIpResult as PortStatus 
            }
          : b
      ));

      // Handle Brain Net IP status changes
      const brainNetKey = `${brand}-brainNet`;
      if (brainNetResult === "closed") {
        // Track when port first closed
        if (!closedTimestamps.current[brainNetKey]) {
          closedTimestamps.current[brainNetKey] = Date.now();
          emailSent.current[brainNetKey] = false;
          startContinuousAlarm(brainNetKey);
          toast.error(`${brand} - Brain Net IP PORT CLOSED!`, { duration: 10000 });
          
          // Update closed timestamp in UI
          const closedTime = new Date().toLocaleString();
          setBrandStatuses(prev => prev.map(b => 
            b.brand === brand 
              ? { ...b, brainNetClosedAt: closedTime, brainNetOpenedAt: undefined }
              : b
          ));
        }
        
        // Check if closed for more than 2 minutes and email not sent yet
        const closedDuration = Date.now() - closedTimestamps.current[brainNetKey];
        if (closedDuration >= 120000 && !emailSent.current[brainNetKey]) {
          emailSent.current[brainNetKey] = true;
          const closedSince = new Date(closedTimestamps.current[brainNetKey]).toLocaleString();
          await sendEmailAlert(brand, brandConfig.brain_net_ip, "Brain Net IP", closedSince);
        }
      } else if (brainNetResult === "open") {
        // Reset tracking when port opens
        if (closedTimestamps.current[brainNetKey]) {
          delete closedTimestamps.current[brainNetKey];
          delete emailSent.current[brainNetKey];
          stopContinuousAlarm(brainNetKey);
          toast.success(`${brand} - Brain Net IP recovered!`);
          
          // Update opened timestamp in UI
          const openedTime = new Date().toLocaleString();
          setBrandStatuses(prev => prev.map(b => 
            b.brand === brand 
              ? { ...b, brainNetOpenedAt: openedTime, brainNetClosedAt: undefined }
              : b
          ));
        }
      }
      
      // Handle Live IP status changes
      const liveIpKey = `${brand}-liveIp`;
      if (liveIpResult === "closed") {
        // Track when port first closed
        if (!closedTimestamps.current[liveIpKey]) {
          closedTimestamps.current[liveIpKey] = Date.now();
          emailSent.current[liveIpKey] = false;
          startContinuousAlarm(liveIpKey);
          toast.error(`${brand} - Live IP PORT CLOSED!`, { duration: 10000 });
          
          // Update closed timestamp in UI
          const closedTime = new Date().toLocaleString();
          setBrandStatuses(prev => prev.map(b => 
            b.brand === brand 
              ? { ...b, liveIpClosedAt: closedTime, liveIpOpenedAt: undefined }
              : b
          ));
        }
        
        // Check if closed for more than 2 minutes and email not sent yet
        const closedDuration = Date.now() - closedTimestamps.current[liveIpKey];
        if (closedDuration >= 120000 && !emailSent.current[liveIpKey]) {
          emailSent.current[liveIpKey] = true;
          const closedSince = new Date(closedTimestamps.current[liveIpKey]).toLocaleString();
          await sendEmailAlert(brand, brandConfig.live_ip, "Live IP", closedSince);
        }
      } else if (liveIpResult === "open") {
        // Reset tracking when port opens
        if (closedTimestamps.current[liveIpKey]) {
          delete closedTimestamps.current[liveIpKey];
          delete emailSent.current[liveIpKey];
          stopContinuousAlarm(liveIpKey);
          toast.success(`${brand} - Live IP recovered!`);
          
          // Update opened timestamp in UI
          const openedTime = new Date().toLocaleString();
          setBrandStatuses(prev => prev.map(b => 
            b.brand === brand 
              ? { ...b, liveIpOpenedAt: openedTime, liveIpClosedAt: undefined }
              : b
          ));
        }
      }
    }
  };

  // Auto-check on mount and every 30 seconds
  useEffect(() => {
    checkAllPorts();
    
    const interval = setInterval(() => {
      checkAllPorts();
    }, 30000);

    return () => {
      clearInterval(interval);
      // Clean up all alarm intervals on unmount
      Object.values(alarmIntervals).forEach(intervalId => clearInterval(intervalId));
    };
  }, []);

  const getStatusIcon = (s: PortStatus) => {
    switch (s) {
      case "open":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "closed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "checking":
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      default:
        return null;
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
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 mb-4">
            <Activity className="h-8 w-8 text-primary animate-pulse-glow" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Port Status Monitor
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Real-time port monitoring for all brands • Auto-refresh every 30 seconds
          </p>
        </div>

        {/* Status Table */}
        <Card className="max-w-6xl mx-auto bg-card/50 backdrop-blur-xl border-2 border-border shadow-2xl animate-scale-in overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Brand</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Brain Net IP</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Live IP</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Brain Net IP Status</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Brain Net Timestamp</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Live IP Status</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Live IP Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {brandStatuses.map((brandStatus, index) => (
                  <tr 
                    key={brandStatus.brand}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors animate-fade-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-foreground">
                      {brandStatus.brand}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {brandStatus.brainNetIp || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {brandStatus.liveIp}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {brandStatus.brainNetIp && getStatusIcon(brandStatus.brainNetStatus)}
                        <span className={`text-sm font-medium ${
                          brandStatus.brainNetStatus === "open" 
                            ? "text-success" 
                            : brandStatus.brainNetStatus === "closed" 
                            ? "text-destructive" 
                            : "text-muted-foreground"
                        }`}>
                          {!brandStatus.brainNetIp || brandStatus.brainNetStatus === "idle" ? "-" : brandStatus.brainNetStatus.toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-xs">
                        {brandStatus.brainNetClosedAt && (
                          <span className="text-destructive">Closed: {brandStatus.brainNetClosedAt}</span>
                        )}
                        {brandStatus.brainNetOpenedAt && (
                          <span className="text-success">Opened: {brandStatus.brainNetOpenedAt}</span>
                        )}
                        {!brandStatus.brainNetClosedAt && !brandStatus.brainNetOpenedAt && "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {getStatusIcon(brandStatus.liveIpStatus)}
                        <span className={`text-sm font-medium ${
                          brandStatus.liveIpStatus === "open" 
                            ? "text-success" 
                            : brandStatus.liveIpStatus === "closed" 
                            ? "text-destructive" 
                            : "text-muted-foreground"
                        }`}>
                          {brandStatus.liveIpStatus === "idle" ? "-" : brandStatus.liveIpStatus.toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-xs">
                        {brandStatus.liveIpClosedAt && (
                          <span className="text-destructive">Closed: {brandStatus.liveIpClosedAt}</span>
                        )}
                        {brandStatus.liveIpOpenedAt && (
                          <span className="text-success">Opened: {brandStatus.liveIpOpenedAt}</span>
                        )}
                        {!brandStatus.liveIpClosedAt && !brandStatus.liveIpOpenedAt && "-"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Footer */}
        <footer className="text-center mt-12 pb-8">
          <p className="text-muted-foreground text-sm">
            Created by <span className="font-semibold text-foreground">Hammad Jahangir</span>
          </p>
        </footer>
      </div>
    </div>
  );
};
