/**
 * Settings Page
 *
 * Daemon configuration and system information with technical blueprint aesthetic.
 * Features update management, config display, and system diagnostics.
 *
 * Design: Technical blueprint with precision engineering vibes and system monitoring feel.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/web/api/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Settings,
  Server,
  Database,
  Clock,
  Cpu,
} from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/utils";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

interface SettingsCardProps {
  title: string;
  description?: string;
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  iconBorder?: string;
  children: React.ReactNode;
  index: number;
}

function SettingsCard({
  title,
  description,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  iconBorder = "border-primary/30",
  children,
  index,
}: SettingsCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-card transition-all duration-300",
        "hover:border-primary/30 hover:shadow-[0_0_20px_rgba(var(--primary),0.05)]",
        "animate-in fade-in slide-in-from-bottom-2",
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
    >
      {/* Grid pattern background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.015]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
      </div>

      {/* Header */}
      <div className="relative border-b border-border/50 p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
              iconBg,
              iconBorder,
            )}
          >
            <Icon className={cn("h-4 w-4", iconColor)} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-foreground">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative p-4">{children}</div>
    </div>
  );
}

interface ConfigItemProps {
  label: string;
  value: string | number;
  valueColor?: string;
}

function ConfigItem({ label, value, valueColor = "text-foreground" }: ConfigItemProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-medium text-sm", valueColor)}>{value}</span>
    </div>
  );
}

