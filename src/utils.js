export const PLAYER_STATUS = {
	Idle: 0,
	Playing: 1,
	Pause: 2
}

export const DECODE_STATUS = {
	Idle: 0,
	Initializing: 1,
	Ready: 2,
	Finished: 3
}

export const PlayerStatus = {
	Idle: 0,
	Ready: 1,
	Playing: 2,
	Pause: 3,
	Destroyed: 4
}
export const DecoderStatus = {
	Idle: 0,
	Initializing: 1,
	Inited: 2,
	Ready: 3,
	Open: 4,
	Pause: 5,
	Closed: 6
}
export const DecodeMessage = {
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

export function createUniqueString() {
	const timestamp = +new Date() + ''
	const randomNum = parseInt((1 + Math.random()) * 65536) + ''
	return (+(randomNum + timestamp)).toString(32)
}

export function log(TAG, ID, ...rest) {
	const now = new Date(Date.now())
	const hour = now.getHours()
	const min = now.getMinutes()
	const sec = now.getSeconds()
	const ms = now.getMilliseconds()
	var currentTimeStr = hour + ':' + min + ':' + sec + ':' + ms
	console.log(`[${currentTimeStr}]-[ ${TAG}|${ID} ] : `, ...rest)
}

export function getHiddenProp() {
	const prefixs = ['webkit', 'moz', 'mos', 'o']
	if ('hidden' in document) return document.hidden
	for (let i = 0; i < prefixs.length; i++) {
		if (`${prefixs[i]}Hidden` in document) {
			return document[`${prefixs[i]}Hidden`]
		}
	}
	return null
}
