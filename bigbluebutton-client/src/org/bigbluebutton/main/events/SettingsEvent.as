package org.bigbluebutton.main.events
{
	import flash.events.Event;
	import org.bigbluebutton.common.LogUtil;
	import org.bigbluebutton.common.events.EventCounter;

	public class SettingsEvent extends Event
	{
		public static const SETTINGS_MODULE_LOADED:String = "SETTINGS_MODULE_LOADED";
		public static const OPEN_SETTINGS_PANEL:String = "OPEN_SETTINGS_PANEL";
		
		public function SettingsEvent(type:String)
		{
			super(type, true, false);
			LogUtil.debug("EVENTO GERADO - " + type);
			EventCounter.numberOfEvents++;
		}
	}
}
