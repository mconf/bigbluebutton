var isFirefox = typeof window.InstallTrigger !== 'undefined';
var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
var isChrome = !!window.chrome && !isOpera;
var isSafari = navigator.userAgent.indexOf("Safari") >= 0 && !isChrome;
var kurentoHandler = null;
var logger = window.Logger || console;

// TODO sugestions on where to store this
const CONNECTION_ERROR = "CONNECTION_ERROR";
const SERVER_ERROR = "SERVER_ERROR";
const PEER_ERROR = "PEER_ERROR";
const SDP_ERROR = "SDP_ERROR";
const EXTENSION_ERROR = "EXTENSION_ERROR";

// TODO: We need some refactor here
Kurento = function (
    tag,
    voiceBridge,
    conferenceUsername,
    internalMeetingId,
    onFail = null,
    chromeExtension = null,
    streamId = null,
    userId = null,
    userName = null,
    onSuccess = null
    ) {

  this.ws = null;
  this.video;
  this.screen;
  this.webRtcPeer;
  this.extensionInstalled = false;
  this.screenConstraints = {};
  this.mediaCallback = null;

  this.voiceBridge = voiceBridge + '-SCREENSHARE';
  this.internalMeetingId = internalMeetingId;
  this.streamId = streamId;
  this.userId = userId;
  this.userName = userName;

  this.vid_width = window.screen.width/2;
  this.vid_height = window.screen.height/2;

  // TODO properly generate a uuid
  this.sessid = Math.random().toString();

  this.renderTag = 'remote-media';

  this.caller_id_name = conferenceUsername;
  this.caller_id_number = conferenceUsername;

  this.kurentoPort = "bbb-webrtc-sfu";
  this.hostName = window.location.hostname;
  this.socketUrl = 'wss://' + this.hostName + '/' + this.kurentoPort;

  this.iceServers = null;

  if (chromeExtension != null) {
    this.chromeExtension = chromeExtension;
    window.chromeExtension = chromeExtension;
  }

  if (onFail != null) {
    this.onFail = Kurento.normalizeCallback(onFail);
  } else {
    var _this = this;
    this.onFail = function () {
      _this.logError('Default error handler');
    };
  }

  if (onSuccess != null) {
    this.onSuccess = Kurento.normalizeCallback(onSuccess);
  } else {
    var _this = this;
    this.onSuccess = function () {
      _this.logSuccess('Default success handler');
    };
  }
};

this.KurentoManager= function () {
  this.kurentoVideo = null;
  this.kurentoScreenshare = null;
};

KurentoManager.prototype.exitScreenShare = function () {
  logger.info("[exitScreenShare] Exiting screenshare");
  if(typeof this.kurentoScreenshare !== 'undefined' && this.kurentoScreenshare) {
    if(this.kurentoScreenshare.ws !== null) {
      this.kurentoScreenshare.ws.onclose = function(){};
      this.kurentoScreenshare.ws.close();
    }

    this.kurentoScreenshare.dispose();
    this.kurentoScreenshare = null;
  }

  if (this.kurentoScreenshare) {
    this.kurentoScreenshare = null;
  }

  if(typeof this.kurentoVideo !== 'undefined' && this.kurentoVideo) {
    this.exitVideo();
  }
};

KurentoManager.prototype.exitVideo = function () {
  logger.info("[exitVideo] Exiting video");
  if(typeof this.kurentoVideo !== 'undefined' && this.kurentoVideo) {
    if(this.kurentoVideo.ws !== null) {
      this.kurentoVideo.ws.onclose = function(){};
      this.kurentoVideo.ws.close();
    }

    this.kurentoVideo.dispose();
    this.kurentoVideo = null;
  }

  if (this.kurentoVideo) {
    this.kurentoVideo = null;
  }
};

KurentoManager.prototype.exitAudio = function () {
  logger.info("[exitAudio] Exiting audio");
  if(typeof this.kurentoAudio !== 'undefined' && this.kurentoAudio) {
    if(this.kurentoAudio.ws !== null) {
      this.kurentoAudio.ws.onclose = function(){};
      this.kurentoAudio.ws.close();
    }

    this.kurentoAudio.dispose();
    this.kurentoAudio = null;
  }

  if (this.kurentoAudio) {
    this.kurentoAudio = null;
  }
};

KurentoManager.prototype.shareScreen = function (tag) {
  this.exitScreenShare();
  var obj = Object.create(Kurento.prototype);
  Kurento.apply(obj, arguments);
  this.kurentoScreenshare = obj;
  this.kurentoScreenshare.setScreenShare(tag);
};

KurentoManager.prototype.joinWatchVideo = function (tag) {
  this.exitVideo();
  var obj = Object.create(Kurento.prototype);
  Kurento.apply(obj, arguments);
  this.kurentoVideo = obj;
  this.kurentoVideo.setWatchVideo(tag);
};


