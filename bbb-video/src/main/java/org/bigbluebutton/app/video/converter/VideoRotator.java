package org.bigbluebutton.app.video.converter;

import org.bigbluebutton.red5.pubsub.MessagePublisher;
import org.red5.logging.Red5LoggerFactory;
import org.red5.server.api.IConnection;
import org.red5.server.api.Red5;
import org.slf4j.Logger;

/**
 * Represents a stream rotator. This class is responsible
 * for choosing the rotate direction based on the stream name
 * and starting FFmpeg to rotate and re-publish the stream.
 */
public class VideoRotator {

	private static Logger log = Red5LoggerFactory.getLogger(VideoRotator.class, "video");

	public static final String ROTATE_LEFT = "rotate_left";
	public static final String ROTATE_RIGHT = "rotate_right";
	public static final String ROTATE_UPSIDE_DOWN = "rotate_left/rotate_left";

	private final String ROTATE_ID = "ROTATE-";

	private String streamName;
	private String streamId;
	private String transcoderId;
	private String meetingId;
	private String ipAddress;
	private MessagePublisher publisher;

	/**
	 * Create a new video rotator for the specified stream.
	 * The streamName should be of the form: 
	 * rotate_[left|right]/streamName
	 * The rotated stream will be published as streamName.
	 * 
	 * @param origin Name of the stream that will be rotated
	 */
	public VideoRotator(String origin, MessagePublisher publisher) {
		this.streamId = origin;
		this.streamName = getStreamName(streamId);
		this.publisher = publisher;

		IConnection conn = Red5.getConnectionLocal();
		this.transcoderId = ROTATE_ID + streamName;
		this.meetingId = conn.getScope().getName();
		this.ipAddress = conn.getHost();

		start();
	}
	
	/**
	 * Get the stream name from the direction/streamName string
	 * @param streamName Name of the stream with rotate direction
	 * @return The stream name used for re-publish
	 */
	private String getStreamName(String streamName) {
		String parts[] = streamName.split("/");
		if(parts.length > 1)
			return parts[parts.length-1];
		return "";
	}

	private void start() {
		switch (getDirection(streamId)) {
			case ROTATE_RIGHT:
				publisher.startRotateRightTranscoderRequest(meetingId, transcoderId, streamName, ipAddress);
				break;
			case ROTATE_LEFT:
				publisher.startRotateLeftTranscoderRequest(meetingId, transcoderId, streamName, ipAddress);
				break;
			case ROTATE_UPSIDE_DOWN:
				publisher.startRotateUpsideDownTranscoderRequest(meetingId, transcoderId, streamName, ipAddress);
				break;
			default:
				break;
		}
	}

	/**
	 * Get the rotate direction from the streamName string.
	 * @param streamName Name of the stream with rotate direction
	 * @return String for the given direction if present, null otherwise
	 */
	public static String getDirection(String streamName) {
		int index = streamName.lastIndexOf("/");
		String parts[] =  {
				streamName.substring(0, index),
				streamName.substring(index + 1)
			};

		switch(parts[0]) {
			case ROTATE_LEFT:
				return ROTATE_LEFT;
			case ROTATE_RIGHT:
				return ROTATE_RIGHT;
			case ROTATE_UPSIDE_DOWN:
				return ROTATE_UPSIDE_DOWN;
			default:
				return null;
		}
	}

	public void stop() {
		publisher.stopTranscoderRequest(meetingId, transcoderId);
	}

	private String getUserId() {
		String userid = (String) Red5.getConnectionLocal().getAttribute("USERID");
		if ((userid == null) || ("".equals(userid))) userid = "unknown-userid";
		return userid;
	}

    public static boolean isRotatedStream(String streamName){
        return (getDirection(streamName) != null);
    }
}
