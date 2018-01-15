import React, { Component } from 'react';
import { styles } from './styles';
import { defineMessages, injectIntl } from 'react-intl';
import VideoService from './service';
import { log } from '/imports/ui/services/api';
import { notify } from '/imports/ui/services/notification';
import { toast } from 'react-toastify';
import Toast from '/imports/ui/components/toast/component';

const intlMessages = defineMessages({
  iceCandidateError: {
    id: 'app.video.iceCandidateError',
    description: 'Error message for ice candidate fail',
  },
  permissionError: {
    id: 'app.video.permissionError',
    description: 'Error message for webcam permission',
  },
  sharingError: {
    id: 'app.video.sharingError',
    description: 'Error on sharing webcam',
  },
  chromeExtensionError: {
    id: 'app.video.chromeExtensionError',
    description: 'Error message for Chrome Extension not installed',
  },
  chromeExtensionErrorLink: {
    id: 'app.video.chromeExtensionErrorLink',
    description: 'Error message for Chrome Extension not installed',
  },
});

class VideoElement extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    return <video id={`video-elem-${this.props.videoId}`} width={320} height={240} autoPlay={true} playsInline={true} />;
  }

  componentDidMount() {
    this.props.onMount(this.props.videoId, false);
  }
}

class VideoDock extends Component {
  constructor(props) {
    super(props);

    // Set a valid bbb-webrtc-sfu application server socket in the settings
    this.ws = new ReconnectingWebSocket(Meteor.settings.public.kurento.wsUrl);
    this.wsQueue = [];
    this.webRtcPeers = {};
    this.reconnectWebcam = false;
    this.reconnectList = [];
    this.sharedCameraTimeout = null;
    this.subscribedCamerasTimeouts = [];

    this.state = {
      videos: {},
      sharedWebcam : false,
    };

    this.unshareWebcam = this.unshareWebcam.bind(this);
    this.shareWebcam = this.shareWebcam.bind(this);

    this.onWsOpen = this.onWsOpen.bind(this);
    this.onWsClose = this.onWsClose.bind(this);
    this.onWsMessage = this.onWsMessage.bind(this);
  }

  setupReconnectVideos() {
    for (id in this.webRtcPeers) {
      this.disconnected(id);
      this.stop(id);
    }
  }

  reconnectVideos() {
    for (i in this.reconnectList) {
      const id = this.reconnectList[i];

      // TODO: base this on BBB API users instead of using memory
      if (id != this.myId) {
        setTimeout(() => {
          log('debug', ` [camera] Trying to reconnect camera ${id}`);
          this.start(id, false);
        }, 5000);
      }
    }

    if (this.reconnectWebcam) {
      log('debug', ` [camera] Trying to re-share ${this.myId} after reconnect.`);
      this.start(this.myId, true);
    }

    this.reconnectWebcam = false;
    this.reconnectList = [];
  }

  componentDidMount() {
    const ws = this.ws;
    const { users, userId } = this.props;

    for (let i = 0; i < users.length; i++) {
      if (users[i].has_stream && users[i].userId !== userId) {
        this.start(users[i].userId, false);
      }
    }

    document.addEventListener('joinVideo', this.shareWebcam.bind(this));// TODO find a better way to do this
    document.addEventListener('exitVideo', this.unshareWebcam.bind(this));
    document.addEventListener('installChromeExtension', this.installChromeExtension.bind(this));

    window.addEventListener('resize', this.adjustVideos);

    ws.addEventListener('message', this.onWsMessage);
  }

  componentWillMount () {
    this.ws.addEventListener('open', this.onWsOpen);
    this.ws.addEventListener('close', this.onWsClose);

    window.addEventListener('online', this.ws.open.bind(this.ws));
    window.addEventListener('offline', this.ws.close.bind(this.ws));
  }

