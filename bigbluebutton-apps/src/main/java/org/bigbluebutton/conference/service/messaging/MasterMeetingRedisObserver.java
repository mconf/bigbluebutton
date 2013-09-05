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
package org.bigbluebutton.conference.service.messaging;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import org.bigbluebutton.conference.User;
import org.bigbluebutton.conference.service.chat.ChatApplication;
import org.bigbluebutton.conference.service.chat.ChatMessageVO;
import org.bigbluebutton.conference.service.participants.ParticipantsApplication;
import org.bigbluebutton.conference.service.presentation.PresentationApplication;
import org.red5.logging.Red5LoggerFactory;
import org.red5.server.api.Red5;
import org.red5.server.api.scope.IScope;
import org.slf4j.Logger;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPubSub;
import redis.clients.jedis.JedisMonitor;



public class MasterMeetingRedisObserver implements MessagingService {
	private static Logger log = Red5LoggerFactory.getLogger( MasterMeetingRedisObserver.class, "bigbluebutton" );

	private JedisPool masterRedisPool;
	private JedisPool myRedisPool;
	private final Executor exec = Executors.newSingleThreadExecutor();
	private Runnable pubsubListener;
	
	private final Set<MessageListener> listeners = new HashSet<MessageListener>();
	
	private String masterMeetingID = "";
	private String myMeetingID = "";
	

	public MasterMeetingRedisObserver(String masterMeetingID, String myMeetingID, JedisPool masterRedisPool, JedisPool myRedisPool){
		setMasterMeetingId(masterMeetingID);		
		setMyMeetingID(myMeetingID);
		setMyRedisPool(myRedisPool);
		setMasterRedisPool(masterRedisPool);
	}

	public MasterMeetingRedisObserver() {
	
	}

	public void setMasterMeetingId(String masterMeetingId) {
		this.masterMeetingID = masterMeetingId;
	}

	public void setMyMeetingID(String myMeetingID) {
		this.myMeetingID = myMeetingID;
	}

	@Override
	public void start() {
		log.debug("Starting redis pubsub...");		
		final Jedis jedis = masterRedisPool.getResource();
		try {
			pubsubListener = new Runnable() {
				public void run() {
					sendMasterParticipantsToMyRedis();
					//jedis.psubscribe(new PubSubListener(), MessagingConstants.BIGBLUEBUTTON_PATTERN);
					jedis.psubscribe(new PubSubListener(), "*");
				}
			};
			exec.execute(pubsubListener);
		} catch (Exception e) {
			log.error("Error subscribing to channels: " + e.getMessage());
		}
	}

	@Override
	public void stop() {
		try {
			masterRedisPool.destroy();
			myRedisPool.destroy();
		} catch (Exception e) {
			e.printStackTrace();
		}
	}

	@Override
	public void send(String channel, String message) {
		Jedis jedis = myRedisPool.getResource();
		try {
			jedis.publish(channel, message);
		} catch(Exception e){
			log.warn("Cannot publish the message to redis", e);
		}finally{
			masterRedisPool.returnResource(jedis);
		}
	}

	@Override
	public void addListener(MessageListener listener) {
		listeners.add(listener);
	}

	
	public void removeListener(MessageListener listener) {
		listeners.remove(listener);
	}
	
	public void setMasterRedisPool(JedisPool redisPool){
		this.masterRedisPool=redisPool;
	}
	
	public void setMyRedisPool(JedisPool redisPool) {
		this.myRedisPool=redisPool;
	}

	public Jedis createRedisClient(){
		return myRedisPool.getResource();
	}
	public void dropRedisClient(Jedis jedis){
		myRedisPool.returnResource(jedis);
	}
	
