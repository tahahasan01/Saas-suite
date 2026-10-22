import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, apiUrl, fieldErrors, installErrorUi, NetworkError, normalizeError, type ErrorUi } from "./api";

/** The error a call failed with (the test fails if it succeeded). */
async function failure(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (e) { return e as ApiError; }
  throw new Error("expected the request to fail");
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("normalizeError", () => {
  it("turns FastAPI's 422 list into field errors and a readable message", () => {
    const e = new ApiError(422, [
      { loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error" },
      { loc: ["body", "items", 0, "qty"], msg: "must be positive", type: "value_error" },
    ]);
    const n = normalizeError(e);
    expect(n.kind).toBe("validation");
    expect(n.message).toBe("value is not a valid email address");
    expect(fieldErrors(e)).toEqual({ email: "value is not a valid email address", "items.0.qty": "must be positive" });
  });

  it("keeps the server's words, and falls back by kind", () => {
    expect(normalizeError(new ApiError(409, "Already exists")).message).toBe("Already exists");
    expect(normalizeError(new ApiError(409, { message: "Duplicate lead", lead_id: "x" })).message).toBe("Duplicate lead");
    expect(normalizeError(new ApiError(403, null)).message).toMatch(/permission/);
    expect(normalizeError(new ApiError(503, null)).kind).toBe("server");
  });

  it("calls a request that never got an answer offline", () => {
    expect(normalizeError(new NetworkError()).kind).toBe("offline");
    expect(normalizeError(new TypeError("Failed to fetch")).kind).toBe("offline");
    expect(normalizeError("weird").kind).toBe("unknown");
  });
});

describe("requests", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let ui: { toast: ReturnType<typeof vi.fn<ErrorUi["toast"]>>; toLogin: ReturnType<typeof vi.fn<ErrorUi["toLogin"]>>; path: string };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    ui = { toast: vi.fn<ErrorUi["toast"]>(), toLogin: vi.fn<ErrorUi["toLogin"]>(), path: "/pos/products" };
    const bridge: ErrorUi = { toast: ui.toast, toLogin: ui.toLogin, currentPath: () => ui.path };
    installErrorUi(bridge);
  });
  afterEach(() => { installErrorUi(null); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("goes to the same-origin /api, never another host", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api("/pos/summary");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pos/summary");
    expect(apiUrl("/invoices/1/pdf")).toBe("/api/invoices/1/pdf");
  });

  it("sends a 401 to /login?next=… and marks the error handled", async () => {
    ui.path = "/pos/products?q=dawn";
    fetchMock.mockResolvedValue(json(401, { detail: "Not authenticated" }));
    const err = await failure(api("/pos/products"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.handled).toBe(true);
    expect(ui.toLogin).toHaveBeenCalledWith("/pos/products?q=dawn");
  });

  it("doesn't redirect for a wrong password or on a public page", async () => {
    fetchMock.mockResolvedValue(json(401, { detail: "Invalid email or password" }));
    await api("/auth/login", { method: "POST", body: "{}" }).catch(() => undefined);
    ui.path = "/pricing";
    await api("/billing/plans").catch(() => undefined);
    ui.path = "/q/some-quote-token";     // the customer's quote page (wave D)
    await api("/notifications").catch(() => undefined);
    expect(ui.toLogin).not.toHaveBeenCalled();
    ui.path = "/quotes";                 // only the /q page itself, not a lookalike
    await api("/notifications").catch(() => undefined);
    expect(ui.toLogin).toHaveBeenCalledTimes(1);
  });

  it("toasts a refused or broken write once, and leaves reads to the page", async () => {
    fetchMock.mockResolvedValue(json(500, { detail: "Something went wrong. Please try again." }, { "X-Request-ID": "abcdef1234" }));
    const write = await failure(api("/pos/products", { method: "POST", body: "{}" }));
    expect(write.handled).toBe(true);
    expect(ui.toast).toHaveBeenCalledWith("error", "Something went wrong. Please try again. (ref abcdef12)");

    ui.toast.mockClear();
    const read = await failure(api("/pos/products"));
    expect(read.handled).toBe(false);
    expect(ui.toast).not.toHaveBeenCalled();
  });

  it("leaves 422s to the form", async () => {
    fetchMock.mockResolvedValue(json(422, { detail: [{ loc: ["body", "name"], msg: "required" }] }));
    const err = await failure(api("/hrms/employees", { method: "POST", body: "{}" }));
    expect(err.handled).toBe(false);
    expect(ui.toast).not.toHaveBeenCalled();
  });

  it("retries a read through a dropped connection with backoff", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json(200, [1, 2]));
    const p = api<number[]>("/pos/products");
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(ui.toast).toHaveBeenCalledWith("info", "Connection lost. Retrying…");
  });

  it("never repeats a write on its own (a sale must not be sent twice)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await failure(api("/pos/sales", { method: "POST", body: "{}" }));
    expect(err).toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ui.toast).toHaveBeenCalledWith("error", expect.stringMatching(/reach the server/));
  });

  it("stays quiet when the caller shows the failure itself", async () => {
    fetchMock.mockResolvedValue(json(503, { detail: "down" }));
    const err = await failure(api("/pos/sales", { method: "POST", body: "{}", notify: false }));
    expect(err.handled).toBe(false);
    expect(ui.toast).not.toHaveBeenCalled();
  });
});
