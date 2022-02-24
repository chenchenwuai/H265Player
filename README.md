# h265-player

🚀 h265 stream player 🌈. 在浏览器上播放 H265 视频流，技术方案为在 web worker 中将 h265 视频帧解码为 yuv 数据，并通过webgl进行绘制。

## 安装
```bash
npm i h265-player
```

## 使用
```javascript
new H265Player(HTMLCanvasElement,Options)
```

## api

### HTMLCanvasElement

canvas dom，用来绘制解码出来的图像

### Options 

播放器的配置参数，具体有以下三个属性：

#### baseLibPath

> 设置此属性时，请先在 `statics` 文件夹下面找到 `libffmpeg_265.js`、`libffmpeg_265.wasm` 这两个文件。

此属性用来在 web worker 中拼接出 `libffmpeg_265.js`、`libffmpeg_265.wasm` 两个文件的下载路径，然后使用 `importScript(libffmpeg_265.js)` 和 `fetch(libffmpeg_265.wasm)` 下载这两个文件，默认值为 `/lib/`。

有两种设置方式
+ 相对路径

拼接规则为 `location.origin + baseLibPath + 'libffmpeg_265.js'`， 例如：baseLibPath = '/public/'，当前运行脚本的 `location.origin` 为 `http://192.168.1.10:9000'`， 则最后的拼接地址为 `http://192.168.1.10:9000/public/libffmpeg_265.js`
+ 一种是绝对路径，拼接规则为 `baseLibPath + 'libffmpeg_265.js'`

+ 绝对路径

拼接规则为 `baseLibPath + 'libffmpeg_265.js'`， 例如：baseLibPath = 'http://192.168.1.10:9000/public/'，则最后的拼接地址为 `http://192.168.1.10:9000/public/libffmpeg_265.js`

> 无论设置哪一种方式，都必须要求可以通过此链接访问 `libffmpeg_265.js` 文件内容，
> `libffmpeg_265.js`、`libffmpeg_265.wasm` 这两个文件必须在同一个文件夹下面


#### debug 

开启播放器 debug 模式

#### decoderLogLevel

设置解码器的日志等级，js-0; wasm-1; ffmpeg-2


### 方法
|方法|说明|参数|
|---|---|---|
|isSupported|静态方法，判断当前是否支持h265播放所需要的环境||
|start|在`ready`监听回调触发后，调用此方法开始播放||
|feed|喂给播放器 一帧h265视频流|(arraybuffer,timestamp)，arraybuffer是 ArrayBuffer类型，timestamp是number类型的时间戳|
|pause|暂停播放||
|play|开始播放||
|fullscreen|视频全屏||
|destroy|销毁播放器||
|on|监听事件|参照下面`监听事件`|
|off|取消监听事件||

### 监听事件
|事件|说明|回调值|
|---|---|---|
|ready|播放器已准备好，可以开始调用start方法和feed方法了||
|size|解码出来的视频的分辨率|{width,height}|
|play|视频正在播放||
|pause|视频暂停||
|error|视频播放出错||

## 简单代码
```javascript

import H265Player from 'h265-player'
const canvas = document.getElementById('canvas');

var player = new H265Player(canvas, {
  baseLibPath: "/statics/",
  decoderLogLevel: 0,
  isDebug: true
});
player.on("ready", () => {
  console.log("ready");
  player.start();
});
player.on("size", function (e) {
  console.log("size", e.width, e.height);
});
player.on("play", () => {
  console.log("play");
});
player.on("pause", () => {
  console.log("pause");
});
player.on("error", (e) => {
  console.log("player error", e);
});

function feed(arraybuffer, timestamp) {
  if (player) {
    player.feed(arraybuffer, timestamp);
  }
}
```

> Thank you for your star