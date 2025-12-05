import { HttpAgent } from "@dfinity/agent";
import { fetch } from "undici";

import { initIdentity } from "./identity.utils.mjs";

export async function getICHttpAgent() {
  const identity = initIdentity();
  const agent = HttpAgent.createSync({
    identity,
    fetch,
    host: "https://ic0.app",
  });

  return agent;
}

export async function getLocalHttpAgent() {
  const identity = initIdentity();
  const agent = HttpAgent.createSync({
    identity,
    fetch,
    host: "http://127.0.0.1:4943/",
  });
  await agent.fetchRootKey();

  return agent;
}
