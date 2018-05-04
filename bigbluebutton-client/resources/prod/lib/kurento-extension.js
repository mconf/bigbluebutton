const isFirefox = typeof window.InstallTrigger !== 'undefined';
const isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
const isChrome = !!window.chrome && !isOpera;
const isSafari = navigator.userAgent.indexOf("Safari") >= 0 && !isChrome;
var logger = window.Logger || console;

// TODO sugestions on where to store this
const CONNECTION_ERROR = "CONNECTION_ERROR";
const SERVER_ERROR = "SERVER_ERROR";
const PEER_ERROR = "PEER_ERROR";
const SDP_ERROR = "SDP_ERROR";
const EXTENSION_ERROR = "EXTENSION_ERROR";
const SEND_ROLE = "send";
const RECV_ROLE = "recv";
const SFU_SCREENSHARE_APP = "screenshare";
const SFU_AUDIO_APP = "audio";
const ON_ICE_CANDIDATE_MSG = "onIceCandidate";
const START_MSG = "start";
const START_RESPONSE_MSG = "startResponse";
const PING_INTERVAL = 15000;

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

  this.vid_width = window.screen.width;
  this.vid_height = window.screen.height;

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
  this.kurentoAudio = null;
};

KurentoManager.prototype.exit = function () {
  logger.info("[exit] Exiting all Kurento apps");
  if (typeof this.kurentoScreenshare !== 'undefined' && this.kurentoScreenshare) {
    this.exitScreenShare();
  }

  if (typeof this.kurentoVideo !== 'undefined' && this.kurentoVideo) {
    this.exitVideo();
  }

  if (typeof this.kurentoAudio !== 'undefined' && this.kurentoAudio) {
    this.exitAudio();
  }
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
      kurentoManager.exit();
      self.onFail(CONNECTION_ERROR);
    };
    this.ws.onerror = (error) => {
      kurentoManager.exit();
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

    case START_RESPONSE_MSG:
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
      kurentoManager.exitScreenShare();
      break;
    case 'webRTCAudioSuccess':
      this.onSuccess(parsedMessage.success);
      break;
    case 'webRTCAudioError':
      this.onFail(parsedMessage.error);
      kurentoManager.exitAudio();
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
      case SFU_SCREENSHARE_APP:
        if (message.role === SEND_ROLE) {
          kurentoManager.exitScreenShare();
        }
        else if (message.role === RECV_ROLE) {
          kurentoManager.exitVideo();
        }
        break;

      case SFU_AUDIO_APP:
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
    return kurentoManager.exitScreenShare();
  }

  var message = {
    id : START_MSG,
    type: SFU_SCREENSHARE_APP,
    role: SEND_ROLE,
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
      return kurentoManager.exitScreenShare();
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

    // Exits via chrome extension or ongoing firefox permission denial
    const localStream = self.webRtcPeer.peerConnection.getLocalStreams()[0];
    localStream.getVideoTracks()[0].onended = function () {
      return kurentoManager.exitScreenShare();
    };

    localStream.getVideoTracks()[0].oninactive = function () {
      return kurentoManager.exitScreenShare();
    };
  });
};

Kurento.prototype.onIceCandidate = function (candidate) {
  let self = this;
  logger.debug("[onIceCandidate]", JSON.stringify(candidate));

  var message = {
    id : 'onIceCandidate',
    role: SEND_ROLE,
    type: SFU_SCREENSHARE_APP,
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
    role: RECV_ROLE,
    type: SFU_SCREENSHARE_APP,
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
        self.onFail(PEER_ERROR);
	return kurentoManager.exitVideo();
      }

      this.generateOffer(self.onOfferViewer.bind(self));
    });
  }
};

Kurento.prototype.onOfferViewer = function (error, offerSdp) {
  let self = this;
  if(error)  {
    logger.error("[onOfferViewer]", error);
    this.onFail(SDP_ERROR);
    return kurentoManager.exitVideo();
  }
  var message = {
    id : START_MSG,
    type: SFU_SCREENSHARE_APP,
    role: RECV_ROLE,
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
  //    type : SFU_SCREENSHARE_APP,
  //    voiceBridge: this.voiceBridge
  //  }
  //  this.sendMessage(message);
  //  this.dispose();
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
        self.onFail(PEER_ERROR);
	return kurentoManager.exitAudio();
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
    type: SFU_AUDIO_APP,
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
    this.onFail(SDP_ERROR);
    return kurentoManager.exitAudio();
  }

  var message = {
    id : 'start',
    type: SFU_AUDIO_APP,
    role: 'viewer',
    voiceBridge: self.voiceBridge,
    callerName : self.caller_id_name,
    sdpOffer : offerSdp,
    userId: self.userId,
    userName: self.userName,
    internalMeetingId: self.internalMeetingId
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

  // Limiting FPS to a range
  screenConstraints.video.frameRate = {min: 10, ideal: 15, max: 20};

  // Limiting max resolution to screen size
  screenConstraints.video.height = {max: window.screen.height};
  screenConstraints.video.width = {max: window.screen.width};

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
