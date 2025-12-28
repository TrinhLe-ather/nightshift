/**
 * PIN Authentication Middleware
 *
 * Server-level middleware for PIN-based authentication on LAN connections.
 * - Localhost requests bypass authentication
 * - Authenticated sessions use cookies
 * - Unauthenticated requests get a PIN entry page
 */

import { validatePin, getCurrentPin } from "./index";

const AUTH_COOKIE_NAME = "nightshift_lan_auth";
const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Check if request is from localhost (bypasses PIN)
 */
function isLocalhost(request: Request): boolean {
  const url = new URL(request.url);
  const host = url.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Parse cookies from request header
 */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...val] = c.trim().split("=");
      return [key, val.join("=")];
    })
  );
}

/**
 * Check if request has valid auth cookie
 */
function hasValidAuthCookie(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  const authValue = cookies[AUTH_COOKIE_NAME];
  const pin = getCurrentPin();
  return authValue !== undefined && pin !== null && authValue === pin;
}

/**
 * Create auth cookie for response
 */
function createAuthCookie(pin: string): string {
  return `${AUTH_COOKIE_NAME}=${pin}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_COOKIE_MAX_AGE}`;
}

/**
 * Render a mobile-friendly PIN entry page
 */
function renderPinPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#0a0a0a">
  <title>Night Shift - Enter PIN</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #fafafa;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .container {
      max-width: 320px;
      width: 100%;
      text-align: center;
    }
    .logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    p {
      color: #888;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .pin-input-container {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
    }
    .pin-digit {
      width: 3.5rem;
      height: 4rem;
      font-size: 1.75rem;
      font-weight: 600;
      text-align: center;
      background: #1a1a1a;
      border: 2px solid #333;
      color: #fff;
      border-radius: 0.75rem;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .pin-digit:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }
    .pin-digit.filled {
      border-color: #3b82f6;
    }
    input[name="pin"] {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    button {
      width: 100%;
      padding: 0.875rem;
      font-size: 1rem;
      font-weight: 500;
      background: #3b82f6;
      border: none;
      color: #fff;
      border-radius: 0.75rem;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    button:hover { background: #2563eb; }
    button:active { transform: scale(0.98); }
    button:disabled {
      background: #333;
      cursor: not-allowed;
    }
    .error {
      color: #ef4444;
      font-size: 0.875rem;
      margin-top: 0.5rem;
      padding: 0.75rem;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🌙</div>
    <h1>Night Shift</h1>
    <p>Enter the 4-digit PIN shown on the daemon console to connect.</p>
    <form method="GET" id="pinForm">
      <div class="pin-input-container" id="pinContainer">
        <input type="text" class="pin-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" data-index="0" autofocus>
        <input type="text" class="pin-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" data-index="1">
        <input type="text" class="pin-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" data-index="2">
        <input type="text" class="pin-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" data-index="3">
      </div>
      <input type="hidden" name="pin" id="pinHidden">
      <button type="submit" id="submitBtn" disabled>Connect</button>
      ${error ? `<div class="error">${error}</div>` : ""}
    </form>
  </div>
  <script>
    const digits = document.querySelectorAll('.pin-digit');
    const hidden = document.getElementById('pinHidden');
    const submitBtn = document.getElementById('submitBtn');
    const form = document.getElementById('pinForm');

    function updateHidden() {
      const pin = Array.from(digits).map(d => d.value).join('');
      hidden.value = pin;
      submitBtn.disabled = pin.length !== 4;
      digits.forEach((d, i) => {
        d.classList.toggle('filled', d.value.length > 0);
      });
    }

    digits.forEach((digit, idx) => {
      digit.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val.slice(-1);
        updateHidden();
        if (val && idx < 3) digits[idx + 1].focus();
      });

      digit.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          digits[idx - 1].focus();
        }
      });

      digit.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const nums = paste.replace(/[^0-9]/g, '').slice(0, 4);
        nums.split('').forEach((n, i) => {
          if (digits[i]) digits[i].value = n;
        });
        updateHidden();
        if (nums.length === 4) submitBtn.focus();
      });
    });
  </script>
</body>
</html>`;
}

/**
 * PIN authentication middleware
 * Returns null if authenticated, or a Response to send back
 */
export function pinAuthMiddleware(
  request: Request,
  allowLan: boolean
): Response | null {
  // If LAN mode disabled, no auth needed
  if (!allowLan) return null;

  // Localhost always bypasses
  if (isLocalhost(request)) return null;

  // Check for valid auth cookie
  if (hasValidAuthCookie(request)) return null;

  // Check for PIN in query params (initial auth)
  const url = new URL(request.url);
  const pinParam = url.searchParams.get("pin");

  if (pinParam) {
    if (validatePin(pinParam)) {
      // Valid PIN - redirect to clean URL with auth cookie
      const cleanUrl = new URL(url);
      cleanUrl.searchParams.delete("pin");

      return new Response(null, {
        status: 302,
        headers: {
          Location: cleanUrl.pathname + cleanUrl.search,
          "Set-Cookie": createAuthCookie(pinParam),
        },
      });
    } else {
      // Invalid PIN - show error
      return new Response(renderPinPage("Invalid PIN. Please try again."), {
        status: 401,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  // Check if this is an API request (return 401 JSON)
  if (url.pathname.startsWith("/rpc")) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "LAN_AUTH_REQUIRED",
          message: "PIN authentication required for LAN access",
        },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Return PIN entry page for browser requests
  return new Response(renderPinPage(), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
