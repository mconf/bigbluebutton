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

package org.bigbluebutton.conference;

import org.bigbluebutton.conference.service.participants.ParticipantsBridge;
import org.bigbluebutton.conference.service.messaging.MessagingService;
import org.bigbluebutton.conference.service.messaging.SlaveRedisMessagingService;
import org.bigbluebutton.conference.service.chat.ChatApplication;
import org.bigbluebutton.conference.service.participants.ParticipantsApplication;
import redis.clients.jedis.JedisPool;
import java.io.Serializable;
import java.util.Map;

public class SlaveRoom implements Serializable {
	private String meetingId;
	private ParticipantsBridge slaveParticipantsBridge;
	private String host;
	private int port;

	public SlaveRoom(String host, int port, String meetingId, String masterMeetingId) {
		this.host = host;
		this.port = port;
		this.meetingId = meetingId;
		slaveParticipantsBridge = new ParticipantsBridge();
		MessagingService auxMessagingService = new SlaveRedisMessagingService();
		((SlaveRedisMessagingService) auxMessagingService).setRedisPool(new JedisPool(host, port));
		((SlaveRedisMessagingService) auxMessagingService).setMasterMeetingId(masterMeetingId);
		slaveParticipantsBridge.setMessagingService(auxMessagingService);
	}

	public Map<String,User> loadParticipantsFromMeeting() {
		return slaveParticipantsBridge.loadParticipants(meetingId);
	}

	public void start() {
		slaveParticipantsBridge.getMessagingService().start();
	}

	public void setParticipantsApplication(ParticipantsApplication pa){
		((SlaveRedisMessagingService) (slaveParticipantsBridge.getMessagingService())).setParticipantsApplication(pa);
	}
	public void setChatApplication(ChatApplication ca){
		((SlaveRedisMessagingService) (slaveParticipantsBridge.getMessagingService())).setChatApplication(ca);
	}

	public Map<String,User> loadParticipantsFromMeeting(String meetingId) {
		return slaveParticipantsBridge.loadParticipants(meetingId);	
	}

	public MessagingService getMessagingService() {
		return slaveParticipantsBridge.getMessagingService();
	}
}