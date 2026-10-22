"use client";

import { RequestList } from "@/components/hrms/RequestList";

/** Everything I've asked for, in one place (wave A, H16). */
export default function MyRequests() {
  return (
    <div className="mx-auto max-w-3xl">
      <RequestList path="/me/requests" showWho={false} label="My requests" empty="You haven't asked for anything yet." />
    </div>
  );
}
