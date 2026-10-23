package com.ingageco.capacitormusiccontrols;


import android.util.Log;
import android.content.Context;
import android.app.Activity;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;

import android.media.session.MediaSession.Token;

import android.app.NotificationChannel;
import android.widget.RemoteViews;

public class MusicControlsNotification {
	private static final String TAG = "CMCNotification";
	// Neon cyan — matches the in-app accent glow
	private static final int ACCENT = 0xFF22E6FF;

	private Activity cordovaActivity;
	private NotificationManager notificationManager;
	private Notification.Builder notificationBuilder;
	private int notificationID;
	protected MusicControlsInfos infos;
	private Bitmap bitmapCover;
	private String CHANNEL_ID;
	private Token token;
	private long elapsedMs = 0;
	private long durationMs = 0;


	// Public Constructor
	public MusicControlsNotification(Activity cordovaActivity, int id, Token token){


		this.CHANNEL_ID ="capacitor-music-channel-id";
		this.notificationID = id;
		this.cordovaActivity = cordovaActivity;
		this.token = token;
		Context context = cordovaActivity.getApplicationContext();
		this.notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

		// use channelid for Oreo and higher
		if (Build.VERSION.SDK_INT >= 26) {
			// The user-visible name of the channel.
			CharSequence name = "Audio Controls";
			// The user-visible description of the channel.
			String description = "Control Playing Audio";

			int importance = NotificationManager.IMPORTANCE_LOW;

			NotificationChannel mChannel = new NotificationChannel(this.CHANNEL_ID, name,importance);

			// Configure the notification channel.
			mChannel.setDescription(description);

			this.notificationManager.createNotificationChannel(mChannel);
    }

	}

	// Show or update notification
	public void updateNotification(MusicControlsInfos newInfos){

		Log.i(TAG, "updateNotification: infos: " + newInfos.toString());
		// Check if the cover has changed
		if (newInfos.cover != null && !newInfos.cover.isEmpty() && (this.infos == null || !newInfos.cover.equals(this.infos.cover))){
			this.getBitmapCover(newInfos.cover);
		}
		this.infos = newInfos;
		this.elapsedMs = newInfos.elapsed;
		this.durationMs = newInfos.duration;
		this.createBuilder();
		this.createNotification();
	}

	private void createNotification() {
		final Notification noti = this.notificationBuilder.build();
		this.notificationManager.notify(this.notificationID, noti);
		this.onNotificationUpdated(noti);
	}

	// Toggle the play/pause button
	public void updateIsPlaying(boolean isPlaying) {

		Log.i(TAG, "updateIsPlaying: isPlaying: " + isPlaying);

		Log.i(TAG, "updateIsPlaying: pre:this.infos.isPlaying: " + this.infos.isPlaying);

		this.infos.isPlaying=isPlaying;

		Log.i(TAG, "updateIsPlaying: post:this.infos.isPlaying: " + this.infos.isPlaying);

		this.createBuilder();
		this.createNotification();
	}

	// Toggle the dismissable status
	public void updateDismissable(boolean dismissable) {
		this.infos.dismissable=dismissable;
		this.createBuilder();
		this.createNotification();
	}

	// Live position sync — keeps the cartoon card's progress bar
	// in step with playback (called about once a second).
	public void updateElapsed(boolean isPlaying, long elapsed, long duration) {
		this.infos.isPlaying = isPlaying;
		this.elapsedMs = elapsed;
		this.durationMs = duration;
		this.createBuilder();
		this.createNotification();
	}

	// Get image from url (shared loader: one download per cover URL)
	private void getBitmapCover(String coverURL){
		try{
			this.bitmapCover = CoverCache.load(cordovaActivity.getApplicationContext(), coverURL);
		} catch (Exception ex) {
			ex.printStackTrace();
		}
	}

