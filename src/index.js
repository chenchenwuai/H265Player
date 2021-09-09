import { objectMerge, DECODE_STATUS, PLAYER_STATUS, createUniqueString } from './utils'
import WebGLPlayer from './webgl.js'
import EventEmitter from 'znu-event'
/**
 * `H265Player` constructor.
 *  H265Player 封装类
 *  Version  0.0.1
 */
class H265Player {
  
  constructor(config){

    this.TAG = 'H265Player'
    this.CLASS_ID = createUniqueString()

    this.canvas = null
    this.webglPlayer = null
    this.callback = null

    this.decodeStatus = DECODE_STATUS.Idle
    this.playerStatus = PLAYER_STATUS.Idle

    this.DECODER_H265 = 1

    this.decoding           = false
    this.frameBuffer        = []

    this.event = new EventEmitter()

    this.config = {
      decoderPath:'H265Decoder.js',
      isDebug: false
    }
    if (config) {
      this.config = objectMerge(this.config, config)
    }

    this.requestAnimationFrameId = null

    this.decodeWorker = null
    this.initDecodeWorker()

    this.registerVisibilityEvent(visible=> {
        if (visible) {
          this.playerStatus == PLAYER_STATUS.Playing && this.startDecoding();
        } else {
          this.playerStatus == PLAYER_STATUS.Playing && this.pauseDecoding();
        }
    });
  }

  initDecodeWorker(){
    this._Log("initDecoderWorker")
    var self = this
    this.decodeWorker = new Worker(this.config.decoderPath);
    this.decodeWorker.onmessage = function(e){
      var objData = e.data;
      self._Log('Get decodeWorker message',JSON.stringify(objData))
      switch(objData.type){
        case 'DECODER_INITED':
          self.onInitDecoder()
          break
        case 'WASM_LOADED':
          this.decodeWorker.postMessage({
            type:'OPEN_DECODER',
            config:{
              isDebug: !!this.config.isDebug,
              logLevel: !!this.config.isDebug ? 2 : 0
            }
          })
          break
        case 'DECODER_OPENED':
          self.onOpenDecoder()
          break
        case 'DECODER_OPEN_ERROR':
          self.onOpenDecoderError(objData.data)
          break
        case 'DECODER_DECODE_START':
          break
        case 'DECODE_VIDEO_FRAME':
          self.onVideoFrame(objData)
          break
      }
    }
  }

  play(canvas,callback){
    this._Log('Start Play')
    var res = {
      err:0,
      msg:'Success'
    }
    var success = true
    do {
      if (!canvas) {
        res.err = -2
        res.msg = 'Canvas not set'
        success = false
        this._Log("[ER] playVideo error, canvas empty.");
        break
      }
      if (!this.decodeWorker) {
        res.err = -4
        res.msg = 'Decoder not initialized'
        success = false
        this._Log("[ER] Decoder not initialized.")
        break
      }
  
      this.canvas = canvas
      this.callback = callback
  
      this.playerStatus = PLAYER_STATUS.Playing
  
      this.webglPlayer = new WebGLPlayer(this.canvas, {
        preserveDrawingBuffer: false
      })

      this.startDecoding()
      this.displayLoop()

    } while (false)
  
    return res
  }

  displayLoop(){
    this._Log('displayLoop')
    if (this.playerStatus !== PLAYER_STATUS.Idle) {
      this.requestAnimationFrameId = requestAnimationFrame(this.displayLoop.bind(this));
    }
    if (this.playerStatus !== PLAYER_STATUS.Playing) {
      return;
    }
    if (this.frameBuffer.length == 0) {
      return;
    }
  
    // requestAnimationFrame may be 60fps, if stream fps too large,
    // we need to render more frames in one loop, otherwise display
    // fps won't catch up with source fps, leads to memory increasing,
    // set to 2 now.
    for (let i = 0; i < 2; ++i) {
      var frame = this.frameBuffer[0];
      switch (frame.type) {
          case 'DECODE_VIDEO_FRAME':
              if (this.displayVideoFrame(frame)) {
                this.frameBuffer.shift();
              }
              break;
          default:
              return;
      }
  
      if (this.frameBuffer.length == 0) {
          break;
      }
    }
  }

  displayVideoFrame(frame) {
    if (this.playerStatus !== PLAYER_STATUS.Playing) {
      return false;
    }
  
    var width = frame.width
    var height = frame.height
  
    this.videoWidth = width
    this.videoHeight = height
    this.yLength = width * height
    this.uvLength = (width / 2) * (height / 2)
  
    var data = new Uint8Array(frame.data);
    this.renderVideoFrame(data);
    return true;
  }

