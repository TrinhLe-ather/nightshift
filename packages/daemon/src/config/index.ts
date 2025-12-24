/**
 * Configuration Management
 *
 * Manages daemon configuration stored in ~/.nightshift/config.json
 * - Loads config on startup
 * - Creates default config if none exists
 * - Validates config with Zod schema
 * - Provides typed access to config values
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { type Config, configSchema } from "@nightshift/shared";
import { CONFIG_PATH, ensureNightShiftDirectories } from "./paths";
import { DEFAULT_CONFIG } from "./defaults";

/**
 * In-memory config cache
 * Loaded once at startup and cached for the daemon lifetime
 */
let configCache: Config | null = null;

/**
 * Load configuration from file
 * Creates default config if file doesn't exist
 * Validates with Zod schema and merges with defaults
 *
 * @returns Validated configuration object
 * @throws Error if config file is invalid
 */
export function loadConfig(): Config {
  // Return cached config if already loaded
  if (configCache !== null) {
    return configCache;
  }

  // Ensure ~/.nightshift directory exists
  ensureNightShiftDirectories();

  // If config file doesn't exist, create it with defaults
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
    configCache = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }

  // Read and parse config file
  try {
    const fileContent = readFileSync(CONFIG_PATH, "utf-8");
    const rawConfig = JSON.parse(fileContent);

    // Validate and parse with Zod schema
    // This will fill in any missing fields with defaults
    const validatedConfig = configSchema.parse(rawConfig);

    // Cache and return
    configCache = validatedConfig;
    return validatedConfig;
  } catch (error) {
    // If config is invalid, throw with helpful message
    if (error instanceof Error) {
      throw new Error(`Invalid config file at ${CONFIG_PATH}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Save configuration to file
 * Merges partial config with existing config
 * Validates with Zod schema before writing
 *
 * @param partialConfig - Partial config object with fields to update
 * @throws Error if merged config is invalid
 */
export function saveConfig(partialConfig: Partial<Config>): void {
  // Load current config (or defaults if none exists)
  const currentConfig = loadConfig();

  // Merge with provided values
  const mergedConfig = {
    ...currentConfig,
    ...partialConfig,
  };

  // Validate merged config
  const validatedConfig = configSchema.parse(mergedConfig);

  // Write to file
  ensureNightShiftDirectories();
  writeFileSync(CONFIG_PATH, JSON.stringify(validatedConfig, null, 2), "utf-8");

  // Update cache
  configCache = validatedConfig;
}

/**
 * Get a single config value by key
 * Useful for accessing config values without loading entire config object
 *
 * @param key - Config key to retrieve
 * @returns Value for the specified key
 */
export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  const config = loadConfig();
  return config[key];
}

/**
 * Reset config cache
 * Used for testing or when config file is modified externally
 */
export function resetConfigCache(): void {
  configCache = null;
}

/**
 * Get the current config (from cache if available)
 * Alias for loadConfig() for clarity
 *
 * @returns Current configuration object
 */
export function getConfig(): Config {
  return loadConfig();
}
