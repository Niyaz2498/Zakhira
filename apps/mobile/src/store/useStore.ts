import { useState, useEffect } from "react";
import { getStore, subscribe, type AppStore } from "./index";

export function useStore(): AppStore {
  const [store, setStore] = useState<AppStore>(getStore());
  useEffect(() => subscribe(setStore), []);
  return store;
}