  renderVideoFrame(data) {
    this.webglPlayer.renderFrame(data, this.videoWidth, this.videoHeight, this.yLength, this.uvLength);
    this.event.emit('renderProgress',{
      videoHeight:this.videoHeight,
      videoWidth:this.videoWidth
    })
  }

  onInitDecoder() {
    this._Log("init decoder response");
  }

  onOpenDecoder() {
    this._Log("open decoder response");
    this.startDecoding()
  }

  onOpenDecoderError(data) {
    console.error('open h265 decoder error',data)
  }

  decode(data,timestamp) {
    try {
      this._Log(`Decode Buffer, decoding:${this.decoding} timestamp:${timestamp}`)
      if(this.decoding){
        var objData = {
          type:'DECODER_FEED_BUFFER',
          data:data,
          timestamp:timestamp
        }
        this.decodeWorker.postMessage(objData,objData.data)
      }
    } catch (error) {
      console.error(error)
    }
    
  }

  startDecoding(){
    this.decoding = true
    this.decodeWorker.postMessage({ type:'DECODER_START_DECODE' })
    this._Log('Send Message: start decode')
  }

  pauseDecoding(){
    this.decoding = false
    this.decodeWorker.postMessage({ type:'DECODER_PAUSE_DECODE' })
    this._Log('Send Message: pause decode')
  }

  stopDecoding(){
    this.decoding = false
    this.decodeWorker.postMessage({ type:'DECODER_STOP_DECODE' })
    this._Log('Send Message: Finish decode')
  }

  
  bufferFrame(frame) {
    this.decoding && this.frameBuffer.push(frame)
  }

  onVideoFrame(frame) {
    this.bufferFrame(frame)
  }

  fullscreen() {
    if (this.webglPlayer) {
      this.webglPlayer.fullscreen()
    }
  }

  registerVisibilityEvent(cb) {
    var hidden = "hidden";

    // Standards:
    if (hidden in document) {
        document.addEventListener("visibilitychange", onchange);
    } else if ((hidden = "mozHidden") in document) {
        document.addEventListener("mozvisibilitychange", onchange);
    } else if ((hidden = "webkitHidden") in document) {
        document.addEventListener("webkitvisibilitychange", onchange);
    } else if ((hidden = "msHidden") in document) {
        document.addEventListener("msvisibilitychange", onchange);
    } else if ("onfocusin" in document) {
        // IE 9 and lower.
        document.onfocusin = document.onfocusout = onchange;
    } else {
        // All others.
        window.onpageshow = window.onpagehide = window.onfocus = window.onblur = onchange;
    }

    function onchange (evt) {
        var v = true;
        var h = false;
        var evtMap = {
            focus:v,
            focusin:v,
            pageshow:v,
            blur:h,
            focusout:h,
            pagehide:h
        };

        evt = evt || window.event;
        var visible = v;
        if (evt.type in evtMap) {
            visible = evtMap[evt.type];
        } else {
            visible = this[hidden] ? h : v;
        }
        cb(visible);
    }

    // set the initial state (but only if browser supports the Page Visibility API)
    if( document[hidden] !== undefined ) {
        onchange({type: document[hidden] ? "blur" : "focus"});
    }
  }

  async clean(){
    if(!this.cleaning){
      this.pauseDecoding()
    }
    if(this.requestAnimationFrameId){
      window.cancelAnimationFrame(this.requestAnimationFrameId)
    }

    this.canvas = null
    this.webglPlayer = null
    this.callback = null

    this.decodeStatus = DECODE_STATUS.Idle
    this.playerStatus = PLAYER_STATUS.Idle

    this.decoding           = false
    this.frameBuffer        = []

    if(this.event){
      await this.event.offAll()
    }

  }

  async destroy() {
    await this.stopDecoding()
    this.cleaning = true
    await this.clean()

  }

  on(name,listener){
    this.event.on(name,listener)
  }

  off(name,listener){
    this.event.off(name,listener)
  }

  _Log() {
    if (!this.config.isDebug) return
    var now = new Date(Date.now())
    var hour = now.getHours()
    var min = now.getMinutes()
    var sec = now.getSeconds()
    var ms = now.getMilliseconds()
    var currentTimeStr = hour + ":" + min + ":" + sec + ":" + ms
    console.log(`[${currentTimeStr}][ ${this.TAG}|${this.CLASS_ID} ] : `, ...arguments) // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Function/arguments
  }

  static isSupported(){
    try {
      return (typeof self.Worker !== 'undefined' && typeof self.WebGLRenderingContext !== 'undefined')
    } catch (e) {
      return false
    }
  }
}
if (window) window.H265Player = H265Player
export default H265Player