import { registerPlugin } from '@capacitor/core';

export interface YtOpenOptions {
  url?: string;
  desktopUa?: boolean;
}
export interface YtStateEvent {
  state: 'idle' | 'playing' | 'paused' | 'buffering' | 'ended';
  position: number;
  duration: number;
}
export interface YtMetaEvent {
  title: string;
  artist: string;
  artwork: string;
  videoId: string;
}
export interface YtErrorEvent {
  reason: string;
}
export interface YtListenerHandle {
  remove(): Promise<void>;
}
export interface YtBgrPlugin {
  open(options?: YtOpenOptions): Promise<void>;
  close(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(options: { sec: number }): Promise<void>;
  loadUrl(options: { url: string }): Promise<void>;
  isActive(): Promise<{ active: boolean }>;
  addListener(cb: 'ytState', fn: (e: YtStateEvent) => void): Promise<YtListenerHandle>;
  addListener(cb: 'ytMeta', fn: (e: YtMetaEvent) => void): Promise<YtListenerHandle>;
  addListener(cb: 'ytError', fn: (e: YtErrorEvent) => void): Promise<YtListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export declare const YtBgr: YtBgrPlugin;
