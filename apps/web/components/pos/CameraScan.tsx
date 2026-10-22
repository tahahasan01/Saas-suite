"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { dispatchScan } from "@/lib/scan";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui";

/* The camera as a scanner when there is no wedge scanner (F19): the
 * browser's own BarcodeDetector (Chrome on Android, no library), the back
 * camera, one read per opening. Hidden where the browser can't detect. */

interface Detected { rawValue: string }
interface Detector { detect(source: HTMLVideoElement): Promise<Detected[]> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

function detectorCtor(): DetectorCtor | undefined {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return undefined;
  return (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
}

export function CameraScan({ onClosed }: { onClosed?: () => void }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setSupported(Boolean(detectorCtor())), []);
  if (!supported) return null;
  return (
    <>
      <Button type="button" variant="subtle" aria-label="Scan with the camera" onClick={() => setOpen(true)}>
        <Camera size={18} aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClosed?.(); }} title="Scan with the camera" size="sm">
        {open && <Viewfinder onRead={(code) => { setOpen(false); onClosed?.(); void dispatchScan(code); }} />}
      </Dialog>
    </>
  );
}

function Viewfinder({ onRead }: { onRead: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const read = useRef(onRead);
  read.current = onRead;

  useEffect(() => {
    const Ctor = detectorCtor();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const detector = new Ctor({ formats: FORMATS });
    const look = async () => {
      if (stopped || !video.current) return;
      try {
        const [hit] = await detector.detect(video.current);
        if (hit?.rawValue && !stopped) { stopped = true; read.current(hit.rawValue); return; }
      } catch { /* a frame that couldn't be read: try the next one */ }
      timer = setTimeout(look, 250);
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play();
          void look();
        }
      })
      .catch(() => setError("The camera isn't available. Allow camera access for this site, or type the code."));
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return error ? (
    <p role="alert" className="text-sm text-danger">{error}</p>
  ) : (
    <div className="space-y-2">
      <video ref={video} muted playsInline className="aspect-video w-full rounded-lg bg-black object-cover" />
      <p className="text-xs text-fg-muted">Hold the barcode inside the frame. It adds to the cart as soon as it reads.</p>
    </div>
  );
}