	private void storeParticipantToMyRedis(String userid, String username, String role, String originalMeetingID) {
		Jedis jedis = this.createRedisClient();
		jedis.sadd("meeting-"+myMeetingID+"-users", userid);
		//"username", username,		"meetingID", meetingID, "refreshing", false, "dupSess", false, "sockets", 0, 'pubID', publicID
		HashMap<String,String> temp_user = new HashMap<String, String>();
		temp_user.put("username", username);
		temp_user.put("meetingID", myMeetingID);
		temp_user.put("refreshing", "false");
		temp_user.put("dupSess", "false");
		temp_user.put("sockets", "0");
		temp_user.put("pubID", userid);
		temp_user.put("role", role);
		temp_user.put("originalMeetingID", originalMeetingID);
		
		jedis.hmset("meeting-"+myMeetingID+"-user-"+userid, temp_user);
		
		/* Storing status properties */
		HashMap<String,String> status = new HashMap<String, String>();
		status.put("raiseHand", "false");
		status.put("presenter", "false");
		status.put("hasStream", "false");
		
		jedis.hmset("meeting-"+myMeetingID+"-user-"+userid +"-status", status);
		
		this.dropRedisClient(jedis);
	}

	private void sendParticipantJoinToMyRedis(String userid, String username, String role, String originalMeetingID) {
		ArrayList<Object> updates = new ArrayList<Object>();
		updates.add(myMeetingID);
		updates.add("user join");
		updates.add(userid);
		updates.add(username);
		updates.add(role);
		updates.add(originalMeetingID);
		Gson gson = new Gson();
		this.send(MessagingConstants.BIGBLUEBUTTON_BRIDGE, gson.toJson(updates));
	}

	private void sendParticipantLeaveToMyRedis(String userid, String originalMeetingID) {
		ArrayList<Object> updates = new ArrayList<Object>();
		updates.add(myMeetingID);
		updates.add("user leave");
		updates.add(userid);
		updates.add(originalMeetingID);
		Gson gson = new Gson();
		this.send(MessagingConstants.BIGBLUEBUTTON_BRIDGE, gson.toJson(updates));
	}

	private void removeParticipantFromMyRedis(String internalUserID) {
		Jedis jedis = this.createRedisClient();
		jedis.srem("meeting-"+myMeetingID+"-users", internalUserID);
		jedis.del("meeting-"+myMeetingID+"-user-"+internalUserID);
		this.dropRedisClient(jedis);
	}

	private void sendStoreAssignPresenterToMyRedis(String userid, String previousPresenter) {
		Jedis jedis = this.createRedisClient();
		jedis.hset("meeting-"+myMeetingID+"-user-"+userid+"-status", "presenter", "true");
		if(previousPresenter != null)
			jedis.hset("meeting-"+myMeetingID+"-user-"+previousPresenter+"-status", "presenter", "false");
		
		HashMap<String,String> params = new HashMap<String, String>();
		params.put("sessionID", "0");
		params.put("publicID",userid);
		jedis.hmset("meeting-"+myMeetingID+"-presenter",params);
		
		this.dropRedisClient(jedis);
	}

	private void sendAssignPresenterToMyRedis(String userid, String originalMeetingID) {
		ArrayList<Object> updates = new ArrayList<Object>();
		updates.add(myMeetingID);
		updates.add("setPresenter");
		updates.add(userid);
		updates.add(originalMeetingID);
		Gson gson = new Gson();
		this.send(MessagingConstants.BIGBLUEBUTTON_BRIDGE, gson.toJson(updates));
	}

	private void sendMasterParticipantsToMyRedis() {
		Jedis jedis = masterRedisPool.getResource();
		Set<String> userids = jedis.smembers("meeting-"+masterMeetingID+"-users");
		
		for(String userid:userids){
			Map<String,String> users = jedis.hgetAll("meeting-"+masterMeetingID+"-user-"+userid);
			
			String internalUserID = users.get("pubID");
			String externalUserID = UUID.randomUUID().toString();
			String originalMeetingID = (users.containsKey("originalMeetingID") ? users.get("originalMeetingID") : "");
			Map<String,String> status_from_db = jedis.hgetAll("meeting-"+masterMeetingID+"-user-"+userid+"-status");
			
			//Map<String, Object> status = new HashMap<String, Object>();
			//status.put("raiseHand", Boolean.parseBoolean(status_from_db.get("raiseHand")));
			//status.put("presenter", Boolean.parseBoolean(status_from_db.get("presenter")));
			//status.put("hasStream", Boolean.parseBoolean(status_from_db.get("hasStream")));
			
			//User p = new User(internalUserID, users.get("username"), users.get("role"), externalUserID, status);
			//map.put(internalUserID, p);
			if(originalMeetingID.equals("") || !originalMeetingID.equals(myMeetingID)) {
				if(originalMeetingID.equals("")) 
					originalMeetingID = masterMeetingID;
				
				storeParticipantToMyRedis(internalUserID, users.get("username"), users.get("role"), originalMeetingID);
				sendParticipantJoinToMyRedis(internalUserID, users.get("username"), users.get("role"), originalMeetingID);
			}
		}
		
		masterRedisPool.returnResource(jedis);
	}


