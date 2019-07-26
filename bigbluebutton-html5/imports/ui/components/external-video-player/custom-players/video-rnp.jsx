import React, { Component } from 'react'

const MATCH_URL = new RegExp("https?:\/\/(video.*\.rnp\.br)/portal/video\.action\?.*idItem=([0-9]+).*");

const EMBED_PATH = "/portal/embed-video?idItem="

export class VideoRNP extends Component {
  static displayName = 'VideoRNP'

  static canPlay = url => {
    return MATCH_URL.test(url)
  }

  constructor(props) {
    super(props);

    this.currentTime = 0;
    this.updateCurrentTime = this.updateCurrentTime.bind(this);
    this.getCurrentTime = this.getCurrentTime.bind(this);
    this.handleEvent = this.handleEvent.bind(this);
    this.postMessage = this.postMessage.bind(this);
  }

  handleEvent(event) {

    if (event.origin !== this.getHostUrl()) {
      return;
    }

    let data = JSON.parse(event.data);
    if (data.event === 'onPlay') {
      return this.props.onPlay && this.props.onPlay();
    } else if (data.event === 'onPause') {
      return this.props.onPause && this.props.onPause();
    } else if (data.event === 'onTime') {
      return this.updateCurrentTime(data.playerPosition);
    }
  }

  load() {
    window.addEventListener("message", this.handleEvent, false);
  }

  updateCurrentTime(e) {
    this.currentTime = e;
  }

  getVideoId() {
    const { url } = this.props;
    const m = url.match(MATCH_URL);
    return m && m[2];
  }

  getHostUrl() {
    const { url } = this.props;
    const m = url.match(MATCH_URL);
    return m && 'https://' + m[1];
  }

  getEmbedUrl() {
    return this.getHostUrl() + EMBED_PATH + this.getVideoId() + "&autostart=true&remoteControl=" + this.props.remoteControl;
  }

  postMessage(obj) {
    if (this.container && this.container.contentWindow) {
      this.container.contentWindow.postMessage(JSON.stringify(obj), "*");
    }
  }

  play() {
    this.postMessage({event: 'play'});
  }

  pause() {
    this.postMessage({event: 'pause'});
  }

  stop() {
    // TODO: STOP
  }

  seekTo(seconds) {
    this.postMessage({event: 'seek', playerPosition: seconds});
  }

  setVolume(fraction) {
    // console.log("SET VOLUME");
  }

  setLoop(loop) {
    // console.log("SET LOOP");
  }

  mute() {
    // console.log("SET MUTE");
  }

  unmute() {
    // console.log("SET UNMUTE");
  }

  getDuration() {
    //console.log("GET DURATION");
  }

  getCurrentTime () {
    //console.log("GET CURRENT TIME");
    return this.currentTime;
  }

  getSecondsLoaded () {
    //console.log("GET SECONDS LOADED");
  }

  render () {
    const style = {
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      backgroundColor: 'black'
    }
    return (
      <div
        key={this.props.url}
        ref={this.ref}
        style={style}>
        <iframe
          width="100%"
          height="100%"
          src={this.getEmbedUrl()}
          allowFullScreen={true}
          frameBorder="0"
          scrolling="0"
          ref={(container) => {
            this.container = container;
            this.props.onReady();
          }}
        />
      </div>
    )
  }
}

export default VideoRNP;

