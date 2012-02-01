package org.bigbluebutton.voiceconf.red5.messaging;

public interface MessagingService {
	public void start();
	public void stop();
	public void send(String channel, String message);
	public void addListener(MessageListener listener);
	public void removeListener(MessageListener listener);
}
