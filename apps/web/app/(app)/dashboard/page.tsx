import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { DashboardOverview } from "@business-os/types";
import { qk } from "@/lib/queryKeys";
import { serverGet } from "@/lib/server-api";
import { DashboardView } from "./DashboardView";

/* A server page (F28, first slice): it fetches the overview while the shell
 * loads the session, and hands it to the client view through the Query
 * cache, so the dashboard doesn't wait for a second round trip after
 * sign-in. When the prefetch can't happen, the view fetches it itself. */
export default async function DashboardPage() {
  const client = new QueryClient();
  const overview = await serverGet<DashboardOverview>("/dashboard/overview");
  if (overview) client.setQueryData(qk.dashboard.overview(), overview);
  return (
    <HydrationBoundary state={dehydrate(client)}>
      <DashboardView />
    </HydrationBoundary>
  );
}
