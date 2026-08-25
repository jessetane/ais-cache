if (true) {
	// console.time('icons')

	const	icon = String.fromCodePoint('0x26f5')
  const canvas = document.createElement('canvas')

  const devicePixelRatio = window.devicePixelRatio || 1
  const deviceWidth = window.screen.width * devicePixelRatio
  const deviceHeight = window.screen.height * devicePixelRatio
  canvas.width = deviceWidth
  canvas.height = deviceHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, deviceWidth, deviceHeight)
  let size = 12 * 16 * devicePixelRatio
  ctx.font = `${size}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseLine = 'middle'
  ctx.fillStyle = 'black'
  ctx.fillText(icon, deviceWidth / 2, deviceHeight / 2 + size / 2.5)
  let link = document.querySelector('link[rel="apple-touch-startup-image"]')
  link.setAttribute('href', canvas.toDataURL())

	ctx.clearRect(0, 0, canvas.width, canvas.height)
  let width = 100 * devicePixelRatio
  let height = 100 * devicePixelRatio
  canvas.width = width
  canvas.height = height
  ctx.fillStyle = 'transparent'
  ctx.fillRect(0, 0, width, height)
  size = 6 * 16 * devicePixelRatio
  ctx.font = `${size}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseLine = 'middle'
  ctx.fillStyle = 'black'
  ctx.fillText(icon, width / 2, height / 2 + size / 2.5)
	let dataUrl = canvas.toDataURL()
  link = document.querySelector('link[rel="icon"]')
  link.setAttribute('href', dataUrl)

	ctx.clearRect(0, 0, canvas.width, canvas.height)
  width = 180 * devicePixelRatio
  height = 180 * devicePixelRatio
  canvas.width = width
  canvas.height = height
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, width, height)
  size = 8 * 16 * devicePixelRatio
  ctx.font = `${size}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseLine = 'middle'
  ctx.fillStyle = 'black'
  ctx.fillText(icon, width / 2, height / 2 + size / 2.5)
	dataUrl = canvas.toDataURL()
  link = document.querySelector('link[rel="apple-touch-icon"]')
  link.setAttribute('href', dataUrl) 

	// console.timeEnd('icons')
}