Kurento.prototype.setScreenShare = function (tag) {
  this.mediaCallback = this.makeShare.bind(this);
  this.create(tag);
};

Kurento.prototype.create = function (tag) {
  this.setRenderTag(tag);
  this.iceServers = true;
  this.init();
};

Kurento.prototype.init = function () {
  var self = this;
  if("WebSocket" in window) {
    logger.debug("[init] Websockets supported");
    this.ws = new WebSocket(this.socketUrl);

    this.ws.onmessage = this.onWSMessage.bind(this);
    this.ws.onclose = (close) => {
      kurentoManager.exitScreenShare();
      //self.onFail();
    };
    this.ws.onerror = (error) => {
      kurentoManager.exitScreenShare();
      self.onFail(CONNECTION_ERROR);
    };
    this.ws.onopen = function () {
      self.mediaCallback();
    }.bind(self);
  }
  else
    logger.warn("[init] Websockets not supported");
};

Kurento.prototype.onWSMessage = function (message) {
  var parsedMessage = JSON.parse(message.data);
  switch (parsedMessage.id) {

    case 'presenterResponse':
    case 'viewerResponse':
    case 'startResponse':
      this.serverResponse(parsedMessage);
      break;
    case 'stopSharing':
      kurentoManager.exitScreenShare();
      break;
    case 'iceCandidate':
      this.webRtcPeer.addIceCandidate(parsedMessage.candidate);
      break;
    case 'webRTCScreenshareStarted':
      logger.debug("[onWSMessage] WebRTC screenshare started");
      BBB.webRTCScreenshareStarted(
          parsedMessage.meetingId,
          parsedMessage.streamId,
          parsedMessage.width,
          parsedMessage.height
      );
      break;
    case 'webRTCScreenshareStopped':
      logger.debug("[onWSMessage] WebRTC screenshare stopped");
      BBB.webRTCScreenshareStopped(
          parsedMessage.meetingId,
          parsedMessage.streamId
      );
      break;
    case 'webRTCScreenshareError':
      logger.error("[onWSMessage]", parsedMessage.error);
      this.onFail(parsedMessage.error);
      break;
    case 'webRTCAudioSuccess':
      this.onSuccess(parsedMessage.success);
      break;
    case 'webRTCAudioError':
      this.onFail(parsedMessage.error);
      break;
    default:
      logger.warn("[onWSMessage] Unrecognized message", parsedMessage);
  }
};

Kurento.prototype.setRenderTag = function (tag) {
  this.renderTag = tag;
};

Kurento.prototype.serverResponse = function (message) {
  if (message.response != 'accepted') {
    var errorMsg = message.message ? message.message : 'Unknown error';
    logger.error("[serverResponse]", errorMsg);
    switch (message.type) {
      case 'screenshare':
        if (message.role === 'presenter') {
          kurentoManager.exitScreenShare();
        }
        else if (message.role === 'viewer') {
          kurentoManager.exitVideo();
        }
        break;

      case 'audio':
        kurentoManager.exitAudio();
    }
    this.onFail(SERVER_ERROR);
  } else {
    this.webRtcPeer.processAnswer(message.sdpAnswer);
  }
};

Kurento.prototype.makeShare = function() {
  var self = this;
  if (!this.webRtcPeer) {
    var options = {
      onicecandidate : self.onIceCandidate.bind(self)
    }

    this.startScreenStreamFrom();
  }
};

Kurento.prototype.onOfferPresenter = function (error, offerSdp) {
  let self = this;
  if(error)  {
    logger.error("[onOfferPresenter]", error);
    this.onFail(SDP_ERROR);
    return;
  }

  var message = {
    id : 'presenter',
    type: 'screenshare',
    role: 'presenter',
    internalMeetingId: self.internalMeetingId,
    voiceBridge: self.voiceBridge,
    callerName : self.caller_id_name,
    sdpOffer : offerSdp,
    vh: self.vid_height,
    vw: self.vid_width,
    streamId: self.streamId
  };
  logger.debug("[onOfferPresenter]", JSON.stringify(message, null, 2));
  this.sendMessage(message);
};

Kurento.prototype.startScreenStreamFrom = function () {
  var self = this;
  if (!!window.chrome) {
    if (!self.chromeExtension) {
      self.logError({
        status:  'failed',
        message: 'Missing Chrome Extension key',
      });
      self.onFail(EXTENSION_ERROR);
      return;
    }
  }
  // TODO it would be nice to check those constraints
  if (typeof screenConstraints !== undefined) {
    self.screenConstraints = {};
  }
  self.screenConstraints.video = {};

  var options = {
    localVideo: document.getElementById(this.renderTag),
    onicecandidate : self.onIceCandidate.bind(self),
    mediaConstraints : self.screenConstraints,
    sendSource : 'desktop'
  };

  logger.debug("[startScreenStreamFrom] Options", JSON.stringify(options, null, 2));

  self.webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
    if (error) {
      logger.error("[webRtcPeer]", JSON.stringify(error, null, 2));
      self.onFail(PEER_ERROR);
      return kurentoManager.exitScreenShare();
    }

    self.webRtcPeer.generateOffer(self.onOfferPresenter.bind(self));
    logger.debug("[webRtcPeer] Options", JSON.stringify(options));
  });
};

