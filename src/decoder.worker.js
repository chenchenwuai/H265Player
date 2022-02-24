/* eslint-disable no-undef */
const DecoderStatus = {
	Idle: 0,
	Initializing: 1,
	Inited: 2,
	Ready: 3,
	Open: 4,
	Pause: 5,
	Closed: 6
}
const DecodeMessage = {
	DecoderCreated: 0,
	DecoderInit: 1,
	DecoderInited: 2,
	WasmLoaded: 3,
	DecoderReady: 4,
	DecoderOpenError: 5,
	DecoderStart: 6,
	DecoderStarted: 7,
	DecoderPause: 8,
	DecoderPaused: 9,
	DecoderClose: 10,
	DecoderClosed: 11,
	DecodeVideoBuffer: 12,
	DecodedVideoFrame: 13
}

let basePath = location.origin

self.Module = {
	onRuntimeInitialized: function () {
		onWasmLoaded()
	},
	locateFile: function (path) {
		return basePath + path
	}
}

self.onerror = function (e) {
	self.postMessage({
		type: DecodeMessage.DecoderOpenError,
		data: e
	})
}

// self.importScripts('libffmpeg_265.js')

// 实例化H265Decoder类
self.h265_decoder = new H265Decoder()
self.postMessage({
	type: DecodeMessage.DecoderCreated
})

self.onmessage = function (e) {
	var obj = e.data
	if (self.h265_decoder) {
		self.h265_decoder.onmessage(obj)
	} else {
		console.error('H265Decoder not initialized!')
	}
}

function onWasmLoaded() {
	if (self.h265_decoder) {
		self.h265_decoder.onWasmLoaded()
	} else {
		console.error('No decoder!')
	}
}

function H265Decoder() {
	this.TAG = 'H265Decoder'

	this.decoderStatus = DecoderStatus.Idle

	this.wasmLoaded = false
	this.enableDecode = false // 解析流开关

	this.accurateSeek = true
	this.cacheBuffer = null

	this.decodeTimer = null

	this.videoCallback = null

	this._lastTimestamp = 0
	this._lastDuration = 40

	this.debug = false
	this.coreLogLevel = 0 // js-0; wasm-1; ffmpeg-2
}

H265Decoder.prototype.initDecoder = function (config) {
	this._log('init decoder')
	this.debug = !!config.debug
	this.coreLogLevel = typeof config.logLevel !== 'undefined' ? config.logLevel : 0

	this.decoderStatus = DecoderStatus.Inited
	this._log('inited decoder', 'wasmLoaded', this.wasmLoaded, 'coreLogLevel', this.coreLogLevel)

	if (/^https?:\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?$/.test(config.baseLibPath)) {
		basePath = config.baseLibPath
	} else {
		basePath = location.origin + config.baseLibPath
	}
	self.importScripts(basePath + 'libffmpeg_265.js')
	if (this.wasmLoaded) {
		this.openDecoder()
	}
}

H265Decoder.prototype.openDecoder = function () {
	if (this.openedDecoder) {
		return
	}
	this.openedDecoder = true
	this._log('Open decoder')

	const videoCallback = Module.addFunction(function (addr_y, addr_u, addr_v, stride_y, stride_u, stride_v, width, height, pts) {
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
		self.postMessage({
			type: DecodeMessage.DecodedVideoFrame,
			data: {
				data: data.buffer,
				width,
				height,
				pts
			}
		}, [data.buffer])
	})

	const ret = Module._openDecoder(1, videoCallback, this.coreLogLevel)
	if (ret === 0) {
		this._log('Opened decoder')
		self.postMessage({
			type: DecodeMessage.DecoderReady
		})
		this.startDecoding()
	} else {
		self.postMessage({
			type: DecodeMessage.DecoderOpenError,
			data: {
				ret
			}
		})
		this._log('open decoder failed with error', ret)
		return
	}
}

H265Decoder.prototype.startDecoding = function () {
	this._log('Start decoding.')
	if (this.decoderStatus !== DecoderStatus.Closed) {
		this.enableDecode = true
		this.decoderStatus = DecoderStatus.Open
		self.postMessage({
			type: DecodeMessage.DecoderStarted
		})
	} else {
		this._log('Start decoding error. decoder already closed')
	}
}

H265Decoder.prototype.pauseDecoding = function () {
	this._log('Pause decoding.')
	if (this.decoderStatus !== DecoderStatus.Closed) {
		this.enableDecode = false
		this.decoderStatus = DecoderStatus.Pause
		self.postMessage({
			type: DecodeMessage.DecoderPaused
		})
	} else {
		this._log('Pause decoding error. decoder already closed')
	}
}

H265Decoder.prototype.closeDecoder = function () {
	this._log('closeDecoder.')
	this.enableDecode = false

	const ret = Module._closeDecoder()
	this.decoderStatus = DecoderStatus.Closed
	this._log('Close ffmpeg decoder return ' + ret + '.')

	self.postMessage({
		type: DecodeMessage.DecoderClosed
	})
}

H265Decoder.prototype.decode = function (data, timestamp) {
	var typedArray = new Uint8Array(data)
	var size = typedArray.length
	var cacheBuffer = Module._malloc(size)
	Module.HEAPU8.set(typedArray, cacheBuffer)
	var pts = this.getPTS(timestamp)
	this._log(`decode buffer, size:${size}, pts:${pts}`)
	Module._decodeData(cacheBuffer, size, pts)
	if (cacheBuffer != null) {
		Module._free(cacheBuffer)
		cacheBuffer = null
	}
}

H265Decoder.prototype.receiveBuffer = function (data, timestamp) {
	this._log(`Receive Buffer, enableDecode:${this.enableDecode} timestamp:${timestamp}`)
	this.enableDecode && this.decode(data, timestamp)
}

H265Decoder.prototype.getPTS = function (timestamp) {
	let duration = timestamp - this._lastTimestamp
	this._lastTimestamp = timestamp
	if (duration > 1000) {
		duration = 0
	} else if (duration < 0) {
		duration = this._lastDuration
	} else {
		this._lastDuration = duration
	}
	return duration
}

H265Decoder.prototype.onmessage = function (message) {
	switch (message.type) {
		case DecodeMessage.DecoderInit:
			this.initDecoder(message.config)
			break
		case DecodeMessage.DecoderStart:
			this.startDecoding()
			break
		case DecodeMessage.DecoderPause:
			this.pauseDecoding()
			break
		case DecodeMessage.DecoderClose:
			this.closeDecoder()
			break
		case DecodeMessage.DecodeVideoBuffer:
			this.receiveBuffer(message.data, message.timestamp)
			break
		default:
			console.error('Unsupport messsage ' + message.type)
	}
}

H265Decoder.prototype.onWasmLoaded = function () {
	this._log('Wasm loaded.')
	this.wasmLoaded = true
	if (this.decoderStatus === DecoderStatus.Inited) {
		this.openDecoder()
	}
}

H265Decoder.prototype._log = function () {
	if (!this.debug) return
	var now = new Date(Date.now())
	var hour = now.getHours()
	var min = now.getMinutes()
	var sec = now.getSeconds()
	var ms = now.getMilliseconds()
	var currentTimeStr = hour + ':' + min + ':' + sec + ':' + ms
	console.log(`[${currentTimeStr}][ ${this.TAG} ] : `, ...arguments) // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Function/arguments
}
