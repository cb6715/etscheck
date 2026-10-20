// Netlify Scheduled Function — runs on a timer, independent of whether
// anyone has the app open anywhere, so a live hour/kr-milestone or
// overtime crossing can reach the lock screen the moment it happens
// instead of only being noticed the next time someone opens the app.
// Same pattern as the sibling app's own push-tick.mts.
import { runLiveMilestoneTick } from "../../src/lib/live-push-tick";

async function handler() {
  const result = await runLiveMilestoneTick();
  console.log("[push-tick]", JSON.stringify(result));
}

export default handler;

export const config = { schedule: "* * * * *" };
