"use client";

import { useSyncExternalStore } from "react";

/** A tiny module-level store. It lives as long as the browser tab, so a
 * module's campaign/results survive switching to another module and back
 * (the role Streamlit's session_state played). Each module creates its own
 * store, keeping their state disjoint. */
export function createStore<S extends object>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const set = (patch: Partial<S> | ((s: S) => Partial<S>)) => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    listeners.forEach((l) => l());
  };
  const get = () => state;
  const getInitial = () => initial;

  function useStore(): [S, typeof set] {
    return [useSyncExternalStore(subscribe, get, getInitial), set];
  }
  return { useStore, set, get };
}
