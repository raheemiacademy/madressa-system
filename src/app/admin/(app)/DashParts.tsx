'use client';

import { Component, useEffect, type ReactNode } from 'react';

/** One dashboard panel's error state: the rest of the page still loads (design "Failed to load"). */
export class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="ra-failed" role="status">Failed to load</div> : this.props.children; }
}

/** Marks the dashboard as seen this session, so the tile animation only plays on the first view. */
export function SeenOnce() {
  useEffect(() => { document.cookie = 'ra_dash_seen=1; path=/admin; SameSite=Lax'; }, []);
  return null;
}
