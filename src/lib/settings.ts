import { Store } from "@tauri-apps/plugin-store";

const STORE_PATH = "settings.json";
let _store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await Store.load(STORE_PATH);
  }
  return _store;
}

export async function getYouTubeApiKey(): Promise<string> {
  const store = await getStore();
  return (await store.get<string>("youtube_api_key")) ?? "";
}

export async function setYouTubeApiKey(key: string): Promise<void> {
  const store = await getStore();
  await store.set("youtube_api_key", key);
  await store.save();
}

export async function getGcpTtsCredentials(): Promise<string> {
  const store = await getStore();
  return (await store.get<string>("gcp_tts_credentials")) ?? "";
}

export async function setGcpTtsCredentials(creds: string): Promise<void> {
  const store = await getStore();
  await store.set("gcp_tts_credentials", creds);
  await store.save();
}
