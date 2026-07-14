"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/* The FBR stamp on a customer receipt. Legally required for Tier-1 retailers:
   the invoice number FBR issued plus a verifiable QR encoding it.

   Spec (PRAL DI API v1.12 §6): QR version 2 (25x25), 1.0 x 1.0 inch. `version: 2`
   is pinned rather than left to the encoder, which would otherwise pick a
   smaller/larger symbol depending on payload length. */

const INCH = "1in";

export function FbrStamp({
  invoiceNumber,
  status,
}: {
  invoiceNumber: string | null;
  status: string | null;
}) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceNumber) return setQr(null);
    QRCode.toDataURL(invoiceNumber, { version: 2, margin: 0, errorCorrectionLevel: "L" })
      .then(setQr)
      // A QR we cannot draw must not blank the receipt — the number still prints.
      .catch(() => setQr(null));
  }, [invoiceNumber]);

  if (!status) return null; // FBR not enabled for this tenant

  if (!invoiceNumber) {
    return (
      <div className="mt-3 border-t border-dashed border-line pt-2 text-center">
        <p className="text-[10px] text-fg-muted">FBR invoice pending — will be filed automatically.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-dashed border-line pt-2 text-center">
      <p className="text-[10px] font-semibold">FBR Digital Invoice</p>
      <p className="font-mono text-[10px] tracking-tight">{invoiceNumber}</p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element -- data URI, no loader needed
        <img
          src={qr}
          alt={`FBR invoice ${invoiceNumber}`}
          style={{ width: INCH, height: INCH }}
          className="mx-auto mt-1"
        />
      )}
      <p className="text-[9px] text-fg-subtle">Verify at fbr.gov.pk</p>
    </div>
  );
}
