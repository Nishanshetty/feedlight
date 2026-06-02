import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

type RefreshPayload = {
  new_items: number;
  feeds_checked: number;
};

export function useFeedRefresh(onRefresh: (payload: RefreshPayload) => void): void {
  useEffect(() => {
    const unlisten = listen<RefreshPayload>("focal://feeds-refreshed", (event) => {
      onRefresh(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [onRefresh]);
}
