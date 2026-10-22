"use client";

import { RequestList } from "@/components/hrms/RequestList";

/** Everything waiting for my decision, across leave, WFH, corrections and
 *  overtime (wave A, H16); only the kinds I may decide. */
export default function Approvals() {
  return <RequestList path="/hrms/requests/pending" showWho label="Waiting for a decision" empty="Nothing is waiting for you." />;
}
