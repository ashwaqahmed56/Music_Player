export interface MediaAudioTrack {
  mid: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  name: string;
  folder: string;
  uri: string;
}
export interface MediaLibraryPlugin {
  listAudio(options?: { limit?: number }): Promise<{ tracks: MediaAudioTrack[] }>;
}
export declare const MediaLibrary: MediaLibraryPlugin;
