package org.bigbluebutton.main.events
{
	import flash.events.Event;
	
	import org.bigbluebutton.core.vo.Config;
	import org.bigbluebutton.common.LogUtil;
	import org.bigbluebutton.common.events.EventCounter;

	public class ConfigEvent extends Event
	{
		public static const CONFIG_EVENT:String = "config event";
		
		public var config:Config;
		
		public function ConfigEvent(type:String)
		{
			super(type, true, false);
			LogUtil.debug("EVENTO GERADO - " + type);
			EventCounter.numberOfEvents++;
		}
	}
}
