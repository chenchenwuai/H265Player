import {
	DecoderStatus,
	DecodeMessage,
	PlayerStatus,
	DECODE_STATUS,
	createUniqueString,
	log
} from './utils'
import WebGLPlayer from './webgl.js'
import EventEmitter from 'znu-event'
import Worker from 'web-worker:./decoder.worker'

class H265Player {
	constructor(canvas, config) {
		this.TAG = 'H265Player'
		this.CLASS_ID = createUniqueString()

		this.playerStatus = PlayerStatus.Idle
		this.frameBuffer = []
		this.webglPlayer = null

		this.videoWidth = 0
		this.videoHeight = 0

		this.decodeWorker = null
		this.decoderStatus = DecoderStatus.Idle

		this.event = new EventEmitter()

		this.config = {
			baseLibPath: '/lib/',
			decoderLogLevel: 0,
			debug: false
		}
		if (config) {
			this.config = Object.assign({}, this.config, config)
		}

		this.requestAnimationFrameId = null

		this._receiveFirstRenderProgress = false

		this.initDecodeWorker()
		this.initWebglPlayer(canvas)

		this.registerVisibilityEvent((visible) => {
			if (visible) {
				this.playerStatus === PlayerStatus.Playing && this.startDecoding()
			} else {
				this.playerStatus === PlayerStatus.Playing && this.pauseDecoding()
			}
		})
	}

	// 初始化 decoder worker
	initDecodeWorker() {
		this._log('init decoder')
		var self = this
		this.decodeWorker = new Worker()

		// 监听 worker 发送过来的消息
		this.decodeWorker.onmessage = function (e) {
			const { type, data = {} } = e.data
			switch (type) {
				// 解析器创建完成
				case DecodeMessage.DecoderCreated:
					self._initDecoder()
					break
				// 解析器初始化已准备好
				case DecodeMessage.DecoderReady:
					self._onDecoderReady()
					break
				// 解析器开启解析
				case DecodeMessage.DecoderStarted:
					self._onStartDecoding()
					break
				// 解析器暂停解析
				case DecodeMessage.DecoderPaused:
					self._onPauseDecoding()
					break
				// 解析器结束解析
				case DecodeMessage.DecoderClosed:
					self._onCloseDecoding()
					break
				// 解析器打开错误
				case DecodeMessage.DecoderOpenError:
					self._onDecoderOpenError(data)
					break
				// 解析器解析出来的帧数据
				case DecodeMessage.DecodedVideoFrame:
					self._onVideoFrame(data)
					break
			}
		}
	}

	// 初始化解析器
	_initDecoder() {
		this.decoderStatus = DecoderStatus.Initializing
		this._log('decoder initiailizing')
		this.decodeWorker.postMessage({
			type: DecodeMessage.DecoderInit,
			config: {
				debug: !!this.config.debug,
				baseLibPath: this.config.baseLibPath,
				logLevel: this.config.decoderLogLevel
			}
		})
	}

	// 监听到解析器已准备好
	_onDecoderReady() {
		this.decoderStatus = DecoderStatus.Ready
		this._log('decoder ready')
		if (this.webglPlayer && this.playerStatus === PlayerStatus.Idle) {
			this._onPlayerReady()
		}
	}

	// 监听到解析器打开错误
	_onDecoderOpenError(e) {
		this._log('decoder open error: ', e)
		this.decoderStatus = DECODE_STATUS.Closed
		this.emit('error', new Error(e))
	}

	// 播放器已准备好
	_onPlayerReady() {
		this.playerStatus = PlayerStatus.Ready
		this._log('player ready')
		this.emit('ready')
	}

	start() {
		if (this.playerStatus !== PlayerStatus.Ready) {
			this._log('player not ready')
			return
		}
		this._displayLoop()
		this.playerStatus = PlayerStatus.Playing
	}

	// 初始化 webgl player
	initWebglPlayer(canvas) {
		this._log('init webgl player')
		if (!canvas) {
			this.emit('error', new Error('Not Valid Canvas'))
			return
		}
		this.canvas = canvas
		this.webglPlayer = new WebGLPlayer(canvas, {
			preserveDrawingBuffer: false
		})
		if (
			this.decoderStatus === DecoderStatus.Ready &&
			this.playerStatus === PlayerStatus.Idle
		) {
			this._onPlayerReady()
		}
	}

	// 解析器开启解析
	startDecoding() {
		this.decodeWorker.postMessage({
			type: DecodeMessage.DecoderStart
		})
		this.playerStatus = PlayerStatus.Playing
	}
	_onStartDecoding() {
		this.decoderStatus = DecoderStatus.Open
	}

	// 解析器暂停解析
	pauseDecoding() {
		this.decodeWorker.postMessage({
			type: DecodeMessage.DecoderPause
		})
		this.playerStatus = PlayerStatus.Pause
	}
	_onPauseDecoding() {
		this.decoderStatus = DecoderStatus.Pause
	}

	// 解析器结束解析
	closeDecoding() {
		this.decodeWorker.postMessage({
			type: DecodeMessage.DecoderClose
		})
		this.playerStatus = PlayerStatus.Pause
	}
	_onCloseDecoding() {
		this.decoderStatus = DecoderStatus.Closed
	}

	play() {
		this.startDecoding()
		this.emit('play')
	}
	pause() {
		this.pauseDecoding()
		this.emit('pause')
	}

