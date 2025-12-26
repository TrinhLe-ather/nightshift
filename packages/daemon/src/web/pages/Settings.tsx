/**
 * Settings Page
 *
 * Daemon configuration, operating mode, and updates.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/web/api/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw } from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";

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

export function Settings() {
  const queryClient = useQueryClient();
  const [isInstalling, setIsInstalling] = useState(false);

  // Fetch update status
  const { data: updateStatus, isLoading: isLoadingUpdate } = useQuery({
    queryKey: ["update-status"],
    queryFn: api.getUpdateStatus,
    refetchInterval: 30000, // Check every 30 seconds
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
      // The daemon will restart, page will need refresh
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

  return (
    <Container className="py-4 lg:py-6">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Settings</h1>

      <div className="space-y-6">
        {/* Updates Section */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-foreground">Updates</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep Night Shift up to date for the latest features and fixes.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {/* Current Version */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Version</p>
                <p className="mt-1 font-mono text-foreground">
                  v{updateStatus?.currentVersion || "..."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckForUpdates}
                disabled={checkMutation.isPending}
              >
                {checkMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Check for Updates
              </Button>
            </div>

            {/* Last Check */}
            <div>
              <p className="text-sm text-muted-foreground">Last Checked</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(updateStatus?.lastCheckAt ?? null)}
              </p>
            </div>

            {/* Update Available */}
            {updateStatus?.updateAvailable && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Download className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">Update Available</p>
                      <Badge variant="default">v{updateStatus.availableVersion}</Badge>
                    </div>
                    {updateStatus.releaseNotes && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {updateStatus.releaseNotes.split("\n")[0]}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        onClick={handleInstallUpdate}
                        disabled={
                          installMutation.isPending || isInstalling || !updateStatus.canUpdate
                        }
                      >
                        {installMutation.isPending || isInstalling ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {isInstalling ? "Restarting..." : "Installing..."}
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Update Now
                          </>
                        )}
                      </Button>
                      {!updateStatus.canUpdate && (
                        <p className="text-sm text-amber-500">
                          <AlertCircle className="mr-1 inline h-4 w-4" />
                          Wait for running task to complete
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Up to Date */}
            {!isLoadingUpdate && !updateStatus?.updateAvailable && (
              <div className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-sm">You're running the latest version</p>
              </div>
            )}
          </div>
        </Card>

        {/* General Settings */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-medium text-foreground">General</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Port</p>
              <p className="mt-1 text-foreground">{config?.port || 3847}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Task Timeout</p>
              <p className="mt-1 text-foreground">
                {config?.taskTimeoutMs
                  ? `${Math.round(config.taskTimeoutMs / 3600000)} hours`
                  : "4 hours"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Max Concurrent Tasks</p>
              <p className="mt-1 text-foreground">{config?.maxConcurrentTasks || 1}</p>
            </div>
          </div>
        </Card>

        {/* Operating Mode */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-medium text-foreground">Operating Mode</h2>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-foreground">
              {status?.mode === "standalone"
                ? "Standalone"
                : status?.mode === "connected"
                  ? "Connected"
                  : status?.mode === "hybrid"
                    ? "Hybrid"
                    : "Standalone"}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {status?.mode === "standalone" || !status?.mode
              ? "Running locally without server connection"
              : status?.mode === "connected"
                ? "Connected to Control Center"
                : "Local and remote queues active"}
          </p>
        </Card>

        {/* System Info */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-medium text-foreground">System</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Uptime</p>
              <p className="mt-1 text-foreground">
                {status?.uptime
                  ? `${Math.floor(status.uptime / 3600)}h ${Math.floor(
                      (status.uptime % 3600) / 60,
                    )}m`
                  : "..."}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Database</p>
              <p className="mt-1 text-foreground">
                Schema v{status?.database?.schemaVersion || "..."} •{" "}
                {status?.database?.tables?.length || "..."} tables
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Container>
  );
}
