import { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

export function CaptureView() {
  const [image, setImage] = useState('')
  const [start, setStart] = useState<Point | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const off = window.codelens.onCaptureInit(setImage)
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void window.codelens.captureCancel()
    }
    window.addEventListener('keydown', escape)
    return () => { off(); window.removeEventListener('keydown', escape) }
  }, [])

  function move(event: React.MouseEvent) {
    if (!start) return
    const x = Math.min(start.x, event.clientX)
    const y = Math.min(start.y, event.clientY)
    setRect({ x, y, width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y) })
  }

  async function finish(event: React.MouseEvent) {
    setStart(null)
    if (!start || !imageRef.current) return
    const selected = { x: Math.min(start.x, event.clientX), y: Math.min(start.y, event.clientY),
      width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y) }
    if (selected.width < 16 || selected.height < 16) return
    const img = imageRef.current
    const scaleX = img.naturalWidth / window.innerWidth
    const scaleY = img.naturalHeight / window.innerHeight
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(selected.width * scaleX)
    canvas.height = Math.round(selected.height * scaleY)
    canvas.getContext('2d')?.drawImage(img, selected.x * scaleX, selected.y * scaleY,
      canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
    await window.codelens.captureDone(canvas.toDataURL('image/png'))
  }

  return <div className="capture-stage" onMouseDown={(event) => {
      setStart({ x: event.clientX, y: event.clientY }); setRect(null)
    }} onMouseMove={move} onMouseUp={(event) => { void finish(event) }}>
    {image && <img ref={imageRef} src={image} className="capture-background" alt="当前屏幕画面" draggable={false} />}
    <div className="capture-shade" />
    {rect && <div className="capture-selection" style={{ left: rect.x, top: rect.y,
      width: rect.width, height: rect.height }} />}
    <div className="capture-hint">拖动选择代码区域 <span>Esc 取消</span></div>
  </div>
}
