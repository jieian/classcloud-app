import { getServerUser } from "@/lib/supabase/server";
import {
  getAdvisorySectionId,
  getHomeActiveContextCached,
} from "@/lib/services/homeServerService";
import HomeClient from "./_components/HomeClient";

export default async function Home() {
  const [activeContext, user] = await Promise.all([
    getHomeActiveContextCached(),
    getServerUser(),
  ]);

  const advisorySectionId =
    user && activeContext.syId
      ? await getAdvisorySectionId(user.id, activeContext.syId)
      : null;

  return (
    <HomeClient
      initialActiveContext={{ ...activeContext, advisorySectionId }}
    />
  );
}
