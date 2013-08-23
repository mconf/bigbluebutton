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
import org.bigbluebutton.conference.service.messaging.MasterRedisMessagingService;
import org.bigbluebutton.conference.service.chat.ChatApplication;
import org.bigbluebutton.conference.service.participants.ParticipantsApplication;
import redis.clients.jedis.JedisPool;
import java.io.Serializable;
import java.util.Map;

public class MasterRoom implements Serializable {
	private String meetingId;
	private ParticipantsBridge masterParticipantsBridge;
	private String host;
	private int port;

	public MasterRoom(String host, int port, String meetingId) {
		this.host = host;
		this.port = port;
		this.meetingId = meetingId;
		masterParticipantsBridge = new ParticipantsBridge();
		MessagingService auxMessagingService = new MasterRedisMessagingService();
		((MasterRedisMessagingService) auxMessagingService).setRedisPool(new JedisPool(host, port));
		((MasterRedisMessagingService) auxMessagingService).setMasterMeetingId(masterMeetingId);
		masterParticipantsBridge.setMessagingService(auxMessagingService);
	}

	public Map<String,User> loadParticipantsFromMeeting() {
		return masterParticipantsBridge.loadParticipants(meetingId);
	}

	public void start() {
		masterParticipantsBridge.getMessagingService().start();
	}

	public void setParticipantsApplication(ParticipantsApplication pa){
		((MasterRedisMessagingService) (masterParticipantsBridge.getMessagingService())).setParticipantsApplication(pa);
	}
	public void setChatApplication(ChatApplication ca){
		((MasterRedisMessagingService) (masterParticipantsBridge.getMessagingService())).setChatApplication(ca);
	}

	public Map<String,User> loadParticipantsFromMeeting(String meetingId) {
		return masterParticipantsBridge.loadParticipants(meetingId);	
	}

	public MessagingService getMessagingService() {
		return masterParticipantsBridge.getMessagingService();
	}
}