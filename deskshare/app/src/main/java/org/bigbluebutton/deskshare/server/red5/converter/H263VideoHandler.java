/**
* BigBlueButton open source conferencing system - http://www.bigbluebutton.org/
*
* Copyright (c) 2017 BigBlueButton Inc. and by respective authors (see below).
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
package org.bigbluebutton.deskshare.server.red5.converter;

import java.util.HashMap;
import java.util.Map;

import org.red5.server.api.Red5;
import org.red5.server.api.stream.IPlayItem;
import org.red5.server.api.stream.ISubscriberStream;
import org.red5.logging.Red5LoggerFactory;
import org.slf4j.Logger;

import org.bigbluebutton.deskshare.server.red5.pubsub.MessagePublisher;

public class H263VideoHandler {

	private static Logger log = Red5LoggerFactory.getLogger(H263VideoHandler.class, "deskshare");

	public final static String H263PREFIX = "h263/";

	private final Map<String, H263Converter> h263Converters = new HashMap<String, H263Converter>();
	private final Map<String, String> h263Users = new HashMap<String, String>();

	private MessagePublisher publisher;

	public H263VideoHandler(MessagePublisher publisher) {
		log.debug("Starting H263 video handler");
		this.publisher = publisher;
	}

	private void removeH263User(String userId){
		if (h263Users.containsKey(userId)){
			log.debug("Removing user from H263 user's list [uid={}]", userId);
			h263Users.remove(userId);
		}
	}

	private void addH263User(String userId, String streamName) {
		log.debug("Adding user to H263 user's list [uid={} streamName={}]", userId, streamName);
		h263Users.put(userId, streamName);
	}

	private void clearH263UserVideo(String userId) {
		synchronized (h263Converters) {
			if (isH263UserListening(userId)) {
				String streamName = h263Users.get(userId);
				H263Converter converter = h263Converters.get(streamName);
				if (converter == null)
					log.debug("User was listening to the stream, but there's no more converter for this stream [stream={}] [uid={}]", userId, streamName);
				converter.removeListener();
				removeH263User(userId);
				log.debug("H263's user data cleared.");
			}
		}
	}

	private void clearH263Users(String streamName) {
		log.debug("Clearing H263 users's list for the stream {}", streamName);
		if (h263Users != null)
			while (h263Users.values().remove(streamName));
		log.debug("H263 users cleared");
	}

	private boolean isH263UserListening(String userId) {
		return (h263Users.containsKey(userId));
	}

	public static boolean isH263Stream(String streamName){
		return streamName.startsWith(H263PREFIX);
	}

	private void removeH263ConverterIfNeeded(String streamName){
		String h263StreamName = streamName.replaceAll(H263PREFIX, "");
		synchronized (h263Converters) {
			if (isH263Stream(streamName) && h263Converters.containsKey(h263StreamName)) {
				log.debug("H263 stream is being closed {}", streamName);
				h263Converters.remove(h263StreamName).stopConverter();
				clearH263Users(h263StreamName);
			}
		}
	}

	private String getUserId() {
		String userid = (String) Red5.getConnectionLocal().getAttribute("USERID");
		if ((userid == null) || ("".equals(userid))) userid = "unknown-userid";
		return userid;
	}

	public void streamPlayItem(ISubscriberStream stream, IPlayItem item) {
		String streamName = item.getName();
		streamName = streamName.replaceAll(H263PREFIX, "");
		log.debug("Detected H263 stream request [{}]", streamName);

		synchronized (h263Converters) {
			H263Converter converter;
			if (!h263Converters.containsKey(streamName)) {
				converter = new H263Converter(streamName, publisher);
				h263Converters.put(streamName, converter);
			} else {
				converter = h263Converters.get(streamName);
			}

			if (!isH263UserListening(getUserId())){
				converter.addListener();
				addH263User(getUserId(), streamName);
			}
		}
	}

	public void streamSubscriberClose(ISubscriberStream stream) {
		String streamName = stream.getBroadcastStreamPublishName();
		log.debug("Detected H263 stream close [{}]", streamName);

		synchronized (h263Converters) {
			if (h263Converters.containsKey(streamName)) {
				H263Converter converter = h263Converters.get(streamName);
				if (isH263UserListening(getUserId())){
					converter.removeListener();
					removeH263User(getUserId());
				}
			} else {
				log.warn("Converter not found for H263 stream [{}]. This may has been closed already", streamName);
			}
		}
	}
}
