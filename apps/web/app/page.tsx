import { Dashboard } from "../components/dashboard";
import { getVideos } from "../lib/data";
import { getMissingRuntimeEnv, getRuntimeMode } from "../lib/env";
import { sampleSegments } from "../lib/mock-data";

export default async function HomePage() {
  const videos = await getVideos();

  return (
    <Dashboard
      missingRuntimeEnv={getMissingRuntimeEnv()}
      mode={getRuntimeMode()}
      segments={sampleSegments}
      videos={videos}
    />
  );
}