	private void sendMsg(ChatMessageVO chat, String originalMeetingID){
		ArrayList<Object> updates = new ArrayList<Object>();
		updates.add(myMeetingID);
		updates.add("msg");
		updates.add(chat.chatType);
		updates.add(chat.fromUserID);
		updates.add(chat.fromUsername);
		updates.add(chat.fromColor);
		updates.add(chat.fromTime);
		updates.add(chat.fromTimezoneOffset);
		updates.add(chat.fromLang);
		updates.add(chat.toUserID);
		updates.add(chat.toUsername);
		updates.add(chat.message);
		updates.add(originalMeetingID);
		Gson gson = new Gson();
		this.send(MessagingConstants.BIGBLUEBUTTON_BRIDGE, gson.toJson(updates));
	}
	
	private void storePublicMsg(ChatMessageVO chatobj) {
		Jedis jedis = this.createRedisClient();
		
		HashMap<String,String> map = new HashMap<String, String>();
		long messageid = System.currentTimeMillis();
		
		map.put("message", chatobj.message);
		map.put("username", chatobj.fromUsername);
		map.put("userID", chatobj.fromUserID);
		jedis.hmset("meeting-"+myMeetingID+"-message-"+messageid, map);
		jedis.rpush("meeting-"+myMeetingID+"-messages", Long.toString(messageid));
		
		this.dropRedisClient(jedis);
	}

	private void sendCursorUpdateToMyRedis(Double xPercent, Double yPercent, String originalMeetingID) {
		ArrayList<Object> updates = new ArrayList<Object>();
		updates.add(myMeetingID);
		updates.add("mvCur");
		updates.add(xPercent);
		updates.add(yPercent);
		updates.add(originalMeetingID);
		Gson gson = new Gson();
		this.send(MessagingConstants.BIGBLUEBUTTON_BRIDGE, gson.toJson(updates));
	}

	private class PubSubListener extends JedisPubSub {
		
		public PubSubListener() {
			super();			
		}

		@Override
		public void onMessage(String channel, String message) {
			// Not used.
		}

