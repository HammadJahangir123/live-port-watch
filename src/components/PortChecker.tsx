import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CheckCircle2, XCircle, Loader2, Activity, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type PortStatus = "checking" | "open" | "closed" | "idle";

interface BrandStatus {
  brand: string;
  brainNetIp: string;
  liveIp: string;
  brainNetStatus: PortStatus;
  liveIpStatus: PortStatus;
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

interface ClosedCount {
  [key: string]: number; // key format: "brand-ipType" (e.g., "Bareeze-brainNet")
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
  const [whatsappNumber, setWhatsappNumber] = useState<string>("");
  const [closedCounts, setClosedCounts] = useState<ClosedCount>({});
  const [alarmIntervals, setAlarmIntervals] = useState<{[key: string]: NodeJS.Timeout}>({});
  const [volume, setVolume] = useState<number>(0.4);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Play Brain Net IP alarm sound (lower pitch, pulsing pattern)
  const playBrainNetAlarmSound = () => {
    if (isMuted) return;
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Deep warning tone for Brain Net
    oscillator1.type = 'sine';
    oscillator2.type = 'sine';
    
    // Create pulsing dual-tone effect
    oscillator1.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator1.frequency.setValueAtTime(330, audioContext.currentTime + 0.25);
    oscillator1.frequency.setValueAtTime(440, audioContext.currentTime + 0.5);
    
    oscillator2.frequency.setValueAtTime(330, audioContext.currentTime);
    oscillator2.frequency.setValueAtTime(440, audioContext.currentTime + 0.25);
    oscillator2.frequency.setValueAtTime(330, audioContext.currentTime + 0.5);
    
    // Apply user-controlled volume
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.7);
    
    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.7);
    oscillator2.stop(audioContext.currentTime + 0.7);
  };

  // Play Live IP alarm sound (urgent siren pattern)
  const playLiveIpAlarmSound = () => {
    if (isMuted) return;
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Urgent siren for Live IP
    oscillator.type = 'sawtooth';
    
    // Rising and falling siren effect
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(1200, audioContext.currentTime + 0.3);
    oscillator.frequency.linearRampToValueAtTime(600, audioContext.currentTime + 0.6);
    
    // Apply user-controlled volume
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.7);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.7);
  };

  // Start continuous alarm for a specific brand/IP
  const startContinuousAlarm = (key: string, alarmType: 'brainNet' | 'liveIp') => {
    // Stop existing alarm if any
    if (alarmIntervals[key]) {
      clearInterval(alarmIntervals[key]);
    }
    
    // Select alarm sound based on type
    const alarmSound = alarmType === 'brainNet' ? playBrainNetAlarmSound : playLiveIpAlarmSound;
    
    // Play alarm immediately
    alarmSound();
    
    // Set up continuous alarm every 2 seconds
    const intervalId = setInterval(() => {
      alarmSound();
    }, 2000);
    
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

  // Send WhatsApp notification
  const sendWhatsAppNotification = async (brand: string, host: string, ipType: string) => {
    if (!whatsappNumber) return;
    
    try {
      await supabase.functions.invoke('send-whatsapp-alert', {
        body: { 
          phoneNumber: whatsappNumber,
          brand,
          host,
          port: "20000"
        }
      });
    } catch (error) {
      console.error("WhatsApp notification error:", error);
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
        const newCount = (closedCounts[brainNetKey] || 0) + 1;
        setClosedCounts(prev => ({ ...prev, [brainNetKey]: newCount }));
        
        // Start continuous alarm immediately with Brain Net sound
        startContinuousAlarm(brainNetKey, 'brainNet');
        toast.error(`${brand} - Brain Net IP PORT CLOSED! (Check ${newCount})`, { duration: 10000 });
        await sendWhatsAppNotification(brand, brandConfig.brain_net_ip, "Brain Net IP");
      } else if (brainNetResult === "open") {
        // Reset count and stop alarm when port opens
        if (closedCounts[brainNetKey] && closedCounts[brainNetKey] > 0) {
          setClosedCounts(prev => ({ ...prev, [brainNetKey]: 0 }));
          stopContinuousAlarm(brainNetKey);
          toast.success(`${brand} - Brain Net IP recovered!`);
        }
      }
      
      // Handle Live IP status changes
      const liveIpKey = `${brand}-liveIp`;
      if (liveIpResult === "closed") {
        const newCount = (closedCounts[liveIpKey] || 0) + 1;
        setClosedCounts(prev => ({ ...prev, [liveIpKey]: newCount }));
        
        // Start continuous alarm immediately with Live IP sound
        startContinuousAlarm(liveIpKey, 'liveIp');
        toast.error(`${brand} - Live IP PORT CLOSED! (Check ${newCount})`, { duration: 10000 });
        await sendWhatsAppNotification(brand, brandConfig.live_ip, "Live IP");
      } else if (liveIpResult === "open") {
        // Reset count and stop alarm when port opens
        if (closedCounts[liveIpKey] && closedCounts[liveIpKey] > 0) {
          setClosedCounts(prev => ({ ...prev, [liveIpKey]: 0 }));
          stopContinuousAlarm(liveIpKey);
          toast.success(`${brand} - Live IP recovered!`);
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
  }, [whatsappNumber]);

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

        {/* Alarm Controls */}
        <Card className="max-w-md mx-auto mb-8 p-6 bg-card/50 backdrop-blur-xl border-2 border-border shadow-xl animate-scale-in">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Alarm Controls</h3>
              <Button
                variant={isMuted ? "destructive" : "default"}
                size="sm"
                onClick={() => setIsMuted(!isMuted)}
                className="gap-2"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {isMuted ? "Unmute" : "Mute"}
              </Button>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Volume</label>
                <span className="text-sm font-semibold text-foreground">{Math.round(volume * 100)}%</span>
              </div>
              <Slider
                value={[volume * 100]}
                onValueChange={(value) => setVolume(value[0] / 100)}
                max={100}
                step={1}
                className="w-full"
                disabled={isMuted}
              />
            </div>
          </div>
        </Card>


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
                  <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Live IP Status</th>
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