  componentWillUnmount () {
    document.removeEventListener('joinVideo', this.shareWebcam);
    document.removeEventListener('exitVideo', this.unshareWebcam);
    document.removeEventListener('installChromeExtension', this.installChromeExtension);
    window.removeEventListener('resize', this.adjustVideos);

    this.ws.removeEventListener('message', this.onWsMessage);
    this.ws.removeEventListener('open', this.onWsOpen);
    this.ws.removeEventListener('close', this.onWsClose);
    // Close websocket connection to prevent multiple reconnects from happening

    window.removeEventListener('online', this.ws.open);
    window.removeEventListener('offline', this.ws.close);

    this.ws.close();
  }

  adjustVideos () {
    setTimeout(() => {
      window.adjustVideos('webcamArea', true);
    }, 0);
  }

  onWsOpen () {
    log('debug', '------ Websocket connection opened.');

    // -- Resend queued messages that happened when socket was not connected
    while (this.wsQueue.length > 0) {
      this.sendMessage(this.wsQueue.pop());
    }

    this.reconnectVideos();
  }

  onWsClose (error) {
    log('debug', '------ Websocket connection closed.');

    this.setupReconnectVideos();
  }

  onWsMessage (msg) {
    const { intl } = this.props;
    const parsedMessage = JSON.parse(msg.data);

    console.log('Received message new ws message: ');
    console.log(parsedMessage);

    switch (parsedMessage.id) {

      case 'startResponse':
        this.startResponse(parsedMessage);
        break;

      case 'error':
        this.handleError(parsedMessage);
        break;

      case 'playStart':
        this.handlePlayStart(parsedMessage);
        break;

      case 'playStop':
        this.handlePlayStop(parsedMessage);

        break;

      case 'iceCandidate':

        const webRtcPeer = this.webRtcPeers[parsedMessage.cameraId];

        if (webRtcPeer !== null) {
          if (webRtcPeer.didSDPAnswered) {
            webRtcPeer.addIceCandidate(parsedMessage.candidate, (err) => {
              if (err) {
                this.notifyError(intl.formatMessage(intlMessages.iceCandidateError));
                return log('error', `Error adding candidate: ${err}`);
              }
            });
          } else {
            webRtcPeer.iceQueue.push(parsedMessage.candidate);
          }
        } else {
          log('error', ' [ICE] Message arrived before webRtcPeer?');
        }
        break;
    }
  };

  start(id, shareWebcam) {
    const that = this;

    console.log(`Starting video call for video: ${id} with ${shareWebcam}`);

    if (shareWebcam) {
      VideoService.joiningVideo();
      this.setState({sharedWebcam: true});
      this.myId = id;
      this.initWebRTC(id, true);
    } else {
      // initWebRTC with shareWebcam false will be called after react mounts the element
      this.createVideoTag(id);
    }
  }

