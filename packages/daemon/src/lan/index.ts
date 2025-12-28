/**
 * LAN Access Module
 *
 * Handles LAN connectivity for mobile device access including:
 * - PIN generation and validation
 * - Local IP address detection
 * - LAN URL generation for QR codes
 */

import { networkInterfaces } from "os";

// In-memory PIN storage (not persisted, regenerates on restart)
let currentPin: string | null = null;
let currentPort: number | null = null;

/**
 * Generate a random 4-digit PIN
 */
export function generatePin(): string {
  currentPin = String(Math.floor(1000 + Math.random() * 9000));
  return currentPin;
}

/**
 * Set the current port (called on server start)
 */
export function setPort(port: number): void {
  currentPort = port;
}

/**
 * Get the current PIN (returns null if LAN mode disabled)
 */
export function getCurrentPin(): string | null {
  return currentPin;
}

/**
 * Validate a PIN
 */
export function validatePin(pin: string): boolean {
  return currentPin !== null && pin === currentPin;
}

/**
 * Clear PIN (for cleanup/testing)
 */
export function clearPin(): void {
  currentPin = null;
}

/**
 * Check if an IP is a typical local network address (preferred for LAN access)
 * Prefers: 192.168.x.x, 10.x.x.x, 172.16-31.x.x
 * Excludes: 100.64-127.x.x (CGNAT/Tailscale), 169.254.x.x (link-local)
 */
function isPreferredLocalIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;

  // 192.168.x.x - most common home/office network
  if (parts[0] === 192 && parts[1] === 168) return true;

  // 10.x.x.x - private network
  if (parts[0] === 10) return true;

  // 172.16.x.x - 172.31.x.x - private network
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  return false;
}

/**
 * Get the local network IP address (prefers local network over VPN)
 */
export function getLocalIpAddress(): string | null {
  const nets = networkInterfaces();
  const allIps: string[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip internal and non-IPv4 addresses
      if (!net.internal && net.family === "IPv4") {
        allIps.push(net.address);
      }
    }
  }

  // Prefer local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  const preferredIp = allIps.find(isPreferredLocalIp);
  if (preferredIp) return preferredIp;

  // Fall back to first available if no preferred IP found
  return allIps[0] || null;
}

/**
 * Get all local network IP addresses
 */
export function getAllLocalIpAddresses(): string[] {
  const addresses: string[] = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (!net.internal && net.family === "IPv4") {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

/**
 * Generate the full LAN URL (without PIN for display)
 */
export function getLanUrl(): string | null {
  const ip = getLocalIpAddress();
  if (!ip || currentPort === null) return null;
  return `http://${ip}:${currentPort}`;
}

/**
 * Generate the full LAN URL with PIN for QR code
 */
export function getLanUrlWithPin(): string | null {
  const ip = getLocalIpAddress();
  if (!ip || !currentPin || currentPort === null) return null;
  return `http://${ip}:${currentPort}?pin=${currentPin}`;
}

/**
 * Check if LAN mode is active (PIN has been generated)
 */
export function isLanModeActive(): boolean {
  return currentPin !== null;
}