export function Settings() {
  const queryClient = useQueryClient();
  const [isInstalling, setIsInstalling] = useState(false);

  // Fetch update status
  const { data: updateStatus, isLoading: isLoadingUpdate } = useQuery({
    queryKey: ["update-status"],
    queryFn: api.getUpdateStatus,
    refetchInterval: 30000,
  });

  // Fetch config
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });

  // Fetch daemon status
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: api.getStatus,
  });

  // Check for updates mutation
  const checkMutation = useMutation({
    mutationFn: api.checkForUpdates,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["update-status"] });
      if (data.updateAvailable) {
        toast.info("Update available", {
          description: `Version ${data.availableVersion} is ready to download.`,
        });
      } else {
        toast.success("You're up to date", {
          description: `Version ${data.currentVersion} is the latest.`,
        });
      }
    },
    onError: (error) => {
      toast.error("Check failed", {
        description: error instanceof Error ? error.message : "Could not check for updates",
      });
    },
  });

  // Install update mutation
  const installMutation = useMutation({
    mutationFn: api.installUpdate,
    onSuccess: () => {
      setIsInstalling(true);
      toast.success("Update installed", {
        description: "Night Shift is restarting...",
        duration: 10000,
      });
    },
    onError: (error) => {
      toast.error("Update failed", {
        description: error instanceof Error ? error.message : "Could not install update",
      });
    },
  });

  const handleCheckForUpdates = () => {
    checkMutation.mutate();
  };

  const handleInstallUpdate = () => {
    if (!updateStatus?.canUpdate) {
      toast.warning("Cannot update", {
        description: "A task is currently running. Please wait for it to complete.",
      });
      return;
    }
    installMutation.mutate();
  };

  // Operating mode styling
  const getModeStyle = (mode?: string) => {
    switch (mode) {
      case "connected":
        return {
          color: "text-primary",
          bgColor: "bg-primary/10",
          borderColor: "border-primary/30",
          label: "Connected",
        };
      case "hybrid":
        return {
          color: "text-violet-400",
          bgColor: "bg-violet-500/10",
          borderColor: "border-violet-500/30",
          label: "Hybrid",
        };
      default:
        return {
          color: "text-emerald-400",
          bgColor: "bg-emerald-500/10",
          borderColor: "border-emerald-500/30",
          label: "Standalone",
        };
    }
  };

  const modeStyle = getModeStyle(status?.mode);

  return (
    <Container className="py-6 lg:py-8">
      {/* Header with technical aesthetic */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Daemon configuration and system information
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-6 flex items-center gap-6 border-y border-border/50 py-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                status?.running
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]",
              )}
            />
            <span className="text-xs font-medium text-foreground">
              {status?.running ? "DAEMON ACTIVE" : "DAEMON OFFLINE"}
            </span>
          </div>
          {status && (
            <>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Version:</span>
                <span className="font-medium font-mono text-foreground">
                  v{updateStatus?.currentVersion || status.version}
                </span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Uptime:</span>
                <span className="font-medium text-foreground">
                  {status.uptime ? formatUptime(status.uptime) : "—"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Updates Section */}
        <SettingsCard
          title="Updates"
          description="Keep Night Shift up to date"
          icon={Download}
          iconColor="text-sky-400"
          iconBg="bg-sky-500/10"
          iconBorder="border-sky-500/30"
          index={0}
        >
          <div className="space-y-4">
            {/* Current Version */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Current Version
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                  v{updateStatus?.currentVersion || "..."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckForUpdates}
                disabled={checkMutation.isPending}
                className="h-8"
              >
                {checkMutation.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Check
              </Button>
            </div>

            {/* Last Check */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last checked: {formatDate(updateStatus?.lastCheckAt ?? null)}</span>
            </div>

            {/* Update Available */}
            {updateStatus?.updateAvailable && (
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Download className="mt-0.5 h-5 w-5 text-sky-400" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">Update Available</p>
                      <Badge
                        variant="outline"
                        className="rounded border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] text-sky-400"
                      >
                        v{updateStatus.availableVersion}
                      </Badge>
                    </div>
                    {updateStatus.releaseNotes && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {updateStatus.releaseNotes.split("\n")[0]}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        size="sm"
                        onClick={handleInstallUpdate}
                        disabled={
                          installMutation.isPending || isInstalling || !updateStatus.canUpdate
                        }
                        className="h-8"
                      >
                        {installMutation.isPending || isInstalling ? (
                          <>
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            {isInstalling ? "Restarting..." : "Installing..."}
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-3.5 w-3.5" />
                            Update Now
                          </>
                        )}
                      </Button>
                      {!updateStatus.canUpdate && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Task running
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Up to Date */}
            {!isLoadingUpdate && !updateStatus?.updateAvailable && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <p className="text-xs text-emerald-400">Running the latest version</p>
              </div>
            )}
          </div>
        </SettingsCard>

        {/* Operating Mode */}
        <SettingsCard
          title="Operating Mode"
          description="Daemon execution configuration"
          icon={Server}
          iconColor={modeStyle.color}
          iconBg={modeStyle.bgColor}
          iconBorder={modeStyle.borderColor}
          index={1}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  modeStyle.bgColor.replace("/10", ""),
                  `shadow-[0_0_8px_rgba(var(--${modeStyle.color.replace("text-", "")}),0.6)]`,
                )}
                style={{
                  backgroundColor:
                    status?.mode === "connected"
                      ? "var(--primary)"
                      : status?.mode === "hybrid"
                        ? "#a78bfa"
                        : "#34d399",
                  boxShadow:
                    status?.mode === "connected"
                      ? "0 0 8px rgba(var(--primary), 0.6)"
                      : status?.mode === "hybrid"
                        ? "0 0 8px rgba(167, 139, 250, 0.6)"
                        : "0 0 8px rgba(52, 211, 153, 0.6)",
                }}
              />
              <Badge
                variant="outline"
                className={cn(
                  "rounded border px-2 py-0.5 text-xs uppercase tracking-wider",
                  modeStyle.bgColor,
                  modeStyle.borderColor,
                  modeStyle.color,
                )}
              >
                {modeStyle.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {status?.mode === "standalone" || !status?.mode
                ? "Running locally without server connection. Tasks are managed from the local queue only."
                : status?.mode === "connected"
                  ? "Connected to Control Center. Tasks are synchronized with the cloud."
                  : "Hybrid mode active. Both local and remote queues are being processed."}
            </p>
          </div>
        </SettingsCard>

        {/* General Configuration */}
        <SettingsCard
          title="Configuration"
          description="Runtime settings"
          icon={Cpu}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10"
          iconBorder="border-violet-500/30"
          index={2}
        >
          <div className="divide-y divide-border/50">
            <ConfigItem label="Port" value={config?.port || 3847} valueColor="font-mono" />
            <ConfigItem
              label="Task Timeout"
              value={
                config?.taskTimeoutMs
                  ? `${Math.round(config.taskTimeoutMs / 3600000)} hours`
                  : "4 hours"
              }
            />
            <ConfigItem label="Max Concurrent Tasks" value={config?.maxConcurrentTasks || 1} />
          </div>
        </SettingsCard>

        {/* System Information */}
        <SettingsCard
          title="System"
          description="Database and runtime info"
          icon={Database}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
          iconBorder="border-amber-500/30"
          index={3}
        >
          <div className="divide-y divide-border/50">
            <ConfigItem
              label="Uptime"
              value={status?.uptime ? formatUptime(status.uptime) : "—"}
            />
            <ConfigItem
              label="Database Schema"
              value={`v${status?.database?.schemaVersion || "..."}`}
              valueColor="font-mono"
            />
            <ConfigItem
              label="Tables"
              value={status?.database?.tables?.length || "..."}
            />
          </div>
        </SettingsCard>
      </div>
    </Container>
  );
}
