const path = require('path')
import webWorkerLoader from 'rollup-plugin-web-worker-loader'
import { babel } from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import filesize from 'rollup-plugin-filesize'
import { terser } from 'rollup-plugin-terser'
import { nodeResolve } from '@rollup/plugin-node-resolve'

const pkg = require('./package.json')

const resolve = function (...args) {
	return path.resolve(__dirname, ...args)
}
const extensions = ['.js']

const banner =
	`/*!
 *  h265-player
 *  (c) 2020-${new Date().getFullYear()} chenwuai
 * https://github.com/chenchenwuai/H265Player
 * Released under the MIT License.
 */`

export default {
	input: resolve('./src/index.js'),

	plugins: [
		webWorkerLoader(),
		nodeResolve(),
		commonjs(),
		babel({
			exclude: 'node_modules/**',
			extensions
		}),
		terser({ compress: { drop_console: false } }),
		filesize()
	],

	output: [
		{
			format: 'cjs',
			// 生成的文件名和路径
			// package.json的main字段, 也就是模块的入口文件
			file: pkg.main,
			banner
		},
		{
			format: 'es',
			// rollup和webpack识别的入口文件, 如果没有该字段, 那么会去读取main字段
			file: pkg.module,
			banner
		},
		{
			format: 'umd',
			name: 'H265Player',
			file: pkg.browser,
			banner
		}
	]
}
