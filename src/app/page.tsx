import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { getLastRefreshAt, listDrafts, listStories } from "@/lib/db";
import { isAuthenticated, passwordGateEnabled } from "@/lib/auth";
import { hasApiKey } from "@/lib/claude";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const gate = passwordGateEnabled();
  if (gate && !(await isAuthenticated())) redirect("/login");

  return (
    <Dashboard
      initialStories={listStories()}
      initialDrafts={listDrafts()}
      initialLastRefreshAt={getLastRefreshAt()}
      gateEnabled={gate}
      aiEnabled={hasApiKey()}
    />
  );
}
