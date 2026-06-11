import { Suspense } from "react";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import {
  getAdvisorySectionId,
  getHomeActiveContextCached,
} from "@/lib/services/homeServerService";
import HomeClient from "./_components/HomeClient";
import HomeSkeleton from "./_components/HomeSkeleton";

// The page component itself is synchronous, so client-side navigation to Home
// commits immediately and shows HomeSkeleton while HomeData streams in — instead
// of freezing on the previous page until the server work finishes.
export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeData />
    </Suspense>
  );
}

async function HomeData() {
  const [activeContext, user] = await Promise.all([
    getHomeActiveContextCached(),
    getServerUser(),
  ]);

  // advisorySectionId only feeds the adviser-only "My Advisory Class" quick
  // action, so skip the extra round-trip for everyone who isn't a class adviser.
  const isAdviser =
    !!user && getPermissionsFromUser(user).includes("students.limited_access");
  const advisorySectionId =
    isAdviser && user && activeContext.syId
      ? await getAdvisorySectionId(user.id, activeContext.syId)
      : null;

  return (
    <HomeClient
      initialActiveContext={{ ...activeContext, advisorySectionId }}
    />
  );
}