Kurento.prototype.onIceCandidate = function (candidate) {
  let self = this;
  logger.debug("[onIceCandidate]", JSON.stringify(candidate));

  var message = {
    id : 'onIceCandidate',
    role: 'presenter',
    type: 'screenshare',
    voiceBridge: self.voiceBridge,
    candidate : candidate
  }
  this.sendMessage(message);
};

Kurento.prototype.onViewerIceCandidate = function (candidate) {
  let self = this;
  logger.debug("[onViewerIceCandidate]", JSON.stringify(candidate));

  var message = {
    id : 'viewerIceCandidate',
    role: 'viewer',
    type: 'screenshare',
    voiceBridge: self.voiceBridge,
    candidate : candidate,
    callerName: self.caller_id_name
  }
  this.sendMessage(message);
};

Kurento.prototype.setWatchVideo = function (tag) {
  this.useVideo = true;
  this.useCamera = 'none';
  this.useMic = 'none';
  this.mediaCallback = this.viewer;
  this.create(tag);
};

Kurento.prototype.viewer = function () {
  var self = this;
  if (!this.webRtcPeer) {

    var options = {
      remoteVideo: document.getElementById(this.renderTag),
      onicecandidate : this.onViewerIceCandidate.bind(this)
    }

    self.webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
      if(error) {
        return self.onFail(PEER_ERROR);
      }

      this.generateOffer(self.onOfferViewer.bind(self));
    });
  }
};

Kurento.prototype.onOfferViewer = function (error, offerSdp) {
  let self = this;
  if(error)  {
    logger.error("[onOfferViewer]", error);
    return this.onFail(SDP_ERROR);
  }
  var message = {
    id : 'viewer',
    type: 'screenshare',
    role: 'viewer',
    internalMeetingId: self.internalMeetingId,
    voiceBridge: self.voiceBridge,
    callerName : self.caller_id_name,
    sdpOffer : offerSdp
  };

  logger.debug("[onOfferViewer]", JSON.stringify(message, null, 2));
  this.sendMessage(message);
};

Kurento.prototype.stop = function() {
  //if (this.webRtcPeer) {
  //  var message = {
  //    id : 'stop',
  //    type : 'screenshare',
  //    voiceBridge: kurentoHandler.voiceBridge
  //  }
  //  kurentoHandler.sendMessage(message);
  //  kurentoHandler.dispose();
  //}
}

Kurento.prototype.dispose = function() {
  if (this.webRtcPeer) {
    this.webRtcPeer.dispose();
    this.webRtcPeer = null;
  }
};

KurentoManager.prototype.joinAudio = function (tag) {
  this.exitAudio();
  var obj = Object.create(Kurento.prototype);
  Kurento.apply(obj, arguments);
  this.kurentoAudio= obj;
  this.kurentoAudio.setAudio(tag);
};

Kurento.prototype.setAudio = function (tag) {
  this.mediaCallback = this.listenOnly.bind(this);
  this.create(tag);
};

Kurento.prototype.listenOnly = function () {
  var self = this;
  if (!this.webRtcPeer) {
    var options = {
      remoteVideo: document.getElementById(this.renderTag),
      onicecandidate : this.onListenOnlyIceCandidate.bind(this),
      mediaConstraints: {
        audio:true,
        video:false
      }
    }

    self.webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
      if(error) {
        return self.onFail(PEER_ERROR);
      }

      this.generateOffer(self.onOfferListenOnly.bind(self));
    });
  }
};

Kurento.prototype.onListenOnlyIceCandidate = function (candidate) {
  let self = this;
  logger.debug("[onListenOnlyIceCandidate]", JSON.stringify(candidate));

  var message = {
    id : 'iceCandidate',
    role: 'viewer',
    type: 'audio',
    voiceBridge: self.voiceBridge,
    candidate : candidate,
    callerName: self.caller_id_name
  }
  this.sendMessage(message);
};

Kurento.prototype.onOfferListenOnly = function (error, offerSdp) {
  let self = this;
  if(error)  {
    logger.error("[onOfferListenOnly]", error);
    return this.onFail(SDP_ERROR);
  }

  var message = {
    id : 'start',
    type: 'audio',
    role: 'viewer',
    voiceBridge: self.voiceBridge,
    callerName : self.caller_id_name,
    sdpOffer : offerSdp,
    userId: self.userId,
    userName: self.userName
  };

  logger.debug("[onOfferListenOnly]", JSON.stringify(message, null, 2));
  this.sendMessage(message);
};


