/**
 * Client-Side Telemetry Logger
 * Automatically forwards frontend events, ad steps, and errors to the server console.
 */

export function sendServerLog(level: 'info' | 'warn' | 'error', message: string, details?: any, userId?: string) {
  try {
    const payload = {
      level,
      message,
      details,
      userId,
      time: new Date().toLocaleTimeString('de-DE'),
    };

    fetch('/api/telemetry/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch (e) {
    // Ignore fetch errors
  }
}
