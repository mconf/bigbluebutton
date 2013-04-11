package org.bigbluebutton.common.events
{
	import flash.events.Event;
	import org.bigbluebutton.common.LogUtil;
	import org.bigbluebutton.common.events.EventCounter;
	
	public class LocaleChangeEvent extends Event
	{
		public static const LOCALE_CHANGED:String = "LOCALE_CHANGED_EVENT";
		
		public function LocaleChangeEvent(type:String)
		{
			super(type, true, false);
			LogUtil.debug("EVENTO GERADO - " + type);
			EventCounter.numberOfEvents++;
		}
	}
}
