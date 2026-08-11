/** Browser push / desktop notifications for MacroWire alerts. */

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted';
}

export function notifyAlert(alert) {
  if (!canNotify()) return;
  const title = alert.title || 'MacroWire alert';
  const body = alert.detail || alert.message || '';
  try {
    new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: `mw-${alert.type}-${alert.ticker || alert.title}`,
    });
  } catch {
    // Safari / restricted contexts
  }
}

export function alertKey(alert) {
  return `${alert.type}|${alert.ticker || ''}|${alert.title}|${alert.detail || alert.message || ''}`;
}

export function notifyNewAlerts(alerts, lastSeenKeys = []) {
  const seen = new Set(lastSeenKeys);
  const fresh = [];
  for (const a of alerts) {
    const key = alertKey(a);
    if (!seen.has(key)) {
      notifyAlert(a);
      fresh.push(key);
    }
  }
  return fresh;
}
