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
package org.bigbluebutton.modules.videoconf.business
{
	import com.asfusion.mate.events.Dispatcher;	
	import flash.events.AsyncErrorEvent;
	import flash.events.IOErrorEvent;
	import flash.events.NetStatusEvent;
	import flash.events.SecurityErrorEvent;
	import flash.media.H264Level;
	import flash.media.H264Profile;
	import flash.media.H264VideoStreamSettings;
	import flash.net.NetConnection;
	import flash.net.NetStream;
	import flash.system.Capabilities;
	import flash.utils.Dictionary;
	import flash.net.Responder;

	import mx.collections.ArrayCollection;
	
	import org.bigbluebutton.common.LogUtil;
	import org.bigbluebutton.core.BBB;
	import org.bigbluebutton.core.managers.ConnectionManager;
	import org.bigbluebutton.core.managers.UserManager;
	import org.bigbluebutton.modules.videoconf.events.ConnectedEvent;
	import org.bigbluebutton.modules.videoconf.events.StartBroadcastEvent;
	import org.bigbluebutton.modules.videoconf.model.VideoConfOptions;
	import org.bigbluebutton.modules.videoconf.events.PlayConnectionReady;

	
	public class VideoProxy
	{		
		public var videoOptions:VideoConfOptions;
		
		// NetConnection used for stream publishing
		private var nc:NetConnection;
		// NetStream used for stream publishing
		private var ns:NetStream;
		private var _url:String;
		private var camerasPublishing:Object = new Object();
		private var connected:Boolean = false;

		// Dictionary<url,NetConnection> used for stream playing
		private var playConnectionDict:Dictionary;
		// Dictionary<url,Array<streamName>> used to keep track of streams using a URL
		private var urlStreamsDict:Dictionary;
		// Dictionary<streamName,streamNamePrefix> used for stream playing
		private var streamNamePrefixDict:Dictionary;
		// Dictionary<streamName,url>
		private var streamUrlDict:Dictionary;

		private function parseOptions():void {
			videoOptions = new VideoConfOptions();
			videoOptions.parseOptions();	
		}
		
		public function VideoProxy(url:String)
		{
      _url = url;
			parseOptions();			
			nc = new NetConnection();
			nc.client = this;
			nc.addEventListener(AsyncErrorEvent.ASYNC_ERROR, onAsyncError);
			nc.addEventListener(IOErrorEvent.IO_ERROR, onIOError);
			nc.addEventListener(NetStatusEvent.NET_STATUS, onNetStatus);
			nc.addEventListener(SecurityErrorEvent.SECURITY_ERROR, onSecurityError);
			playConnectionDict = new Dictionary();
			urlStreamsDict = new Dictionary();
			streamNamePrefixDict = new Dictionary();
			streamUrlDict = new Dictionary();
		}
		
    public function connect():void {
    	nc.connect(_url);
		playConnectionDict[_url] = nc;
		urlStreamsDict[_url] = new Array();
    }
    
		private function onAsyncError(event:AsyncErrorEvent):void{
		}
		
		private function onIOError(event:NetStatusEvent):void{
		}
		
    private function onConnectedToVideoApp():void{
      var dispatcher:Dispatcher = new Dispatcher();
      dispatcher.dispatchEvent(new ConnectedEvent(ConnectedEvent.VIDEO_CONNECTED));
    }
    
		private function onNetStatus(event:NetStatusEvent):void{
			switch(event.info.code){
				case "NetConnection.Connect.Success":
					connected = true;
					//ns = new NetStream(nc);
          onConnectedToVideoApp();
					break;
        default:
					LogUtil.debug("[" + event.info.code + "] for [" + _url + "]");
					connected = false;
					break;
			}
		}
		
		private function onSecurityError(event:NetStatusEvent):void{
		}
		
		public function get publishConnection():NetConnection{
			return this.nc;
		}

		private function onPlayNetStatus(event:NetStatusEvent):void {
			switch(event.info.code){
				case "NetConnection.Connect.Success":
					var dispatcher:Dispatcher = new Dispatcher();
					// Notify streams from this connection
					var url:String = event.target.uri;
					var streams:Array = urlStreamsDict[url];
					var conn:NetConnection = playConnectionDict[url];
					for each (var stream:String in streams) {
						var prefix:String = streamNamePrefixDict[stream];
						dispatcher.dispatchEvent(new PlayConnectionReady(stream, conn, prefix));
					}
					break;
				default:
					LogUtil.debug("[" + event.info.code + "] for a play connection");
					break;
			}
		}

		public function createPlayConnectionFor(streamName:String):void {
			LogUtil.debug("VideoProxy::createPlayConnectionFor:: Requesting path for stream [" + streamName + "]");

			// Ask red5 the path to stream
			var _nc:NetConnection = BBB.initConnectionManager().connection;
			_nc.call("video.getStreamPath", new Responder(handleStreamPathResponse), streamName);
		}

		private function handleStreamPathResponse(msg:String):void {
			trace("handleStreamPathResponse [" + msg + "]");
			var temp:Array = msg.split(",");
			if(temp.length == 2)
				handleStreamPathReceived(temp[0], temp[1]);
			else
				handleStreamPathReceived(temp[0], "");
		}

		public function handleStreamPathReceived(streamName:String, connectionPath:String):void {
			LogUtil.debug("VideoProxy::handleStreamPathReceived:: Path for stream [" + streamName + "]: [" + connectionPath + "]");

			var newUrl:String;
			var streamPrefix:String;

			// Check whether the is through proxy servers or not
			if(connectionPath == "") {
				newUrl = _url;
				streamPrefix = "";
			}
			else {
				var ipRegex:RegExp = /([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/;
				var serverIp:String = connectionPath.split("/")[0];
				newUrl = _url.replace(ipRegex, serverIp);
				streamPrefix = connectionPath.replace(serverIp + "/", "") + "/";
			}

			// Store URL for this stream
			streamUrlDict[streamName] = newUrl;

			// Set current streamPrefix to use the current path
			streamNamePrefixDict[streamName] = streamPrefix;

			if(urlStreamsDict[newUrl] == null) {
				urlStreamsDict[newUrl] = new Array();
				urlStreamsDict[streamPrefix+streamName] = urlStreamsDict[newUrl];
			}
			urlStreamsDict[newUrl].push(streamName);

			// If connection with this URL does not exist
			if(!playConnectionDict[newUrl]){
				// Create new NetConnection and store it
				var connection:NetConnection = new NetConnection();
				connection.client = this;
				connection.addEventListener(AsyncErrorEvent.ASYNC_ERROR, onAsyncError);
				connection.addEventListener(IOErrorEvent.IO_ERROR, onIOError);
				connection.addEventListener(NetStatusEvent.NET_STATUS, onPlayNetStatus);
				connection.addEventListener(SecurityErrorEvent.SECURITY_ERROR, onSecurityError);
				connection.connect(newUrl);
				// TODO change to trace
				LogUtil.debug("VideoProxy::handleStreamPathReceived:: Creating NetConnection for [" + newUrl + "]");
				playConnectionDict[newUrl] = connection;
			}
			else {
				if(playConnectionDict[newUrl].connected) {
					// Connection is ready, send event
					var dispatcher:Dispatcher = new Dispatcher();
					dispatcher.dispatchEvent(new PlayConnectionReady(streamName, playConnectionDict[newUrl], streamPrefix));
				}
				// TODO change to trace
				LogUtil.debug("VideoProxy::handleStreamPathReceived:: Found NetConnection for [" + newUrl + "]");
			}
		}

		private function removeFromArray(item:String, array:Array):void {
			var index:int = array.indexOf(item);
			array.splice(index,1);
		}

		public function closePlayConnectionFor(streamName:String):void {
			var temp:Array = streamName.split("/");
			var stream:String = temp[temp.length-1];
			var streamUrl:String = streamUrlDict[stream];
			var streams:Array = urlStreamsDict[streamUrl];
			if(streams != null) {
				removeFromArray(stream, streams);
			}
			// Do not close publish connection, no matter what
			if(playConnectionDict[streamUrl] == nc)
				return;
			if(streams == null || streams.length <= 0) {
				// No one else is using this NetConnection
				var connection:NetConnection = playConnectionDict[streamUrl];
				if(connection != null) connection.close();
				delete playConnectionDict[streamUrl];
				delete urlStreamsDict[streamUrl];
				delete streamUrlDict[stream];
			}
			else {
				trace("VideoProxy:: closePlayConnectionFor:: stream: [" + stream + "], URL: [" + streamUrl + "], new streamCount: [" + streams.length + "]");
			}
		}

		public function startPublishing(e:StartBroadcastEvent):void{
			var ns:NetStream = new NetStream(nc);
			ns.addEventListener( NetStatusEvent.NET_STATUS, onNetStatus );
			ns.addEventListener( IOErrorEvent.IO_ERROR, onIOError );
			ns.addEventListener( AsyncErrorEvent.ASYNC_ERROR, onAsyncError );
			ns.client = this;
			ns.attachCamera(e.camera);
//		Uncomment if you want to build support for H264. But you need at least FP 11. (ralam july 23, 2011)	
//			if (Capabilities.version.search("11,0") != -1) {
			if ((BBB.getFlashPlayerVersion() >= 11) && e.videoProfile.enableH264) {
//			if (BBB.getFlashPlayerVersion() >= 11) {
				LogUtil.info("Using H264 codec for video.");
				var h264:H264VideoStreamSettings = new H264VideoStreamSettings();
				var h264profile:String = H264Profile.MAIN;
				if (e.videoProfile.h264Profile != "main") {
					h264profile = H264Profile.BASELINE;
				}
				var h264Level:String = H264Level.LEVEL_4_1;
				switch (e.videoProfile.h264Level) {
					case "1": h264Level = H264Level.LEVEL_1; break;
					case "1.1": h264Level = H264Level.LEVEL_1_1; break;
					case "1.2": h264Level = H264Level.LEVEL_1_2; break;
					case "1.3": h264Level = H264Level.LEVEL_1_3; break;
					case "1b": h264Level = H264Level.LEVEL_1B; break;
					case "2": h264Level = H264Level.LEVEL_2; break;
					case "2.1": h264Level = H264Level.LEVEL_2_1; break;
					case "2.2": h264Level = H264Level.LEVEL_2_2; break;
					case "3": h264Level = H264Level.LEVEL_3; break;
					case "3.1": h264Level = H264Level.LEVEL_3_1; break;
					case "3.2": h264Level = H264Level.LEVEL_3_2; break;
					case "4": h264Level = H264Level.LEVEL_4; break;
					case "4.1": h264Level = H264Level.LEVEL_4_1; break;
					case "4.2": h264Level = H264Level.LEVEL_4_2; break;
					case "5": h264Level = H264Level.LEVEL_5; break;
					case "5.1": h264Level = H264Level.LEVEL_5_1; break;
				}
				
				LogUtil.info("Codec used: " + h264Level);
				
				h264.setProfileLevel(h264profile, h264Level);
				ns.videoStreamSettings = h264;
			}
			
			ns.publish(e.stream);
			camerasPublishing[e.stream] = ns;
		}
		
		public function stopBroadcasting(stream:String):void{
      trace("Closing netstream for webcam publishing");
      			if (camerasPublishing[stream] != null) {
	      			var ns:NetStream = camerasPublishing[stream];
				ns.attachCamera(null);
				ns.close();
				ns = null;
				delete camerasPublishing[stream];
			}	
		}

		public function stopAllBroadcasting():void {
			for each (var ns:NetStream in camerasPublishing)
			{
				ns.attachCamera(null);
				ns.close();
				ns = null;
			}
			camerasPublishing = new Object();
		}

		public function disconnect():void {
      trace("VideoProxy:: disconnecting from Video application");
      stopAllBroadcasting();
			// Close publish NetConnection
			if (nc != null) nc.close();
			// Close play NetConnections
			for (var k:Object in playConnectionDict) {
				var connection:NetConnection = playConnectionDict[k];
				connection.close();
			}
			// Reset dictionaries
			playConnectionDict = new Dictionary();
			streamNamePrefixDict = new Dictionary();
			urlStreamsDict = new Dictionary();
			streamUrlDict = new Dictionary();
		}
		
		public function onBWCheck(... rest):Number { 
			return 0; 
		} 
		
		public function onBWDone(... rest):void { 
			var p_bw:Number; 
			if (rest.length > 0) p_bw = rest[0]; 
			// your application should do something here 
			// when the bandwidth check is complete 
			trace("bandwidth = " + p_bw + " Kbps."); 
		}
		

	}
}
