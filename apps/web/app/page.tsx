"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

export default function Home() {
  const { me, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading) router.replace(me ? "/dashboard" : "/login");
  }, [me, loading, router]);

  return <main className="grid min-h-screen place-items-center text-gray-500">Loading…</main>;
}
