/* The browser's location for a punch (D-43). The server decides whether the
   punch is inside the work location's geofence; this only reports what the
   device says. No permission, no GPS, or a timeout resolves to null and the
   punch goes ahead without a fix (the server records "no fix", and refuses
   it only where the location requires the geofence). */

export type Fix = { lat: number; lng: number; accuracy_m: number };

export function currentFix(timeoutMs = 10_000): Promise<Fix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    // Some browsers never call back when the prompt is ignored; give up on our own.
    const giveUp = setTimeout(() => resolve(null), timeoutMs + 1_000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(giveUp);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) });
      },
      () => { clearTimeout(giveUp); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