Kurento.prototype.sendMessage = function(message) {
  var jsonMessage = JSON.stringify(message);
  logger.debug("[sendMessage]", jsonMessage);
  this.ws.send(jsonMessage);
};

Kurento.prototype.logger = function (obj) {
  console.log(obj);
};

Kurento.prototype.logError = function (obj) {
  console.error(obj);
};

Kurento.prototype.logSuccess = function (obj) {
  console.debug(obj);
};

Kurento.normalizeCallback = function (callback) {
  if (typeof callback == 'function') {
    return callback;
  } else {
    logger.debug("[normalizeCallback]", document.getElementById('BigBlueButton')[callback]);
    return function (args) {
      document.getElementById('BigBlueButton')[callback](args);
    };
  }
};

/* Global methods */

// this function explains how to use above methods/objects
window.getScreenConstraints = function(sendSource, callback) {
  let chromeMediaSourceId = sendSource;
  let screenConstraints = {video: {}};

  if(isChrome) {
    getChromeScreenConstraints ((constraints) => {
      let sourceId = constraints.streamId;

      // this statement sets gets 'sourceId" and sets "chromeMediaSourceId"
      screenConstraints.video.chromeMediaSource = { exact: [sendSource]};
      screenConstraints.video.chromeMediaSourceId = sourceId;
      logger.debug("[getScreenConstraints] Chrome", screenConstraints);
      // now invoking native getUserMedia API
      callback(null, screenConstraints);

    }, chromeExtension);
  }
  else if (isFirefox) {
    screenConstraints.video.mediaSource= "screen";

    logger.debug("[getScreenConstraints] Firefox", screenConstraints);
    // now invoking native getUserMedia API
    callback(null, screenConstraints);
  }
  else if(isSafari) {
    screenConstraints.video.mediaSource= "screen";

    logger.debug("[getScreenConstraints] Safari", screenConstraints);
    // now invoking native getUserMedia API
    callback(null, screenConstraints);
  }
};

window.kurentoInitialize = function () {
  if (window.kurentoManager == null || window.KurentoManager == undefined) {
    window.kurentoManager = new KurentoManager();
  }
};

window.kurentoShareScreen = function() {
  window.kurentoInitialize();
  window.kurentoManager.shareScreen.apply(window.kurentoManager, arguments);
};


window.kurentoExitScreenShare = function () {
  window.kurentoInitialize();
  window.kurentoManager.exitScreenShare();
};

window.kurentoWatchVideo = function () {
  window.kurentoInitialize();
  window.kurentoManager.joinWatchVideo.apply(window.kurentoManager, arguments);
};

window.kurentoExitVideo = function () {
  window.kurentoInitialize();
  window.kurentoManager.exitVideo();
};

window.kurentoJoinAudio = function () {
  window.kurentoInitialize();
  window.kurentoManager.joinAudio.apply(window.kurentoManager, arguments);
};

window.kurentoExitAudio = function () {
  window.kurentoInitialize();
  window.kurentoManager.exitAudio();
};

// a function to check whether the browser (Chrome only) is in an isIncognito
// session. Requires 1 mandatory callback that only gets called if the browser
// session is incognito. The callback for not being incognito is optional.
// Attempts to retrieve the chrome filesystem API.
window.checkIfIncognito = function(isIncognito, isNotIncognito = function () {}) {
  isIncognito = Kurento.normalizeCallback(isIncognito);
  isNotIncognito = Kurento.normalizeCallback(isNotIncognito);

  var fs = window.RequestFileSystem || window.webkitRequestFileSystem;
  if (!fs) {
    isNotIncognito();
    return;
  }
  fs(window.TEMPORARY, 100, function() {isNotIncognito()}, function() {isIncognito()});
};

window.checkChromeExtInstalled = function (callback, chromeExtensionId) {
  callback = Kurento.normalizeCallback(callback);

  if (typeof chrome === "undefined" || !chrome || !chrome.runtime) {
    // No API, so no extension for sure
    callback(false);
    return;
  }
  chrome.runtime.sendMessage(
    chromeExtensionId,
    { getVersion: true },
    function (response) {
      if (!response || !response.version) {
        // Communication failure - assume that no endpoint exists
        callback(false);
        return;
      }
      callback(true);
    }
  );
};

window.getChromeScreenConstraints = function(callback, extensionId) {
  chrome.runtime.sendMessage(extensionId, {
    getStream: true,
    sources: [
      "screen"
    ]},
    function(response) {
      callback(response);
    });
};
