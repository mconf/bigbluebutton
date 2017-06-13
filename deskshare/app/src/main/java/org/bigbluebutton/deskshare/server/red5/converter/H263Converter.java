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

import org.bigbluebutton.deskshare.server.red5.pubsub.MessagePublisher;
import org.red5.logging.Red5LoggerFactory;
import org.red5.server.api.IConnection;
import org.red5.server.api.Red5;
import org.slf4j.Logger;

public class H263Converter {

	private static Logger log = Red5LoggerFactory.getLogger(H263Converter.class, "deskshare");

	private String origin;
	private Integer numListeners = 0;

	private MessagePublisher publisher;
	private Boolean publishing;
	private String ipAddress;
	private String meetingId;

	public H263Converter(String origin, MessagePublisher publisher) {
		log.info("Spawn FFmpeg to convert H264 to H263 for stream [{}]", origin);
		this.origin = origin;
		this.publisher = publisher;
		this.publishing = false;

		IConnection conn = Red5.getConnectionLocal();
		this.ipAddress = conn.getHost();
		this.meetingId = conn.getScope().getName();
	}

	private void startConverter() {
		if (!publishing) {
			publisher.startH264ToH263TranscoderRequest(meetingId, ipAddress);
			publishing = true;
		} else log.debug("No need to start transcoder, it is already running");
	}

	public synchronized void addListener() {
		this.numListeners++;
		log.debug("Adding listener to [{}] ; [{}] current listeners ", origin, this.numListeners);

		if(this.numListeners.equals(1)) {
			log.debug("First listener just joined, must start H263Converter for [{}]", origin);
			startConverter();
		}
	}

	public synchronized void removeListener() {
		this.numListeners--;
		log.debug("Removing listener from [{}] ; [{}] current listeners ", origin, this.numListeners);

		if(this.numListeners <= 0) {
			log.debug("No more listeners, may close H263Converter for [{}]", origin);
			this.stopConverter();
		}
	}

	public synchronized void stopConverter() {
		if (publishing) {
			this.numListeners = 0;
			publisher.stopTranscoderRequest(meetingId);
			publishing = false;
			log.debug("Transcoder force-stopped");
		} else log.debug("No need to stop transcoder, it already stopped");
	}
}
