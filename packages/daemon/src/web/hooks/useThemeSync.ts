/**
 * Theme Sync Hook
 *
 * Synchronizes next-themes with backend config for persistent theme preferences.
 */

import { useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";
import type { Theme } from "@nightshift/shared";

export function useThemeSync() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme();
  const queryClient = useQueryClient();

  // Fetch config to sync theme on load
  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: ["config"],
    queryFn: () => client.config.get(),
  });

  // Sync theme from backend on initial load
  useEffect(() => {
    if (config?.theme && config.theme !== theme) {
      setTheme(config.theme);
    }
  }, [config?.theme, setTheme, theme]);

  // Mutation to persist theme to backend
  const updateThemeMutation = useMutation({
    mutationFn: (newTheme: Theme) => client.config.update({ theme: newTheme }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });

  const changeTheme = useCallback(
    (newTheme: Theme) => {
      setTheme(newTheme);
      updateThemeMutation.mutate(newTheme);
    },
    [setTheme, updateThemeMutation],
  );

  return {
    theme: theme as Theme | undefined,
    resolvedTheme: resolvedTheme as Theme | undefined,
    systemTheme,
    setTheme: changeTheme,
    isLoading: isConfigLoading || updateThemeMutation.isPending,
  };
}