		@Override
		public void onPMessage(String pattern, String channel, String message) {
			log.debug("Message Received in channel: " + channel);
			Gson gson = new Gson();
			
			if(channel.equalsIgnoreCase(MessagingConstants.BIGBLUEBUTTON_BRIDGE)){
				JsonParser parser = new JsonParser();
				JsonArray array = parser.parse(message).getAsJsonArray();
				String meetingId = gson.fromJson(array.get(0), String.class);
				String messageName = gson.fromJson(array.get(1), String.class);

				if(messageName.equalsIgnoreCase("user join")){
					String nUserId = gson.fromJson(array.get(2), String.class);
					String username = gson.fromJson(array.get(3), String.class);
					String role = gson.fromJson(array.get(4), String.class);
					
					String externalUserID = UUID.randomUUID().toString();
					
					String originalMeetingID = (array.size() > 5) ? gson.fromJson(array.get(5), String.class) : "";

					if(masterMeetingID.equals(meetingId) && !originalMeetingID.equals(myMeetingID)){
						if(originalMeetingID.equals(""))
							originalMeetingID = masterMeetingID;
						storeParticipantToMyRedis(nUserId, username, role, originalMeetingID);
						sendParticipantJoinToMyRedis(nUserId, username, role, originalMeetingID);
					}
				}else if(messageName.equalsIgnoreCase("user leave")){
					String nUserId = gson.fromJson(array.get(2), String.class);
					String originalMeetingID = (array.size() > 3) ? gson.fromJson(array.get(3), String.class) : "";					
					if(masterMeetingID.equals(meetingId) && !originalMeetingID.equals(myMeetingID)){
						removeParticipantFromMyRedis(nUserId);
						sendParticipantLeaveToMyRedis(nUserId, originalMeetingID);
					}
				}else if(messageName.equalsIgnoreCase("msg")){
					String chatType = gson.fromJson(array.get(2), String.class);
					String fromUserID = gson.fromJson(array.get(3), String.class);
					String fromUsername = gson.fromJson(array.get(4), String.class);
					String fromColor = gson.fromJson(array.get(5), String.class);
					Double fromTime = gson.fromJson(array.get(6), Double.class);
					Long fromTimezoneOffset = gson.fromJson(array.get(7), Long.class);
					String fromLang = gson.fromJson(array.get(8), String.class);
					String toUserID = gson.fromJson(array.get(9), String.class);
					String toUsername = gson.fromJson(array.get(10), String.class);
					String message_text = gson.fromJson(array.get(11), String.class);
					String originalMeetingID = (array.size() > 12) ? gson.fromJson(array.get(12), String.class) : "";

					if(chatType.equalsIgnoreCase("PUBLIC")) {
						ChatMessageVO chatObj = new ChatMessageVO();
						/*chatObj.chatType = "PUBLIC"; 
						chatObj.fromUserID = userid;
						chatObj.fromUsername = username;
						chatObj.fromColor = "0";
						chatObj.fromTime = 0.0;   
						chatObj.fromTimezoneOffset = (long)0;
						chatObj.fromLang = "en"; 	 
						chatObj.toUserID = "";
						chatObj.toUsername = "";
						chatObj.message = message_text;
						*/
						chatObj.chatType = chatType;
						chatObj.fromUserID = fromUserID;
						chatObj.fromUsername = fromUsername;
						chatObj.fromColor = fromColor;
						chatObj.fromTime = fromTime;
						chatObj.fromTimezoneOffset = fromTimezoneOffset;
						chatObj.fromLang = fromLang;
						chatObj.toUserID = "";
						chatObj.toUsername = "";
						chatObj.message = message_text;

						if(masterMeetingID.equals(meetingId) && !originalMeetingID.equals(myMeetingID)){
							storePublicMsg(chatObj);
							sendMsg(chatObj, originalMeetingID);
						}
					}
					else {
						ChatMessageVO chatObj = new ChatMessageVO();
						chatObj.chatType = chatType;
						chatObj.fromUserID = fromUserID;
						chatObj.fromUsername = fromUsername;
						chatObj.fromColor = fromColor;
						chatObj.fromTime = fromTime;
						chatObj.fromTimezoneOffset = fromTimezoneOffset;
						chatObj.fromLang = fromLang;
						chatObj.toUserID = toUserID;
						chatObj.toUsername = toUsername;
						chatObj.message = message_text;

						if(masterMeetingID.equals(meetingId) && !originalMeetingID.equals(myMeetingID)){
							sendMsg(chatObj, originalMeetingID);
						}
					}
				}else if(messageName.equalsIgnoreCase("setPresenter")){
					String originalMeetingID = "";
					
					//sendStoreAssignPresenterToMyRedis(pubID, String previousPresenter);
					//sendAssignPresenterToMyRedis(pubID);
				}else if(messageName.equalsIgnoreCase("mvCur")){
					Double xPercent = gson.fromJson(array.get(2), Double.class);
					Double yPercent = gson.fromJson(array.get(3), Double.class);
					String originalMeetingID = (array.size() > 4) ? gson.fromJson(array.get(4), String.class) : "";

					if(xPercent == null || yPercent == null)
					{
						xPercent = 0.0;
						yPercent = 0.0;
					}
					if(masterMeetingID.equals(meetingId) && !originalMeetingID.equals(myMeetingID)){
						sendCursorUpdateToMyRedis(xPercent, yPercent, originalMeetingID);
					}
				}

			}
		}

		@Override
		public void onPSubscribe(String pattern, int subscribedChannels) {
			log.debug("Subscribed to the pattern: " + pattern);
		}

		@Override
		public void onPUnsubscribe(String pattern, int subscribedChannels) {
			// Not used.
		}

		@Override
		public void onSubscribe(String channel, int subscribedChannels) {
			// Not used.
		}

		@Override
		public void onUnsubscribe(String channel, int subscribedChannels) {
			// Not used.
		}		
	}
}