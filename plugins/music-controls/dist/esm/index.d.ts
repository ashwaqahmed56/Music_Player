export interface MusicControlsOptions {
  track?: string;
  artist?: string;
  album?: string;
  cover?: string;
  ticker?: string;
  isPlaying?: boolean;
  dismissable?: boolean;
  hasPrev?: boolean;
  hasNext?: boolean;
  hasClose?: boolean;
  duration?: number;
  elapsed?: number;
  notificationIcon?: string;
  playIcon?: string;
  pauseIcon?: string;
  prevIcon?: string;
  nextIcon?: string;
  closeIcon?: string;
}
export interface CapacitorMusicControlsPlugin {
  create(options: MusicControlsOptions): Promise<void>;
  updateIsPlaying(options: { isPlaying: boolean }): Promise<void>;
  updateElapsed(options: { isPlaying: boolean; elapsed?: number; duration?: number }): Promise<void>;
  updateDismissable(options: { dismissable: boolean }): Promise<void>;
  destroy(): Promise<void>;
}
export declare const CapacitorMusicControls: CapacitorMusicControlsPlugin;
