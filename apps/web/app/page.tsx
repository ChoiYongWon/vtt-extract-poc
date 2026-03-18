import { Dashboard } from "../components/dashboard";
import { getFolderContents } from "../lib/data";
import { getMissingRuntimeEnv, getRuntimeMode } from "../lib/env";

export default async function HomePage() {
  const rootData = await getFolderContents("videos/");

  return (
    <Dashboard
      missingRuntimeEnv={getMissingRuntimeEnv()}
      mode={getRuntimeMode()}
      rootData={rootData}
    />
  );
}
