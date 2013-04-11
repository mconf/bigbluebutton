package org.bigbluebutton.main.events
{
	import flash.events.Event;
	
	import org.bigbluebutton.common.LogUtil;
	import org.bigbluebutton.common.events.EventCounter;

	public class UserServicesEvent extends Event
	{
		public static const START_USER_SERVICES:String = "START_USER_SERVICES";
		public static const USER_SERVICES_STARTED:String = "USER_SERVICES_STARTED";
		
		public var applicationURI:String;
		public var hostURI:String;
		
		public var user:Object;
		
		public function UserServicesEvent(type:String)
		{
			super(type, true, false);
			LogUtil.debug("EVENTO GERADO - " + type);
			EventCounter.numberOfEvents++;
		}
	}
}
