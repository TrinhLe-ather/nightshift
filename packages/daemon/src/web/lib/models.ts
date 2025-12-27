/**
 * Shared model styling utilities
 *
 * Provides consistent model colors and styling across workflow pages.
 */

export interface ModelStyle {
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}

/**
 * Model options for selects
 */
export const MODEL_OPTIONS = [
  { value: "", label: "Default (inherit)", color: "text-muted-foreground" },
  { value: "haiku", label: "Haiku", color: "text-emerald-400" },
  { value: "sonnet", label: "Sonnet", color: "text-primary" },
  { value: "opus", label: "Opus", color: "text-violet-400" },
] as const;

/**
 * Get styling for a model
 */
export function getModelStyle(model?: string): ModelStyle {
  if (!model) {
    return {
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
      borderColor: "border-border",
      label: "Default",
    };
  }
  if (model.includes("opus")) {
    return {
      color: "text-violet-400",
      bgColor: "bg-violet-500/10",
      borderColor: "border-violet-500/30",
      label: "Opus",
    };
  }
  if (model.includes("sonnet")) {
    return {
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/30",
      label: "Sonnet",
    };
  }
  if (model.includes("haiku")) {
    return {
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/30",
      label: "Haiku",
    };
  }
  return {
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
    label: model,
  };
}

/**
 * Get just the color class for a model value
 */
export function getModelColor(model: string): string {
  const opt = MODEL_OPTIONS.find((o) => o.value === model);
  return opt?.color ?? "text-muted-foreground";
}