  initWebRTC(id, shareWebcam) {
    let that = this;
    const { intl } = this.props;

    const onIceCandidate = function (candidate) {
      const message = {
        type: 'video',
        role: shareWebcam ? 'share' : 'viewer',
        id: 'onIceCandidate',
        candidate,
        cameraId: id,
      };
      that.sendMessage(message);
    };

    let videoConstraints = {};
    if (!!navigator.userAgent.match(/Version\/[\d\.]+.*Safari/)) { // Custom constraints for Safari
      videoConstraints = {
        width: {min:320, max:640},
        height: {min:240, max:480}
      }
    } else {
      videoConstraints = {
        width: {min: 320, ideal: 320},
        height: {min: 240, ideal:240},
        frameRate: {min: 5, ideal: 10}
      };
    }

    let options = {
      mediaConstraints: {
        audio: false,
        video: videoConstraints
      },
      onicecandidate: onIceCandidate,
    };

    let peerObj;
    if (shareWebcam) {
      options.localVideo = this.refs.videoInput;
      peerObj = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly;
    } else {
      peerObj = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly;
      options.remoteVideo = document.getElementById(`video-elem-${id}`);
    }

    let webRtcPeer = new peerObj(options, function (error) {
      if (error) {
        log('error', ' WebRTC peerObj create error');
        log('error', error);
        that.notifyError(intl.formatMessage(intlMessages.permissionError));
        /* This notification error is displayed considering kurento-utils 
         * returned the error 'The request is not allowed by the user agent 
         * or the platform in the current context.', but there are other
         * errors that could be returned. */

        that.destroyWebRTCPeer(id);
        that.destroyVideoTag(id);
        VideoService.resetState();
        return log('error', error);
      }

      this.didSDPAnswered = false;
      this.iceQueue = [];

      that.webRtcPeers[id] = webRtcPeer;
      if (shareWebcam) {
        that.sharedWebcam = webRtcPeer;
      }

      this.generateOffer((error, offerSdp) => {
        if (error) {
          log('error', ' WebRtc generate offer error');

          that.destroyWebRTCPeer(id);
          that.destroyVideoTag(id);

          return log('error', error);
        }

        console.log(`Invoking SDP offer callback function ${location.host}`);
        const message = {
          type: 'video',
          role: shareWebcam ? 'share' : 'viewer',
          id: 'start',
          sdpOffer: offerSdp,
          cameraId: id,
        };
        that.sendMessage(message);
      });
      while (this.iceQueue.length) {
        let candidate = this.iceQueue.shift();
        this.addIceCandidate(candidate, (err) => {
          if (err) {
            this.notifyError(intl.formatMessage(intlMessages.iceCandidateError));
            return console.error(`Error adding candidate: ${err}`);
          }
        });
      }
      this.didSDPAnswered = true;
    });
  }

  disconnected(id) {
    if (this.sharedWebcam) {
      log('debug', ' [camera] Webcam disconnected, will try re-share webcam later.');
      this.reconnectWebcam = true;
    } else {
      this.reconnectList.push(id);

      log('debug', ` [camera] ${id} disconnected, will try re-subscribe later.`);
    }
  }

  stop(id) {
    const { userId } = this.props;
    this.sendMessage({
      type: 'video',
      role: id == userId ? 'share' : 'viewer',
      id: 'stop',
      cameraId: id,
    });

    this.destroyWebRTCPeer(id);
    this.destroyVideoTag(id);
  }

  createVideoTag(id) {
    let videos = this.state.videos;

    videos[id] = true;
    this.setState({videos: videos})
  }

  destroyVideoTag(id) {
    let videos = this.state.videos;

    delete videos[id];
    this.setState({videos: videos});

    if (id == this.myId) {
      this.setState({sharedWebcam: false});
    }
  }

  destroyWebRTCPeer(id) {
    const webRtcPeer = this.webRtcPeers[id];

    if (webRtcPeer) {
      log('info', 'Stopping WebRTC peer');

      if (id == this.myId && this.sharedWebcam) {
        this.sharedWebcam.dispose();
        this.sharedWebcam = null;
      }

      webRtcPeer.dispose();
      delete this.webRtcPeers[id];
    } else {
      log('info', 'No WebRTC peer to stop (not an error)');
    }
  }

  shareWebcam() {
    const { users, userId } = this.props;

    if (this.connectedToMediaServer()) {
      this.start(userId, true);
    } else {
      log("error", "Not connected to media server");
    }
  }

  unshareWebcam() {
    VideoService.exitingVideo();
    log('info', 'Unsharing webcam');
    const { userId } = this.props;
    VideoService.sendUserUnshareWebcam(userId);
    VideoService.exitedVideo();
  }

