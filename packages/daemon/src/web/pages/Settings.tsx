/**
 * Settings Page
 *
 * Daemon configuration and system information with technical blueprint aesthetic.
 * Features update management, config display, and system diagnostics.
 *
 * Design: Technical blueprint with precision engineering vibes and system monitoring feel.
 */

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";
import { cn, formatDate, formatUptime } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Settings as SettingsIcon,
  Folder,
  FolderGit2,
  Clock,
  Pencil,
  X,
  Check,
} from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";

interface SettingsCardProps {
  title: string;
  description?: string;
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  iconBorder?: string;
  children: React.ReactNode;
  index: number;
  headerAction?: React.ReactNode;
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
  headerAction,
}: SettingsCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden border border-border bg-card transition-all duration-300",
        "hover:border-primary/30 hover:shadow-[0_0_20px_rgba(var(--primary),0.1)]",
        "animate-in fade-in slide-in-from-bottom-2",
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
    >
      {/* Grid pattern background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.02]">
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center border",
                iconBg,
                iconBorder,
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", iconColor)} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-foreground">{title}</h2>
              {description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {headerAction && <div>{headerAction}</div>}
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
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [formValues, setFormValues] = useState({
    taskTimeoutMs: 14400000, // 4 hours default
    maxConcurrentTasks: 1,
  });

  // Fetch update status
  const { data: updateStatus, isLoading: isLoadingUpdate } = useQuery({
    queryKey: ["update-status"],
    queryFn: () => client.update.getStatus(),
    refetchInterval: 30000,
  });

  // Fetch config
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => client.config.get(),
  });

  // Fetch daemon status
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: () => client.status.getStatus(),
  });

  // Sync form values when config loads
  useEffect(() => {
    if (config) {
      setFormValues({
        taskTimeoutMs: config.taskTimeoutMs || 14400000,
        maxConcurrentTasks: config.maxConcurrentTasks || 1,
      });
    }
  }, [config]);

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: (data: { taskTimeoutMs: number; maxConcurrentTasks: number }) =>
      client.config.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
      setIsEditingConfig(false);
      toast.success("Configuration updated");
    },
    onError: (error) => {
      toast.error("Failed to update configuration", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const handleSaveConfig = () => {
    updateConfigMutation.mutate(formValues);
  };

  const handleCancelEdit = () => {
    if (config) {
      setFormValues({
        taskTimeoutMs: config.taskTimeoutMs || 14400000,
        maxConcurrentTasks: config.maxConcurrentTasks || 1,
      });
    }
    setIsEditingConfig(false);
  };

  // Check for updates mutation
  const checkMutation = useMutation({
    mutationFn: () => client.update.check(),
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
    mutationFn: () => client.update.install(),
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
              <div className="flex h-10 w-10 items-center justify-center border border-primary/30 bg-primary/10">
                <SettingsIcon className="h-5 w-5 text-primary" />
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
                "h-2.5 w-2.5",
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
                  {status.uptime ? formatUptime(Math.floor(status.uptime / 1000)) : "—"}
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
              <span>Last checked: {updateStatus?.lastCheckAt ? formatDate(updateStatus.lastCheckAt) : "Never"}</span>
            </div>

            {/* Update Available */}
            {updateStatus?.updateAvailable && (
              <div className="border border-sky-500/30 bg-sky-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Download className="mt-0.5 h-5 w-5 text-sky-400" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">Update Available</p>
                      <Badge
                        variant="outline"
                        className="border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] text-sky-400"
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
              <div className="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/5 p-3">
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
          icon={Folder}
          iconColor={modeStyle.color}
          iconBg={modeStyle.bgColor}
          iconBorder={modeStyle.borderColor}
          index={1}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-2.5 w-2.5",
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
                  "border px-2 py-0.5 text-xs uppercase tracking-wider",
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
          icon={SettingsIcon}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10"
          iconBorder="border-violet-500/30"
          index={2}
          headerAction={
            isEditingConfig ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={updateConfigMutation.isPending}
                  className="h-7 px-2"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveConfig}
                  disabled={updateConfigMutation.isPending}
                  className="h-7 px-2"
                >
                  {updateConfigMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingConfig(true)}
                className="h-7 px-2"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )
          }
        >
          {isEditingConfig ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs text-muted-foreground">Task Timeout (hours)</label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={Math.round(formValues.taskTimeoutMs / 3600000)}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      taskTimeoutMs: Number(e.target.value) * 3600000,
                    })
                  }
                  className="h-8 w-24 text-right font-mono text-sm"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs text-muted-foreground">Max Concurrent Tasks</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formValues.maxConcurrentTasks}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      maxConcurrentTasks: Number(e.target.value),
                    })
                  }
                  className="h-8 w-24 text-right font-mono text-sm"
                />
              </div>
            </div>
          ) : (
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
          )}
        </SettingsCard>

        {/* System Information */}
        <SettingsCard
          title="System"
          description="Database and runtime info"
          icon={FolderGit2}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
          iconBorder="border-amber-500/30"
          index={3}
        >
          <div className="divide-y divide-border/50">
            <ConfigItem
              label="Uptime"
              value={status?.uptime ? formatUptime(Math.floor(status.uptime / 1000)) : "—"}
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
