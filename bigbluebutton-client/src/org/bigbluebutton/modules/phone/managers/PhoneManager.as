/**
* BigBlueButton open source conferencing system - http://www.bigbluebutton.org/
* 
* Copyright (c) 2012 BigBlueButton Inc. and by respective authors (see below).
*
* This program is free software; you can redistribute it and/or modify it under the
* terms of the GNU Lesser General Public License as published by the Free Software
* Foundation; either version 3.0 of the License, or (at your option) any later
* version.
* 
* BigBlueButton is distributed in the hope that it will be useful, but WITHOUT ANY
* WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
* PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
*
* You should have received a copy of the GNU Lesser General Public License along
* with BigBlueButton; if not, see <http://www.gnu.org/licenses/>.
*
*/

package org.bigbluebutton.modules.phone.managers {
	import com.asfusion.mate.events.Dispatcher;
	
	import flash.events.StatusEvent;
	import flash.external.ExternalInterface;
	import flash.media.Microphone;
	import flash.system.Security;
	import flash.system.SecurityPanel;
	
	import org.bigbluebutton.common.LogUtil;
	import org.bigbluebutton.core.BBB;
	import org.bigbluebutton.core.UsersUtil;
	import org.bigbluebutton.core.managers.UserManager;
	import org.bigbluebutton.main.events.BBBEvent;
	import org.bigbluebutton.modules.phone.PhoneOptions;
	import org.bigbluebutton.modules.phone.events.CallConnectedEvent;

	public class PhoneManager {
		private var connectionManager:ConnectionManager;
		private var streamManager:StreamManager;
		private var onCall:Boolean = false;
		private var attributes:Object;
		private var phoneOptions:PhoneOptions = new PhoneOptions();
		// If we are joining with microphone or not
		private var withMic:Boolean = false;
		// If we are auto-rejoining the conference because we got disconnected.
		private var rejoining:Boolean = false;
		// User has requested to leave the voice conference.
		private var userHangup:Boolean = false;
		private var listenOnlyCall:Boolean = false;
		private var mic:Microphone;
		private var webrtcCapable:Boolean = false;
		private var useWebrtcIfAvailable:Boolean = true;
		
		public function PhoneManager() {
			connectionManager = new ConnectionManager();
			streamManager = new StreamManager();

			webrtcCapable = initWebrtcFlag();
		}

		private function initWebrtcFlag():Boolean {
			return (ExternalInterface.available && ExternalInterface.call("isWebrtcCapable"));
		}

		public function setModuleAttributes(attributes:Object):void {
			this.attributes = attributes;

			useWebrtcIfAvailable = phoneOptions.useWebrtcIfAvailable;

			if (phoneOptions.autoJoin) {
				onClickToJoinVoiceConference();
			} else {
				if (phoneOptions.listenOnlyMode) {
					joinVoiceListenOnlyMode();
				}
			}
		}

		private function micStatusEventHandler(event:StatusEvent):void {
			switch(event.code) {
				case "Microphone.Muted":
					trace("Access to microphone has been denied.");
					joinVoice(false);
					break;
				case "Microphone.Unmuted":
					trace("Access to the microphone has been allowed.");
					joinVoice(true);
					break;
				default:
					trace("Unknown micStatusHandler event: " + event);
			}
		}
		
		private function noMicrophone():Boolean {
			return ((Microphone.getMicrophone() == null) || (Microphone.names.length == 0) 
				|| ((Microphone.names.length == 1) && (Microphone.names[0] == "Unknown Microphone")));
		}
		
		private function setupMic(useMic:Boolean):void {
			withMic = useMic;
			if (withMic)
				streamManager.initMicrophone();
			else
				streamManager.initWithNoMicrophone();
		}
		
		private function setupConnection():void {
			trace("[PhoneManager::setupConnection]");
			streamManager.setConnection(connectionManager.getConnection());
		}
		
		public function joinVoiceListenOnlyMode():void {
			trace("[PhoneManager::joinVoiceListenOnlyMode]");
			joinVoiceHelper(true);
		}
		
		public function onJoinVoiceConferenceEvent(args:Object):void {
			rejoining = false;
			hangup(true);

			if (args != null && args.hasOwnProperty('useWebrtcIfAvailable')) {
				useWebrtcIfAvailable = args.useWebrtcIfAvailable;
			}

			trace("[PhoneManager::onJoinVoiceConferenceEvent] useWebrtcIfAvailable " + useWebrtcIfAvailable);

			joinVoice(args.useMicrophone);
		}

		private function joinVoiceHelper(listenOnly:Boolean):void {
			this.listenOnlyCall = listenOnly;

			var uid:String = String(Math.floor(new Date().getTime()));
			var uname:String = encodeURIComponent(UsersUtil.getMyExternalUserID() + "-bbbID-" + attributes.username);
			connectionManager.connect(uid, attributes.internalUserID, uname , attributes.room, attributes.uri);
		}

		private function joinVoice(useMicrophone:Boolean):void {
			trace("[PhoneManager::joinVoice]");
			var dispatcher:Dispatcher = new Dispatcher();
			dispatcher.dispatchEvent(new BBBEvent(BBBEvent.LEAVE_FULL_SCREEN_MODE));

			listenOnlyCall = false;
			if (webrtcCapable && useWebrtcIfAvailable) {
				var s:String = ExternalInterface.call("joinWebRTCVoiceConference()");
				trace("joinWebRTCVoiceConference: " + s);
			} else {
				setupMic(useMicrophone);
				joinVoiceHelper(listenOnlyCall);
			}

			dispatcher.dispatchEvent(new BBBEvent(BBBEvent.JOIN_VOICE_FOCUS_HEAD));
		}
		
		public function rejoin():void {
			trace("[PhoneManager::rejoin] rejoining " + rejoining);
			trace("[PhoneManager::rejoin] userHangup " + userHangup);
			if (!rejoining && !userHangup) {
				// We got disconnected and it's not because the user requested it. Let's rejoin the conference.
				LogUtil.debug("Rejoining the conference");
				rejoining = true;
				if (listenOnlyCall) {
					joinVoiceListenOnlyMode();
				} else {
					joinVoice(withMic);
				}
			}
		}
				
		public function dialConference():void {
			if (listenOnlyCall) {
				trace("*** Only Listening ***");
			} else {
				trace("*** Talking/Listening ***");
			}
			connectionManager.doCall(attributes.webvoiceconf, listenOnlyCall);
		}
		
		public function callConnected(event:CallConnectedEvent):void {
			trace("[PhoneManager::callConnected]");
			if (webrtcCapable && useWebrtcIfAvailable && !listenOnlyCall) {

			} else {
				setupConnection();
				streamManager.callConnected(event.playStreamName, event.publishStreamName, event.codec);
			}
			onCall = true;
			// We have joined the conference. Reset so that if and when we get disconnected, we
			// can rejoin automatically.
			rejoining = false;
			userHangup = false;
			var dispatcher:Dispatcher = new Dispatcher();
			if (listenOnlyCall) {
				dispatcher.dispatchEvent(new BBBEvent("LISTENING_ONLY"));
			} else {
				dispatcher.dispatchEvent(new BBBEvent("SPEAKING_AND_LISTENING"));
			}
		}
		
		public function userRequestedHangup():void {
			trace("User has requested to hangup and leave the conference");
			rejoining = false;
			hangup(true);
		}

		public function muteAudio():void {
			trace("User has requested to mute audio");
			streamManager.muteAudio();
		}
		
		public function unmuteAudio():void {
			trace("User has requested to unmute audio");
			streamManager.unmuteAudio();
		}
		
		public function saveAudio():void {
			streamManager.saveAudio();
		}
		
		public function restoreAudio():void {
			streamManager.restoreAudio();
		}
		
		public function hangup(onUserRequest:Boolean):void {
			trace("[PhoneManager::hangup] onUserRequest " + onUserRequest);
			trace("[PhoneManager::hangup] onCall " + onCall);
			trace("[PhoneManager::hangup] listenOnlyCall " + listenOnlyCall);
			trace("[PhoneManager::hangup] webrtcCapable " + webrtcCapable);
			trace("[PhoneManager::hangup] useWebrtcIfAvailable " + useWebrtcIfAvailable);

			if (onCall) {
				userHangup = onUserRequest;
				onCall = false;
				if (webrtcCapable && useWebrtcIfAvailable && !listenOnlyCall) {
					var s:String = ExternalInterface.call("leaveWebRTCVoiceConference()");
					trace("leaveWebRTCVoiceConference: " + s);
				} else {
					streamManager.stopStreams();
					connectionManager.doHangUp();
					if (!phoneOptions.listenOnlyMode) {
						var event:BBBEvent = new BBBEvent("ENABLE_JOIN_BUTTON");
						event.payload['leaveVoiceConference'] = true;
						var dispatcher:Dispatcher = new Dispatcher();
						dispatcher.dispatchEvent(event);
					}
				}

				if (phoneOptions.listenOnlyMode && !listenOnlyCall) {
					trace("Hung from normal call, starting listen only mode call");
					joinVoiceListenOnlyMode();
				}
			}
		}

		public function onClickToJoinVoiceConference(args:Object = null):void {
			trace("[PhoneManager::onClickToJoinVoiceConference]");

			var forceSkipCheck:Boolean = (args != null && args.hasOwnProperty('forceSkipCheck')? args['forceSkipCheck']: false);
			webrtcCapable = (args != null && args.hasOwnProperty('webrtcCapable')? args['webrtcCapable']: webrtcCapable);

			if (phoneOptions.skipCheck || noMicrophone() || forceSkipCheck) {
				if (webrtcCapable && phoneOptions.useWebrtcIfAvailable) {
					joinVoice(true);
				} else {
					mic = Microphone.getMicrophone();
					
					/*
					 * If the user had no mic, let her join but she'll just be listening.	
					 * We should indicate a warning that the user is joining without mic
					 * so that he will know that others won't be able to hear him.
					*/
					if (mic == null) {
						joinVoice(false);
					} else if (mic.muted) {
						// user has disallowed access to the mic
						Security.showSettings(SecurityPanel.PRIVACY);
						mic.addEventListener(StatusEvent.STATUS, micStatusEventHandler);
					} else {
						// user has allowed access to the mic already
						joinVoice(true);
					}
				}
			} else {
				var dispatcher:Dispatcher = new Dispatcher();

				var showMicSettings:BBBEvent = new BBBEvent("SHOW_MIC_SETTINGS");
				showMicSettings.payload['webrtcCapable'] = webrtcCapable;
				showMicSettings.payload['useWebrtcIfAvailable'] = phoneOptions.useWebrtcIfAvailable;
				showMicSettings.payload['listenOnlyMode'] = phoneOptions.listenOnlyMode;
				dispatcher.dispatchEvent(showMicSettings);
			}
		}

		public function onClickToLeaveVoiceConference():void {
			userRequestedHangup();
		}
	}
}
