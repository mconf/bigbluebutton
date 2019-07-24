import React, { Component } from 'react'

const MATCH_URL = new RegExp("https?:\/\/(video.*\.rnp\.br)/portal/video\.action\?.*idItem=([0-9]+).*");

const EMBED_PATH = "/portal/embed-video?idItem="

export class VideoRNP extends Component {
  static displayName = 'VideoRNP'

  static canPlay = url => {
    return MATCH_URL.test(url)
  }

  load() {
    console.log('load');
  }

  constructor(props) {
    super(props);

    this.updateCurrentTime = this.updateCurrentTime.bind(this);
  } 

  duration = null
  currentTime = null
  secondsLoaded = null

  onComponentDidMount() {
    window.addEventListener("onPlay", this.props.onPlay, false); 
    window.addEventListener("onPause", this.props.onPause, false); 
    window.addEventListener("onTime", this.updateCurrentTime, false); 
  }

  updateCurrentTime(e) {
    console.log("Update current time");
    console.log(e);
  }

  getVideoId() {
    const { url } = this.props;
    const m = url.match(MATCH_URL);
    return m && m[2];
  }

  getHostUrl() {
    const { url } = this.props;
    const m = url.match(MATCH_URL);
    return m && m[1];
  }

  getEmbedUrl() {
    return this.getHostUrl() + EMBED_PATH + this.getVideoId() + "&remoteControl=true";
  }

  play() {

    console.log("WANTS TO PLAU");
  }

  pause() {
    console.log("WANTS TO PAUSE");
  }

  stop() {

   console.log("NOP");
  }

  seekTo(seconds) {
    console.log("SEEK TO ", seconds);

    window.postMessage("seek", seconds);
  }

  setVolume(fraction) {
    console.log("SET VOLUME");
  }

  setLoop(loop) {

    console.log("SET LOOP");
  }

  mute = () => {

    console.log("SET MUTE");
  }

  unmute = () => {

    console.log("SET UNMUTE");
  }

  getDuration() {
    console.log("GET DURATION");
  }

  getCurrentTime () {
    console.log("GET CURRENT TIME");
    return currentTime;
  }

  getSecondsLoaded () {
    console.log("GET SECONDS LOADED");
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
          ref={(container) => { this.container = container; } }
        />
      </div>
    )
  }
}

export default VideoRNP;