	private void createBuilder(){
		Context context = cordovaActivity.getApplicationContext();
		Notification.Builder builder = new Notification.Builder(context);

		// use channelid for Oreo and higher
		if (Build.VERSION.SDK_INT >= 26) {
			builder.setChannelId(this.CHANNEL_ID);
		}

		//Configure builder
		builder.setContentTitle(this.infos.track);
		if (this.infos.artist != null){
			builder.setContentText(this.infos.artist);
		}
		
		builder.setWhen(0);
		builder.setOnlyAlertOnce(true);
		// Neon accent — tints action icons, ticker and progress
		builder.setColor(ACCENT);

		// set if the notification can be destroyed by swiping
		if (this.infos.dismissable){
			builder.setOngoing(false);
			Intent dismissIntent = new Intent("music-controls-destroy");
			PendingIntent dismissPendingIntent = PendingIntent.getBroadcast(context, 1, dismissIntent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
			builder.setDeleteIntent(dismissPendingIntent);
		} else {
			builder.setOngoing(true);
		}

		if (this.infos.ticker != null && !this.infos.ticker.isEmpty()){
			builder.setTicker(this.infos.ticker);
		}
		
		builder.setPriority(Notification.PRIORITY_MAX);

		builder.setVisibility(Notification.VISIBILITY_PUBLIC);

		//Set SmallIcon
		boolean usePlayingIcon = this.infos.notificationIcon == null || this.infos.notificationIcon.isEmpty();
		if(!usePlayingIcon){
			int resId = this.getResourceId(this.infos.notificationIcon, 0);
			usePlayingIcon = resId == 0;
			if(!usePlayingIcon) {
				builder.setSmallIcon(resId);
			}
		}

		if(usePlayingIcon){
			if (this.infos.isPlaying){
				builder.setSmallIcon(this.getResourceId(this.infos.playIcon, android.R.drawable.ic_media_play));
			} else {
				builder.setSmallIcon(this.getResourceId(this.infos.pauseIcon, android.R.drawable.ic_media_pause));
			}
		}

		// Set LargeIcon (always: fallback keeps layout stable)
		if (this.bitmapCover != null && this.infos.cover != null && !this.infos.cover.isEmpty()){
			builder.setLargeIcon(this.bitmapCover);
		} else {
			try {
				android.graphics.Bitmap appIcon = android.graphics.BitmapFactory.decodeResource(context.getResources(), context.getApplicationInfo().icon);
				if (appIcon != null) builder.setLargeIcon(appIcon);
			} catch (Exception ignored) {}
		}

		// Open app if tapped
		Intent resultIntent = new Intent(context, cordovaActivity.getClass());
		resultIntent.setAction(Intent.ACTION_MAIN);
		resultIntent.addCategory(Intent.CATEGORY_LAUNCHER);
		PendingIntent resultPendingIntent = PendingIntent.getActivity(context, 0, resultIntent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
		builder.setContentIntent(resultPendingIntent);

		// Controls
		int nbControls=0;
		/* Previous  */
		if (this.infos.hasPrev){
			Log.i(TAG, "controls hasPrev");
			nbControls++;
			Intent previousIntent = new Intent("music-controls-previous");
			PendingIntent previousPendingIntent = PendingIntent.getBroadcast(context, 1, previousIntent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
			builder.addAction(this.getResourceId(this.infos.prevIcon, android.R.drawable.ic_media_previous), "", previousPendingIntent);
		}
		if (this.infos.isPlaying){
			/* Pause  */
			nbControls++;
			Intent pauseIntent = new Intent("music-controls-pause");
			PendingIntent pausePendingIntent = PendingIntent.getBroadcast(context, 1, pauseIntent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
			builder.addAction(this.getResourceId(this.infos.pauseIcon, android.R.drawable.ic_media_pause), "", pausePendingIntent);
		} else {
			/* Play  */
			nbControls++;
			Intent playIntent = new Intent("music-controls-play");
			PendingIntent playPendingIntent = PendingIntent.getBroadcast(context, 1, playIntent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
			builder.addAction(this.getResourceId(this.infos.playIcon, android.R.drawable.ic_media_play), "", playPendingIntent);
		}
		/* Next */
		if (this.infos.hasNext){
			Log.i(TAG, "controls hasNext");
			nbControls++;
			Intent nextIntent = new Intent("music-controls-next");
			PendingIntent nextPendingIntent = PendingIntent.getBroadcast(context, 1, nextIntent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
			builder.addAction(this.getResourceId(this.infos.nextIcon, android.R.drawable.ic_media_next), "", nextPendingIntent);
		}
		/* Close */
		if (this.infos.hasClose){
			Log.i(TAG, "controls hasClose");
			nbControls++;
			Intent destroyIntent = new Intent("music-controls-destroy");
			PendingIntent destroyPendingIntent = PendingIntent.getBroadcast(context, 1, destroyIntent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
			builder.addAction(this.getResourceId(this.infos.closeIcon, android.R.drawable.ic_menu_close_clear_cancel), "", destroyPendingIntent);
		}

		// Toon-neon card: rounded gradient body, neon-framed art tile,
		// glowing cyan→violet progress bar.
		if (Build.VERSION.SDK_INT >= 24) {
			try {
				RemoteViews card = this.buildContentView(context);
				if (card != null) {
					builder.setCustomContentView(card);
					builder.setCustomBigContentView(card);
				}
			} catch (Exception ex) {
				ex.printStackTrace();
			}
		}

		int[] args = new int[nbControls];
		for (int i = 0; i < nbControls; ++i) {
			args[i] = i;
		}
		if (Build.VERSION.SDK_INT >= 24) {
			builder.setStyle(new Notification.DecoratedMediaCustomViewStyle().setShowActionsInCompactView(args).setMediaSession(this.token));
		} else {
			builder.setStyle(new Notification.MediaStyle().setShowActionsInCompactView(args).setMediaSession(this.token));
		}

		this.notificationBuilder = builder;
	}

	private RemoteViews buildContentView(Context context){
		// Resolved by name (same as the icon lookup) so the library R
		// namespace never has to be hard-coded.
		int layoutId = context.getResources().getIdentifier("ashs_notif", "layout", context.getPackageName());
		if (layoutId == 0) return null;
		RemoteViews view = new RemoteViews(context.getPackageName(), layoutId);
		int titleId = context.getResources().getIdentifier("ashs_notif_title", "id", context.getPackageName());
		int artistId = context.getResources().getIdentifier("ashs_notif_artist", "id", context.getPackageName());
		int artId = context.getResources().getIdentifier("ashs_notif_art", "id", context.getPackageName());
		int progId = context.getResources().getIdentifier("ashs_notif_progress", "id", context.getPackageName());
		if (titleId != 0) view.setTextViewText(titleId, this.infos.track == null ? "" : this.infos.track);
		if (artistId != 0) view.setTextViewText(artistId, this.infos.artist == null ? "" : this.infos.artist);
		if (artId != 0 && this.bitmapCover != null) {
			try { view.setImageViewBitmap(artId, this.bitmapCover); } catch (Exception ex) { ex.printStackTrace(); }
		}
		if (progId != 0) {
			// 0 duration (live radio) → indeterminate spinner bar
			boolean indeterminate = this.durationMs <= 0;
			int progress = 0;
			if (!indeterminate) {
				progress = (int) Math.min(1000L, Math.max(0L, (this.elapsedMs * 1000L) / this.durationMs));
			}
			view.setProgressBar(progId, 1000, progress, indeterminate);
		}
		return view;
	}

	private int getResourceId(String name, int fallback){
		try{
			if(name.isEmpty()){
				return fallback;
			}

			int resId = this.cordovaActivity.getResources().getIdentifier(name, "drawable", this.cordovaActivity.getPackageName());
			return resId == 0 ? fallback : resId;
		}
		catch(Exception ex){
			return fallback;
		}
	}

	public void destroy(){
		Log.i(TAG, "Destroying notification");
		this.notificationManager.cancel(this.notificationID);
		this.onNotificationDestroyed();
		Log.i(TAG, "Notification destroyed");
	}

		protected void onNotificationUpdated(Notification notification) {}
		protected void onNotificationDestroyed() {}
}
