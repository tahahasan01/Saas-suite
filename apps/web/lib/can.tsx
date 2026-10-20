"use client";

/**
 * Permission gates (D-04, P1-13). The web shows or hides a control on a
 * permission key from /auth/me, never on a role name: roles are tenant-defined
 * and renameable, keys are not. This only hides controls; the API re-checks
 * every request.
 */
import type { MeResponse, PermissionKey, PermissionScope } from "@business-os/types";
import { useSession } from "./session";

const WIDTH: Record<PermissionScope, number> = { own: 0, team: 1, branch: 2, all: 3 };

/** True when `me` holds `key` at `atLeast` scope or wider (any scope by default). */
export function can(me: MeResponse | null, key: PermissionKey, atLeast: PermissionScope = "own"): boolean {
  const scope = me?.permissions[key];
  return scope !== undefined && WIDTH[scope] >= WIDTH[atLeast];
}

/** `can()` bound to the current session. */
export function useCan() {
  const { me } = useSession();
  return (key: PermissionKey, atLeast?: PermissionScope) => can(me, key, atLeast);
}

/** Renders `children` only when the caller holds `perm`; `fallback` otherwise. */
export function Can({
  perm,
  atLeast,
  fallback = null,
  children,
}: {
  perm: PermissionKey;
  atLeast?: PermissionScope;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { me } = useSession();
  return <>{can(me, perm, atLeast) ? children : fallback}</>;
}
