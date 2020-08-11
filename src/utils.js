export const DECODE_STATUS = {
  Idle: 0,
  Initializing: 1,
  Ready: 2,
  Finished: 3
}

export const DECODE_MESSAGE = {
  InitDecodeRES: 0, // 初始化decoder 请求
  InitDecodeREQ: 1, // 初始化decoder 返回

  OpenDecodeRES: 2, // 打开 decode 进程
  OpenDecodeREQ: 3,

  StartDecodeRES: 4, // 开始 decode
  StartDecodeREQ: 5,

  FeedDataRES: 6, // 发送视频流
  VideoFrameREQ: 7, // 解析视频流后返回数据

  PauseDecodeRES: 8, // 暂停 decode
  PauseDecodeREQ: 9,

  CloseDecodeRES: 10, // 关闭 decode 进程
  CloseDecodeREQ: 11
}

export const PLAYER_STATUS = {
  Idle: 0,
  Playing: 1,
  Pause: 2
}

/**
 * Merges two objects, giving the last one precedence
 * @param {Object} target
 * @param {(Object|Array)} source
 * @returns {Object}
 */
export function objectMerge(target, source) {
  if (typeof target !== 'object') {
    target = {}
  }
  if (Array.isArray(source)) {
    return source.slice()
  }
  Object.keys(source).forEach(property => {
    const sourceProperty = source[property]
    if (typeof sourceProperty === 'object') {
      target[property] = objectMerge(target[property], sourceProperty)
    } else {
      target[property] = sourceProperty
    }
  })
  return target
}

/**
 * This is just a simple version of deep copy
 * Has a lot of edge cases bug
 * If you want to use a perfect deep copy, use lodash's _.cloneDeep
 * @param {Object} source
 * @returns {Object}
 */
export function deepClone(source) {
  if (!source && typeof source !== 'object') {
    throw new Error('error arguments', 'deepClone')
  }
  const targetObj = source.constructor === Array ? [] : {}
  Object.keys(source).forEach(keys => {
    if (source[keys] && typeof source[keys] === 'object') {
      targetObj[keys] = deepClone(source[keys])
    } else {
      targetObj[keys] = source[keys]
    }
  })
  return targetObj
}

/**
 * Create a unique string
 * @returns {string}
 */
export function createUniqueString() {
  const timestamp = +new Date() + ''
  const randomNum = parseInt((1 + Math.random()) * 65536) + ''
  return (+(randomNum + timestamp)).toString(32)
}