  startResponse(message) {
    const id = message.cameraId;
    const webRtcPeer = this.webRtcPeers[id];

    if (message.sdpAnswer == null) {
      return log('debug', 'Null sdp answer. Camera unplugged?');
    }

    if (webRtcPeer == null) {
      return log('debug', 'Null webrtc peer ????');
    }

    log('info', 'SDP answer received from server. Processing ...');

    webRtcPeer.processAnswer(message.sdpAnswer, (error) => {
      if (error) {
        return log('error', error);
      }
    });

    if (message.cameraId == this.props.userId) {
      log('info', "camera id sendusershare ", id);
      VideoService.sendUserShareWebcam(id);
    }
  }

  sendMessage(message) {
    const ws = this.ws;

    if (this.connectedToMediaServer()) {
      const jsonMessage = JSON.stringify(message);
      console.log(`Sending message: ${jsonMessage}`);
      ws.send(jsonMessage, (error) => {
        if (error) {
          console.error(`client: Websocket error "${error}" on message "${jsonMessage.id}"`);
        }
      });
    } else {
      // No need to queue video stop messages
      if (message.id != 'stop') {
        this.wsQueue.push(message);
      }
    }
  }

  connectedToMediaServer() {
    return this.ws.readyState === WebSocket.OPEN;
  }

  connectionStatus() {
    return this.ws.readyState;
  }

  handlePlayStop(message) {
    log('info', 'Handle play stop <--------------------');
    log('error', message);

    const { users } = this.props;

    if (message.cameraId == this.props) {
      this.unshareWebcam();
    } else {
      this.stop(message.cameraId);
    }
  }

  handlePlayStart(message) {
    log('info', 'Handle play start <===================');

    if (message.cameraId == this.props.userId) {
      log('info', "Dae ze caralhow ");
      VideoService.joinedVideo();
    }
  }

  handleError(message) {
    const { intl } = this.props;
    this.notifyError(intl.formatMessage(intlMessages.sharingError));

    console.error(' Handle error --------------------->');
    log('debug', message.message);
  }

  notifyError(message) {
    notify(message, 'error', 'video');
  }

  installChromeExtension() {
    const { intl } = this.props;
    const CHROME_EXTENSION_LINK = Meteor.settings.public.kurento.chromeExtensionLink;

    this.notifyError(<div>{intl.formatMessage(intlMessages.chromeExtensionError)} <a href={CHROME_EXTENSION_LINK} target="_blank">{intl.formatMessage(intlMessages.chromeExtensionErrorLink)}</a></div>);
  }

  componentDidUpdate() {
    this.adjustVideos();
  }

  render() {
    let cssClass;
    if (this.state.sharedWebcam) {
      cssClass = styles.sharedWebcamVideoLocal;
    }
    else {
      cssClass = styles.sharedWebcamVideo;
    }

    return (

      <div className={styles.videoDock}>
        <div id="webcamArea">
          {Object.keys(this.state.videos).map((id) => {
            return (<VideoElement videoId={id} key={id} onMount={this.initWebRTC.bind(this)} />);
          })}
          <video autoPlay={true} playsInline={true} muted={true} id="shareWebcamVideo" className={cssClass} ref="videoInput" />
        </div>
      </div>
    );
  }

  shouldComponentUpdate(nextProps, nextState) {
    const { users, userId } = this.props;
    const nextUsers = nextProps.users;

    if (users) {
      let suc = false;

      for (let i = 0; i < users.length; i++) {
        if (users && users[i] &&
              nextUsers && nextUsers[i]) {
          if (users[i].has_stream !== nextUsers[i].has_stream) {
            console.log(`User ${nextUsers[i].has_stream ? '' : 'un'}shared webcam ${users[i].userId}`);

            if (nextUsers[i].has_stream) {
              if (userId !== users[i].userId) {
                this.start(users[i].userId, false);
              }
            } else {
              this.stop(users[i].userId);
            }

            if (!nextUsers[i].has_stream) {
              this.destroyVideoTag(users[i].userId);
            }

            suc = suc || true;
          }
        }
      }

      return true;
    }

    return false;
  }

}

export default injectIntl(VideoDock);
