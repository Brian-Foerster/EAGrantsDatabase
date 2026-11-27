// Rewrite the address bar without a navigation. Keeps the Next router's history
// state (it ignores back/forward entries without it), pointed at the new URL.
export function replaceUrl(path: string) {
  const state = window.history.state;
  window.history.replaceState(state?.__N ? { ...state, url: path, as: path } : state, '', path);
}
