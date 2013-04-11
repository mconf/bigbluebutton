package org.bigbluebutton.common.events
{
	import flash.events.Event;
	
	import mx.core.UIComponent;
	
	/**
	 * Allows you to add any UIComponent to the main canvas. Simply instantiate the method, add a reference to 
	 * your UIComponent to it, and dispatch the event.
	 * 
	 */	
	public class EventCounter
	{
		public static var numberOfEvents:Number = 0;
		
	}
}
