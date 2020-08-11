self.Module = {
  onRuntimeInitialized: function() {
    console.log('Module onRuntimeInitialized')
    onWasmLoaded()
  }
}

self.importScripts('libffmpeg_265.js')

function H265Decoder(config) {
  this.TAG = 'H265Decoder'
  this.coreLogLevel = 2// js-0; wasm-1; ffmpeg-2
  this.accurateSeek = true
  this.wasmLoaded = false
  this.cacheBuffer = null
  this.decodeTimer = null
  this.videoCallback = null
  this.first_timestamp = 0
  this.config = {
    isDebug: false,
    DECODER_H265: 1,
    DECODE_MESSAGE: {}
  }

  if (config) {
    console.log('CONFIG', config)
    this.config.isDebug = !!config.isDebug
    config.DECODER_H265 !== undefined && (this.config.DECODER_H265 = config.DECODER_H265)
    config.DECODE_MESSAGE !== undefined && (this.config.DECODE_MESSAGE = config.DECODE_MESSAGE)
    config.logLevel !== undefined && (this.coreLogLevel = config.logLevel)
  }

  this.enableDecode = false

  this.initDecoder()
}

H265Decoder.prototype.initDecoder = function() {
  this._Log('Decode inited')
  var obj = {
    type: this.config.DECODE_MESSAGE.InitDecodeREQ
  }
  self.postMessage(obj)
}

H265Decoder.prototype.openDecoder = function() {
  this._Log('Open Decode')
  var _this = this
  var videoCallback = Module.addFunction(function(addr_y, addr_u, addr_v, stride_y, stride_u, stride_v, width, height, pts) {
    const size = width * height + (width / 2) * (height / 2) + (width / 2) * (height / 2)
    const data = new Uint8Array(size)
    let pos = 0
    for (let i = 0; i < height; i++) {
      const src = addr_y + i * stride_y
      let tmp = HEAPU8.subarray(src, src + width)
      tmp = new Uint8Array(tmp)
      data.set(tmp, pos)
      pos += tmp.length
    }
    for (let i = 0; i < height / 2; i++) {
      const src = addr_u + i * stride_u
      let tmp = HEAPU8.subarray(src, src + width / 2)
      tmp = new Uint8Array(tmp)
      data.set(tmp, pos)
      pos += tmp.length
    }
    for (let i = 0; i < height / 2; i++) {
      const src = addr_v + i * stride_v
      let tmp = HEAPU8.subarray(src, src + width / 2)
      tmp = new Uint8Array(tmp)
      data.set(tmp, pos)
      pos += tmp.length
    }
    var objData = {
      type: _this.config.DECODE_MESSAGE.VideoFrameREQ,
      data: data.buffer,
      width,
      height,
      pts
    }
    self.postMessage(objData, objData.data)
  })

  var ret = Module._openDecoder(this.config.DECODER_H265, videoCallback, this.coreLogLevel)
  this.startDecoding()
  if (ret == 0) {
    var obj = {
      type: this.config.DECODE_MESSAGE.OpenDecodeREQ
    }
    self.postMessage(obj)
  } else {
    console.error('openDecoder failed with error', ret)
    return
  }
}

H265Decoder.prototype.startDecoding = function(interval) {
  this._Log('Start decoding.')
  this.enableDecode = true
  self.postMessage({ type: this.config.DECODE_MESSAGE.StartDecodeREQ })
}

H265Decoder.prototype.pauseDecoding = function() {
  this._Log('Pause decoding.')
  this.enableDecode = false
  self.postMessage({ type: this.config.DECODE_MESSAGE.PauseDecodeREQ })
}

H265Decoder.prototype.closeDecoder = function() {
  this._Log('closeDecoder.')
  this.enableDecode = false

  var ret = Module._closeDecoder()
  this._Log('Close ffmpeg decoder return ' + ret + '.')

  self.postMessage({ type: this.config.DECODE_MESSAGE.CloseDecodeREQ })
}

H265Decoder.prototype.decode = function(data, timestamp) {
  var typedArray = new Uint8Array(data)
  var size = typedArray.length
  var cacheBuffer = Module._malloc(size)
  Module.HEAPU8.set(typedArray, cacheBuffer)
  var pts = this.getPTS(timestamp)
  Module._decodeData(cacheBuffer, size, pts)
  if (cacheBuffer != null) {
    Module._free(cacheBuffer)
    cacheBuffer = null
  }
}

H265Decoder.prototype.receiveBuffer = function(data, timestamp) {
  this._Log(`Receive Buffer, enableDecode:${this.enableDecode} timestamp:${timestamp}`)
  this.enableDecode && this.decode(data, timestamp)
}

H265Decoder.prototype.getPTS = function(timestamp) {
  if (this.first_timestamp !== undefined) {
    return timestamp - this.first_timestamp
  } else {
    this.first_timestamp = timestamp
    return 0
  }
}

H265Decoder.prototype.onmessage = function(message) {
  this._Log(`Get message, type:${message.type}`)
  switch (message.type) {
    case this.config.DECODE_MESSAGE.StartDecodeRES:
      this.startDecoding()
      break
    case this.config.DECODE_MESSAGE.FeedDataRES:
      this.receiveBuffer(message.data, message.timestamp)
      break
    case this.config.DECODE_MESSAGE.PauseDecodeRES:
      this.pauseDecoding()
      break
    case this.config.DECODE_MESSAGE.CloseDecodeRES:
      this.closeDecoder()
      break
    default:
      console.error('Unsupport messsage ' + message.type)
  }
}

// wasm 文件加载 并监听worker message
H265Decoder.prototype.onWasmLoaded = function() {
  console.log('Wasm loaded.')
  this.wasmLoaded = true
  this.openDecoder()
}

H265Decoder.prototype._Log = function() {
  if (!this.config.isDebug) return
  var now = new Date(Date.now())
  var hour = now.getHours()
  var min = now.getMinutes()
  var sec = now.getSeconds()
  var ms = now.getMilliseconds()
  var currentTimeStr = hour + ':' + min + ':' + sec + ':' + ms
  console.log(`[${currentTimeStr}][ ${this.TAG} ] : `, ...arguments) // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Function/arguments
}

self.onmessage = function(e) {
  var obj = e.data
  if (obj.type === 'INIT_DECODE') {
    self.h265_decoder = new H265Decoder(obj.config)
    return
  }
  if (!self.h265_decoder) {
    console.error('H265Decoder not initialized!')
    return
  }
  if (!self.h265_decoder.wasmLoaded) {
    console.error('WASM File not download!')
    return
  }
  self.h265_decoder.onmessage(obj)
}

function onWasmLoaded() {
  console.log('Module onWasmLoaded', self.h265_decoder)
  if (self.h265_decoder) {
    self.h265_decoder.onWasmLoaded()
  } else {
    console.error('No decoder!')
  }
}