	feed(data, timestamp) {
		try {
			if (this.decoderStatus === DecoderStatus.Open) {
				this._log(`Decode Buffer, timestamp:${timestamp}`)
				this.decodeWorker.postMessage(
					{
						type: DecodeMessage.DecodeVideoBuffer,
						data,
						timestamp
					},
					[data]
				) // 最后一个参数data，表示将 data 的数据控制权完全移交给 worker
			} else {
				this._log(
					`ignore decode buffer, timestamp:${timestamp}, decoder open:${this.decoderStatus === DecoderStatus.Open
					}`
				)
			}
		} catch (error) {
			console.error(error)
		}
	}

	_onVideoFrame(frame) {
		this.frameBuffer.push(frame)
	}

	_displayLoop() {
		if (this.playerStatus !== PlayerStatus.Idle) {
			this.requestAnimationFrameId = requestAnimationFrame(
				this._displayLoop.bind(this)
			)
		}
		if (this.playerStatus !== PlayerStatus.Playing) {
			return
		}
		if (this.frameBuffer.length === 0) {
			return
		}

		// requestAnimationFrame may be 60fps, if stream fps too large,
		// we need to render more frames in one loop, otherwise display
		// fps won't catch up with source fps, leads to memory increasing,
		// set to 2 now.
		for (let i = 0; i < 2; ++i) {
			var frame = this.frameBuffer[0]
			if (this.displayVideoFrame(frame)) {
				this.frameBuffer.shift()
			}

			if (this.frameBuffer.length === 0) {
				break
			}
		}
	}

	_cleanDisplayLoop() {
		if (this.requestAnimationFrameId) {
			window.cancelAnimationFrame(this.requestAnimationFrameId)
		}
	}

	displayVideoFrame(frame) {
		if (this.playerStatus !== PlayerStatus.Playing) {
			return false
		}

		var width = frame.width
		var height = frame.height

		if (this.videoWidth !== width || this.videoHeight !== height) {
			this.emit('size', { width, height })
		}

		this.videoWidth = width
		this.videoHeight = height
		this.yLength = width * height
		this.uvLength = (width / 2) * (height / 2)

		var data = new Uint8Array(frame.data)
		this.renderVideoFrame(data)
		return true
	}

	renderVideoFrame(data) {
		this.webglPlayer.renderFrame(
			data,
			this.videoWidth,
			this.videoHeight,
			this.yLength,
			this.uvLength
		)
		if (!this._receiveFirstRenderProgress) {
			this._receiveFirstRenderProgress = true
			this.emit('play')
		}
	}

	fullscreen() {
		if (this.webglPlayer) {
			this.webglPlayer.fullscreen()
		}
	}

	registerVisibilityEvent(cb) {
		var hidden = 'hidden'

		// Standards:
		if (hidden in document) {
			document.addEventListener('visibilitychange', onchange)
		} else if ((hidden = 'mozHidden') in document) {
			document.addEventListener('mozvisibilitychange', onchange)
		} else if ((hidden = 'webkitHidden') in document) {
			document.addEventListener('webkitvisibilitychange', onchange)
		} else if ((hidden = 'msHidden') in document) {
			document.addEventListener('msvisibilitychange', onchange)
		} else if ('onfocusin' in document) {
			// IE 9 and lower.
			document.onfocusin = document.onfocusout = onchange
		} else {
			// All others.
			window.onpageshow =
				window.onpagehide =
				window.onfocus =
				window.onblur =
				onchange
		}

		function onchange(evt) {
			var v = true
			var h = false
			var evtMap = {
				focus: v,
				focusin: v,
				pageshow: v,
				blur: h,
				focusout: h,
				pagehide: h
			}

			evt = evt || window.event
			var visible = v
			if (evt.type in evtMap) {
				visible = evtMap[evt.type]
			} else {
				visible = this[hidden] ? h : v
			}
			cb(visible)
		}

		// set the initial state (but only if browser supports the Page Visibility API)
		if (document[hidden] !== undefined) {
			onchange({
				type: document[hidden] ? 'blur' : 'focus'
			})
		}
	}

	async clean() {
		if (!this.cleaning) {
			this.pauseDecoding()
		}
		this._cleanDisplayLoop()

		this.canvas = null
		this.webglPlayer = null
		this.callback = null

		this.decoderStatus = DECODE_STATUS.Idle
		this.playerStatus = PlayerStatus.Idle

		this.decoding = false
		this.frameBuffer = []

		this._receiveFirstRenderProgress = false

		this.emit('pause')

		if (this.decodeWorker) {
			this.decodeWorker.terminate()
		}

		if (this.event) {
			await this.event.offAll()
		}
	}

	async destroy() {
		await this.closeDecoding()
		this.cleaning = true
		await this.clean()
	}

	on(name, listener) {
		this.event.on(name, listener)
	}

	off(name, listener) {
		this.event.off(name, listener)
	}

	emit() {
		this.event.emit(...arguments)
	}

	_log() {
		if (!this.config.debug) return
		log(this.TAG, this.CLASS_ID, ...arguments)
	}

	static isSupported() {
		try {
			return (
				typeof self.Worker !== 'undefined' &&
				typeof self.WebGLRenderingContext !== 'undefined'
			)
		} catch (e) {
			return false
		}
	}
}
if (window) window.H265Player = H265Player
export default H265Player
