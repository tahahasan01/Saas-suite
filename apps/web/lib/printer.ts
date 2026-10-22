/* A till's receipt printer (3C pilot): WebSerial or WebUSB in Chromium,
 * browser print everywhere else. The choice lives on this device only. */
import type { Paper } from "./escpos";

/* The Web Serial / WebUSB shapes we use; not in TypeScript's DOM lib yet. */
interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
}
interface UsbEndpoint { direction: "in" | "out"; type: string; endpointNumber: number }
interface UsbInterface { interfaceNumber: number; alternate: { endpoints: UsbEndpoint[] } }
interface UsbDeviceLike {
  open(): Promise<void>;
  close(): Promise<void>;
  configuration: { interfaces: UsbInterface[] } | null;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: Uint8Array): Promise<unknown>;
}
interface Nav {
  serial?: { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> };
  usb?: { requestDevice(o: { filters: object[] }): Promise<UsbDeviceLike>; getDevices(): Promise<UsbDeviceLike[]> };
}
const nav = () => (typeof navigator === "undefined" ? {} : (navigator as unknown as Nav));

export type PrinterKind = "browser" | "serial" | "usb";
interface Settings { kind: PrinterKind; paper: Paper; baud: number }
const KEY = "bos.printer";
const DEFAULTS: Settings = { kind: "browser", paper: 80, baud: 9600 };

export function printerSupport(): { serial: boolean; usb: boolean } {
  return { serial: !!nav().serial, usb: !!nav().usb };
}

export function printerSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function savePrinterSettings(s: Partial<Settings>): Settings {
  const next = { ...printerSettings(), ...s };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window: this visit only */ }
  return next;
}

/** Asks the browser for the printer (needs a click). Afterwards the till
 *  finds it again by itself. */
export async function pairPrinter(kind: "serial" | "usb"): Promise<void> {
  if (kind === "serial") await nav().serial!.requestPort();
  else await nav().usb!.requestDevice({ filters: [] });
  savePrinterSettings({ kind });
}

async function sendSerial(bytes: Uint8Array, baud: number): Promise<void> {
  const [port] = (await nav().serial?.getPorts()) ?? [];
  if (!port) throw new Error("No printer paired on this till");
  await port.open({ baudRate: baud });
  try {
    const w = port.writable!.getWriter();
    try { await w.write(bytes); } finally { w.releaseLock(); }
  } finally {
    await port.close();
  }
}

async function sendUsb(bytes: Uint8Array): Promise<void> {
  const [dev] = (await nav().usb?.getDevices()) ?? [];
  if (!dev) throw new Error("No printer paired on this till");
  await dev.open();
  try {
    if (!dev.configuration) await dev.selectConfiguration(1);
    const iface = dev.configuration!.interfaces.find((i) =>
      i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"));
    if (!iface) throw new Error("That USB device isn't a printer");
    await dev.claimInterface(iface.interfaceNumber);
    const out = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk")!;
    await dev.transferOut(out.endpointNumber, bytes);
  } finally {
    await dev.close();
  }
}

/** Sends ESC/POS bytes to this till's printer. Throws when it doesn't
 *  answer, so the caller can offer a retry or browser print. */
export async function sendToPrinter(bytes: Uint8Array): Promise<void> {
  const s = printerSettings();
  const timeout = new Promise<never>((_, no) => setTimeout(() => no(new Error("The printer didn't answer")), 8000));
  await Promise.race([s.kind === "usb" ? sendUsb(bytes) : sendSerial(bytes, s.baud), timeout]);
}
