package org.bigbluebutton.red5.pubsub;

import org.bigbluebutton.common.messages.MessagingConstants;
import org.bigbluebutton.common.messages.Constants;
import org.bigbluebutton.common.messages.UserSharedWebcamMessage;
import org.bigbluebutton.common.messages.UserUnshareWebcamRequestMessage;
import org.bigbluebutton.common.messages.StartTranscoderRequestMessage;
import org.bigbluebutton.common.messages.StopTranscoderRequestMessage;

import java.util.HashMap;
import java.util.Map;

public class MessagePublisher {

	private MessageSender sender;
	
	public void setMessageSender(MessageSender sender) {
		this.sender = sender;
	}
	
	// Polling 
	public void userSharedWebcamMessage(String meetingId, String userId, String streamId) {
		UserSharedWebcamMessage msg = new UserSharedWebcamMessage(meetingId, userId, streamId);
		sender.send(MessagingConstants.TO_USERS_CHANNEL, msg.toJson());
	}

	public void userUnshareWebcamRequestMessage(String meetingId, String userId, String streamId) {
		UserUnshareWebcamRequestMessage msg = new UserUnshareWebcamRequestMessage(meetingId, userId, streamId);
		sender.send(MessagingConstants.TO_USERS_CHANNEL, msg.toJson());
	}
	
	public void startRotateLeftTranscoderRequest(String meetingId, String transcoderId, String streamName, String ipAddress) {
		Map<String, String> params = new HashMap<String, String>();
		params.put(Constants.TRANSCODER_TYPE, Constants.TRANSCODE_ROTATE_LEFT);
		params.put(Constants.LOCAL_IP_ADDRESS, ipAddress);
		params.put(Constants.DESTINATION_IP_ADDRESS, ipAddress);
		params.put(Constants.INPUT, streamName);
		StartTranscoderRequestMessage msg = new StartTranscoderRequestMessage(meetingId, transcoderId, params);
		sender.send(MessagingConstants.TO_BBB_TRANSCODE_SYSTEM_CHAN, msg.toJson());
	}

	public void startRotateRightTranscoderRequest(String meetingId, String transcoderId, String streamName, String ipAddress) {
		Map<String, String> params = new HashMap<String, String>();
		params.put(Constants.TRANSCODER_TYPE, Constants.TRANSCODE_ROTATE_RIGHT);
		params.put(Constants.LOCAL_IP_ADDRESS, ipAddress);
		params.put(Constants.DESTINATION_IP_ADDRESS, ipAddress);
		params.put(Constants.INPUT, streamName);
		StartTranscoderRequestMessage msg = new StartTranscoderRequestMessage(meetingId, transcoderId, params);
		sender.send(MessagingConstants.TO_BBB_TRANSCODE_SYSTEM_CHAN, msg.toJson());
	}

	public void startRotateUpsideDownTranscoderRequest(String meetingId, String transcoderId, String streamName, String ipAddress) {
		Map<String, String> params = new HashMap<String, String>();
		params.put(Constants.TRANSCODER_TYPE, Constants.TRANSCODE_ROTATE_UPSIDE_DOWN);
		params.put(Constants.LOCAL_IP_ADDRESS, ipAddress);
		params.put(Constants.DESTINATION_IP_ADDRESS, ipAddress);
		params.put(Constants.INPUT, streamName);
		StartTranscoderRequestMessage msg = new StartTranscoderRequestMessage(meetingId, transcoderId, params);
		sender.send(MessagingConstants.TO_BBB_TRANSCODE_SYSTEM_CHAN, msg.toJson());
	}

	public void startH264ToH263TranscoderRequest(String meetingId, String transcoderId, String streamName, String ipAddress) {
		Map<String, String> params = new HashMap<String, String>();
		params.put(Constants.TRANSCODER_TYPE, Constants.TRANSCODE_H264_TO_H263);
		params.put(Constants.MODULE, "video");
		params.put(Constants.LOCAL_IP_ADDRESS, ipAddress);
		params.put(Constants.DESTINATION_IP_ADDRESS, ipAddress);
		params.put(Constants.INPUT, streamName);
		StartTranscoderRequestMessage msg = new StartTranscoderRequestMessage(meetingId, transcoderId, params);
		sender.send(MessagingConstants.TO_BBB_TRANSCODE_SYSTEM_CHAN, msg.toJson());
	}

	public void stopTranscoderRequest(String meetingId, String transcoderId) {
		StopTranscoderRequestMessage msg = new StopTranscoderRequestMessage(meetingId, transcoderId);
		sender.send(MessagingConstants.TO_BBB_TRANSCODE_SYSTEM_CHAN, msg.toJson());
	}
}
