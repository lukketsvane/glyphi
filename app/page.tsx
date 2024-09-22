"use client"
import opentype from 'opentype.js';
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ResizableBox } from 'react-resizable'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/theme-toggle"
import { PenTool, Eraser, Square, Circle, RotateCcw, Download, ChevronLeft, ChevronRight, RotateCw, Save, Upload } from 'lucide-react'

const allCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?ÆØÅæøå'

type Point = { x: number; y: number; pressure: number }
type Stroke = { points: Point[]; width: number; texture: string; bristleAmount: number }
type Glyph = { strokes: Stroke[]; width: number; alternates?: Glyph[]; metrics: GlyphMetrics }
type Ligature = { chars: string; glyph: Glyph }
type KerningPair = { left: string; right: string; value: number }
type GlyphMetrics = {
  leftSideBearing: number;
  rightSideBearing: number;
  advanceWidth: number;
  baseline: number;
  xHeight: number;
  capHeight: number;
}

type BrushShape = 'round' | 'square' | 'ink'
type BrushTexture = 'none' | 'rough' | 'bristle'

type FontCreatorState = {
  glyphs: { [key: string]: Glyph };
  alternates: { [key: string]: Glyph[] };
  ligatures: Ligature[];
  kerning: KerningPair[];
  fontSettings: FontSettings;
}

type FontSettings = {
  charWidth: number;
  letterSpacing: number;
  lineHeight: number;
  slant: number;
  weight: number;
  randomVariation: number;
}

const MAX_CANVAS_WIDTH = 800
const MIN_CANVAS_SIZE = 200

export default function FontCreator() {
  const [selectedChar, setSelectedChar] = useState('A')
  const [visibleChars, setVisibleChars] = useState<string[]>([])
  const [startIndex, setStartIndex] = useState(0)
  const [brushSize, setBrushSize] = useState(20)
  const [brushRoundness, setBrushRoundness] = useState(100)
  const [brushPressure, setBrushPressure] = useState(100)
  const [brushAngle, setBrushAngle] = useState(0)
  const [brushOpacity, setBrushOpacity] = useState(100)
  const [brushScatter, setBrushScatter] = useState(0)
  const [usePenDirection, setUsePenDirection] = useState(false)
  const [brushStreamline, setBrushStreamline] = useState(50)
  const [brushShape, setBrushShape] = useState<BrushShape>('round')
  const [brushTexture, setBrushTexture] = useState<BrushTexture>('none')
  const [bristleAmount, setBristleAmount] = useState(0)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<Point[]>([])
  const [glyphs, setGlyphs] = useState<{ [key: string]: Glyph }>({})
  const [alternates, setAlternates] = useState<{ [key: string]: Glyph[] }>({})
  const [ligatures, setLigatures] = useState<Ligature[]>([])
  const [kerning, setKerning] = useState<KerningPair[]>([])
  const [tool, setTool] = useState<'pen' | 'eraser' | 'rectangle' | 'circle'>('pen')
  const [undoHistory, setUndoHistory] = useState<{ [key: string]: Glyph[] }>({})
  const [redoHistory, setRedoHistory] = useState<{ [key: string]: Glyph[] }>({})
  const [testText, setTestText] = useState('The quick brown fox jumps over the lazy dog ÆØÅæøå')
  const [currentAlternateIndex, setCurrentAlternateIndex] = useState(0)
  const [fontSettings, setFontSettings] = useState<FontSettings>({
    charWidth: 100,
    letterSpacing: 0,
    lineHeight: 1.2,
    slant: 0,
    weight: 400,
    randomVariation: 0,
  })
  const [draggingMetric, setDraggingMetric] = useState<keyof GlyphMetrics | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 400 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const testCanvasRef = useRef<HTMLCanvasElement>(null)
  const charBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const canvasWidth = Math.min(MAX_CANVAS_WIDTH, window.innerWidth - 40)
      canvas.width = canvasWidth
      canvas.height = canvasWidth
      const context = canvas.getContext('2d')
      if (context) {
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.strokeStyle = 'black'
        contextRef.current = context
      }
    }
    updateVisibleChars()
    window.addEventListener('resize', handleResize)
    window.addEventListener('keydown', handleKeyDown)
    loadProgress()
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    drawGlyph()
  }, [selectedChar, glyphs, currentAlternateIndex])

  useEffect(() => {
    drawTestText()
  }, [testText, glyphs, alternates, ligatures, kerning, fontSettings])

  useEffect(() => {
    saveProgress()
  }, [glyphs, alternates, ligatures, kerning, fontSettings])

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = canvasSize.width
      canvasRef.current.height = canvasSize.height
      drawGlyph()
    }
  }, [canvasSize])

  const handleResize = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const canvasWidth = Math.min(MAX_CANVAS_WIDTH, window.innerWidth - 40)
      canvas.width = canvasWidth
      canvas.height = canvasWidth
      drawGlyph()
    }
    updateVisibleChars()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault()
          if (e.shiftKey) {
            redo()
          } else {
            undo()
          }
          break
        case 'y':
          e.preventDefault()
          redo()
          break
        case 's':
          e.preventDefault()
          saveToFile()
          break
        case 'o':
          e.preventDefault()
          loadFromFile()
          break
      }
    } else {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          nextChar()
          break
        case 'ArrowLeft':
          e.preventDefault()
          prevChar()
          break
        case '1':
        case '2':
        case '3':
        case '4':
          e.preventDefault()
          const toolIndex = parseInt(e.key) - 1
          const tools: ('pen' | 'eraser' | 'rectangle' | 'circle')[] = ['pen', 'eraser', 'rectangle', 'circle']
          setTool(tools[toolIndex])
          break
        case '[':
          e.preventDefault()
          setBrushSize(prev => Math.max(1, prev - 1))
          break
        case ']':
          e.preventDefault()
          setBrushSize(prev => Math.min(100, prev + 1))
          break
      }
    }
  }

  const updateVisibleChars = () => {
    if (charBarRef.current) {
      const charWidth = 40
      const availableWidth = charBarRef.current.offsetWidth - 80
      const visibleCount = Math.floor(availableWidth / charWidth)
      const newVisibleChars = allCharacters.slice(startIndex, startIndex + visibleCount).split('')
      setVisibleChars(newVisibleChars)
    }
  }

  const drawGlyph = () => {
    const context = contextRef.current
    if (!context) return

    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    drawGuidelines(context)

    const glyph = getGlyphWithAlternate(selectedChar)
    if (glyph) {
      drawGlyphOnCanvas(context, glyph, 0, 0, 1)
      drawMetrics(context, glyph)
    }
  }

  const getGlyphWithAlternate = (char: string): Glyph | undefined => {
    const baseGlyph = glyphs[char]
    if (!baseGlyph) return undefined

    const alternateGlyphs = alternates[char] || []
    return alternateGlyphs[currentAlternateIndex - 1] || baseGlyph
  }

  const drawGuidelines = (context: CanvasRenderingContext2D) => {
    const { width, height } = context.canvas
    context.save()
    context.strokeStyle = '#e0e0e0'
    context.lineWidth = 0.5
    context.setLineDash([2, 2])
    
    context.beginPath()
    context.moveTo(width / 2, 0)
    context.lineTo(width / 2, height)
    context.stroke()

    const lines = [0.25, 0.5, 0.75]
    lines.forEach(y => {
      context.beginPath()
      context.moveTo(0, height * y)
      context.lineTo(width, height * y)
      context.stroke()
    })

    context.restore()
  }

const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const { x, y } = getCanvasCoordinates(e)
    setCurrentStroke([{ x, y, pressure: e.pressure ?? 0.5 }])
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const { x, y } = getCanvasCoordinates(e)
    setCurrentStroke(prev => [...prev, { x, y, pressure: e.pressure ?? 0.5 }])

    const context = contextRef.current
    if (context) {
      context.beginPath()
      context.moveTo(currentStroke[currentStroke.length - 1].x, currentStroke[currentStroke.length - 1].y)
      context.lineTo(x, y)
      
      const pressure = e.pressure ?? 0.5
      const width = brushSize * pressure * (brushPressure / 100)
      
      applyBrushEffects(context, width)
      
      const scatterX = (Math.random() - 0.5) * brushScatter
      const scatterY = (Math.random() - 0.5) * brushScatter
      context.translate(scatterX, scatterY)
      
      context.stroke()
      context.setTransform(1, 0, 0, 1, 0, 0)
    }
  }

  const applyBrushEffects = (context: CanvasRenderingContext2D, width: number) => {
    context.lineWidth = width
    context.strokeStyle = tool === 'eraser' ? 'white' : `rgba(0, 0, 0, ${brushOpacity / 100})`

    switch (brushShape) {
      case 'round':
        context.lineCap = 'round'
        context.lineJoin = 'round'
        break
      case 'square':
        context.lineCap = 'square'
        context.lineJoin = 'miter'
        break
      case 'ink':
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.lineWidth = width * (1 + Math.random() * 0.5)
        break
    }

    switch (brushTexture) {
      case 'rough':
        applyRoughTexture(context)
        break
      case 'bristle':
        applyBristleTexture(context, width)
        break
    }
  }

  const applyRoughTexture = (context: CanvasRenderingContext2D) => {
    const originalStroke = context.stroke.bind(context)
    context.stroke = () => {
      const roughness = 2
      const { x: x1, y: y1 } = currentStroke[currentStroke.length - 2] || { x: 0, y: 0 }
      const { x: x2, y: y2 } = currentStroke[currentStroke.length - 1]
      
      context.beginPath()
      context.moveTo(x1, y1)
      
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      const offsetX = (Math.random() - 0.5) * roughness
      const offsetY = (Math.random() - 0.5) * roughness
      
      context.quadraticCurveTo(midX + offsetX, midY + offsetY, x2, y2)
      originalStroke()
    }
  }

  const applyBristleTexture = (context: CanvasRenderingContext2D, width: number) => {
    const originalStroke = context.stroke.bind(context)
    context.stroke = () => {
      const bristles = 3 + Math.floor(bristleAmount * 7)
      for (let i = 0; i < bristles; i++) {
        context.beginPath()
        currentStroke.forEach((point, index) => {
          const offset = (Math.random() - 0.5) * width * 0.5
          if (index === 0) {
            context.moveTo(point.x + offset, point.y + offset)
          } else {
            context.lineTo(point.x + offset, point.y + offset)
          }
        })
        originalStroke()
      }
    }
  }

  const endDrawing = () => {
    setIsDrawing(false)
    if (currentStroke.length > 0) {
      const newGlyph: Glyph = {
        strokes: [...(getGlyphWithAlternate(selectedChar)?.strokes || []), {
          points: currentStroke,
          width: brushSize,
          texture: brushTexture,
          bristleAmount: bristleAmount
        }],
        width: fontSettings.charWidth,
        metrics: getGlyphWithAlternate(selectedChar)?.metrics || {
          leftSideBearing: 10,
          rightSideBearing: 10,
          advanceWidth: fontSettings.charWidth,
          baseline: 300,
          xHeight: 200,
          capHeight: 280,
        }
      }

      if (currentAlternateIndex === 0) {
        setGlyphs(prev => ({ ...prev, [selectedChar]: newGlyph }))
      } else {
        setAlternates(prev => {
          const updatedAlternates = [...(prev[selectedChar] || [])]
          updatedAlternates[currentAlternateIndex - 1] = newGlyph
          return { ...prev, [selectedChar]: updatedAlternates }
        })
      }

      setCurrentStroke([])
      saveToUndoHistory()
    }
  }

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    }
    return { x: 0, y: 0 }
  }

  const clearCanvas = () => {
    saveToUndoHistory()
    const emptyGlyph: Glyph = {
      strokes: [],
      width: fontSettings.charWidth,
      metrics: {
        leftSideBearing: 10,
        rightSideBearing: 10,
        advanceWidth: fontSettings.charWidth,
        baseline: 300,
        xHeight: 200,
        capHeight: 280,
      }
    }

    if (currentAlternateIndex === 0) {
      setGlyphs(prev => ({ ...prev, [selectedChar]: emptyGlyph }))
    } else {
      setAlternates(prev => {
        const updatedAlternates = [...(prev[selectedChar] || [])]
        updatedAlternates[currentAlternateIndex - 1] = emptyGlyph
        return { ...prev, [selectedChar]: updatedAlternates }
      })
    }
  }

  const saveToUndoHistory = () => {
    setUndoHistory(prev => ({
      ...prev,
      [selectedChar]: [...(prev[selectedChar] || []), getGlyphWithAlternate(selectedChar) || {
        strokes: [],
        width: fontSettings.charWidth,
        metrics: {
          leftSideBearing: 10,
          rightSideBearing: 10,
          advanceWidth: fontSettings.charWidth,
          baseline: 300,
          xHeight: 200,
          capHeight: 280,
        }
      }]
    }))
    setRedoHistory(prev => ({ ...prev, [selectedChar]: [] }))
  }

  const undo = () => {
    const glyphHistory = undoHistory[selectedChar]
    if (glyphHistory && glyphHistory.length > 0) {
      const previousGlyph = glyphHistory[glyphHistory.length - 1]
      if (currentAlternateIndex === 0) {
        setGlyphs(prev => ({ ...prev, [selectedChar]: previousGlyph }))
      } else {
        setAlternates(prev => {
          const updatedAlternates = [...(prev[selectedChar] || [])]
          updatedAlternates[currentAlternateIndex - 1] = previousGlyph
          return { ...prev, [selectedChar]: updatedAlternates }
        })
      }
      setUndoHistory(prev => ({
        ...prev,
        [selectedChar]: glyphHistory.slice(0, -1)
      }))
      setRedoHistory(prev => ({
        ...prev,
        [selectedChar]: [...(prev[selectedChar] || []), getGlyphWithAlternate(selectedChar) || {
          strokes: [],
          width: fontSettings.charWidth,
          metrics: {
            leftSideBearing: 10,
            rightSideBearing: 10,
            advanceWidth: fontSettings.charWidth,
            baseline: 300,
            xHeight: 200,
            capHeight: 280,
          }
        }]
      }))
    }
  }

  const redo = () => {
    const glyphFuture = redoHistory[selectedChar]
    if (glyphFuture && glyphFuture.length > 0) {
      const nextGlyph = glyphFuture[glyphFuture.length - 1]
      if (currentAlternateIndex === 0) {
        setGlyphs(prev => ({ ...prev, [selectedChar]: nextGlyph }))
      } else {
        setAlternates(prev => {
          const updatedAlternates = [...(prev[selectedChar] || [])]
          updatedAlternates[currentAlternateIndex - 1] = nextGlyph
          return { ...prev, [selectedChar]: updatedAlternates }
        })
      }
      setRedoHistory(prev => ({
        ...prev,
        [selectedChar]: glyphFuture.slice(0, -1)
      }))
      setUndoHistory(prev => ({
        ...prev,
        [selectedChar]: [...(prev[selectedChar] || []), getGlyphWithAlternate(selectedChar) || {
          strokes: [],
          width: fontSettings.charWidth,
          metrics: {
            leftSideBearing: 10,
            rightSideBearing: 10,
            advanceWidth: fontSettings.charWidth,
            baseline: 300,
            xHeight: 200,
            capHeight: 280,
          }
        }]
      }))
    }
  }

  const drawTestText = () => {
    const canvas = testCanvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'black'
    context.textBaseline = 'middle'

    const fontSize = 40
    const lineHeight = fontSize * fontSettings.lineHeight
    const lines = testText.split('\n')

    lines.forEach((line, lineIndex) => {
      let xOffset = 10
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]
        
        const ligature = ligatures.find(l => line.substr(i, l.chars.length) === l.chars)
        if (ligature) {
          drawGlyphOnCanvas(context, ligature.glyph, xOffset, lineHeight * (lineIndex + 0.5), fontSize / 400)
          xOffset += (ligature.glyph.width + fontSettings.letterSpacing) * (fontSize / 400)
          i += ligature.chars.length - 1
          continue
        }

        const glyph = getGlyphWithAlternate(char)
        if (glyph) {
          drawGlyphOnCanvas(context, glyph, xOffset, lineHeight * (lineIndex + 0.5), fontSize / 400)
          xOffset += (glyph.width + fontSettings.letterSpacing) * (fontSize / 400)
        } else {
          context.font = `${fontSize}px Arial`
          context.fillText(char, xOffset, lineHeight * (lineIndex + 0.5))
          xOffset += context.measureText(char).width + fontSettings.letterSpacing * (fontSize / 400)
        }

        if (nextChar) {
          const kerningPair = kerning.find(k => k.left === char && k.right === nextChar)
          if (kerningPair) {
            xOffset += kerningPair.value * (fontSize / 400)
          }
        }
      }
    })
  }

  const drawGlyphOnCanvas = (ctx: CanvasRenderingContext2D, glyph: Glyph, x: number, y: number, scale: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    
    ctx.transform(1, 0, Math.tan(fontSettings.slant * Math.PI / 180), 1, 0, 0)
    
    const weightScale = fontSettings.weight / 400
    ctx.lineWidth = weightScale
    
    glyph.strokes.forEach(stroke => {
      ctx.beginPath()
      ctx.lineWidth = stroke.width * weightScale
      
      if (stroke.texture === 'bristle') {
        const bristles = 3 + Math.floor(stroke.bristleAmount * 7)
        for (let i = 0; i < bristles; i++) {
          ctx.beginPath()
          stroke.points.forEach((point, index) => {
            const offset = (Math.random() - 0.5) * stroke.width * 0.5
            if (index === 0) {
              ctx.moveTo(point.x + offset, point.y + offset)
            } else {
              ctx.lineTo(point.x + offset, point.y + offset)
            }
          })
          ctx.stroke()
        }
      } else if (stroke.texture === 'rough') {
        ctx.beginPath()
        stroke.points.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y)
          } else {
            const prevPoint = stroke.points[index - 1]
            const midX = (prevPoint.x + point.x) / 2
            const midY = (prevPoint.y + point.y) / 2
            const offsetX = (Math.random() - 0.5) * 2
            const offsetY = (Math.random() - 0.5) * 2
            ctx.quadraticCurveTo(midX + offsetX, midY + offsetY, point.x, point.y)
          }
        })
        ctx.stroke()
      } else {
        stroke.points.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y)
          } else {
            ctx.lineTo(point.x, point.y)
          }
        })
        ctx.stroke()
      }
    })
    ctx.restore()
  }

  const addAlternate = () => {
    setAlternates(prev => {
      const updatedAlternates = [...(prev[selectedChar] || []), {
        strokes: [],
        width: fontSettings.charWidth,
        metrics: {
          leftSideBearing: 10,
          rightSideBearing: 10,
          advanceWidth: fontSettings.charWidth,
          baseline: 300,
          xHeight: 200,
          capHeight: 280,
        }
      }]
      return { ...prev, [selectedChar]: updatedAlternates }
    })
    setCurrentAlternateIndex(alternates[selectedChar]?.length + 1 || 1)
  }

  const drawMetrics = (ctx: CanvasRenderingContext2D, glyph: Glyph) => {
    const { width, height } = ctx.canvas

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)'
    ctx.moveTo(0, glyph.metrics.baseline)
    ctx.lineTo(width, glyph.metrics.baseline)
    ctx.stroke()

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'
    ctx.moveTo(0, glyph.metrics.baseline - glyph.metrics.xHeight)
    ctx.lineTo(width, glyph.metrics.baseline - glyph.metrics.xHeight)
    ctx.stroke()

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
    ctx.moveTo(0, glyph.metrics.baseline - glyph.metrics.capHeight)
    ctx.lineTo(width, glyph.metrics.baseline - glyph.metrics.capHeight)
    ctx.stroke()

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(128, 0, 128, 0.5)'
    ctx.moveTo(glyph.metrics.leftSideBearing, 0)
    ctx.lineTo(glyph.metrics.leftSideBearing, height)
    ctx.stroke()

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)'
    ctx.moveTo(glyph.metrics.advanceWidth - glyph.metrics.rightSideBearing, 0)
    ctx.lineTo(glyph.metrics.advanceWidth - glyph.metrics.rightSideBearing, height)
    ctx.stroke()

    ctx.font = '12px Arial'
    ctx.fillStyle = 'black'
    ctx.fillText('Baseline', 5, glyph.metrics.baseline + 15)
    ctx.fillText('x-Height', 5, glyph.metrics.baseline - glyph.metrics.xHeight - 5)
    ctx.fillText('Cap Height', 5, glyph.metrics.baseline - glyph.metrics.capHeight - 5)
    ctx.fillText('Left Bearing', glyph.metrics.leftSideBearing + 5, height - 5)
    ctx.fillText('Right Bearing', glyph.metrics.advanceWidth - glyph.metrics.rightSideBearing - 80, height - 5)
  }

  const updateMetrics = (metricName: keyof GlyphMetrics, value: number) => {
    const updatedGlyph = getGlyphWithAlternate(selectedChar)
    if (!updatedGlyph) return

    updatedGlyph.metrics[metricName] = value

    if (currentAlternateIndex === 0) {
      setGlyphs(prev => ({ ...prev, [selectedChar]: updatedGlyph }))
    } else {
      setAlternates(prev => {
        const updatedAlternates = [...(prev[selectedChar] || [])]
        updatedAlternates[currentAlternateIndex - 1] = updatedGlyph
        return { ...prev, [selectedChar]: updatedAlternates }
      })
    }
  }

  const nextChar = () => {
    const currentIndex = allCharacters.indexOf(selectedChar)
    const nextIndex = (currentIndex + 1) % allCharacters.length
    setSelectedChar(allCharacters[nextIndex])
    setCurrentAlternateIndex(0)
  }

  const prevChar = () => {
    const currentIndex = allCharacters.indexOf(selectedChar)
    const prevIndex = (currentIndex - 1 + allCharacters.length) % allCharacters.length
    setSelectedChar(allCharacters[prevIndex])
    setCurrentAlternateIndex(0)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const svg = e.target?.result as string
        const parser = new DOMParser()
        const svgDoc = parser.parseFromString(svg, 'image/svg+xml')
        const paths = svgDoc.querySelectorAll('path')
        
        const newStrokes: Stroke[] = []
        paths.forEach(path => {
          const d = path.getAttribute('d')
          if (d) {
            const points = d.split(/[MmLlHhVvCcSsQqTtAaZz]/).filter(Boolean).map(coord => {
              const [x, y] = coord.split(',').map(Number)
              return { x, y, pressure: 0.5 }
            })
            newStrokes.push({
              points,
              width: 1,
              texture: 'none',
              bristleAmount: 0
            })
          }
        })

        const newGlyph: Glyph = {
          strokes: newStrokes,
          width: fontSettings.charWidth,
          metrics: getGlyphWithAlternate(selectedChar)?.metrics || {
            leftSideBearing: 10,
            rightSideBearing: 10,
            advanceWidth: fontSettings.charWidth,
            baseline: 300,
            xHeight: 200,
            capHeight: 280,
          }
        }

        if (currentAlternateIndex === 0) {
          setGlyphs(prev => ({ ...prev, [selectedChar]: newGlyph }))
        } else {
          setAlternates(prev => {
            const updatedAlternates = [...(prev[selectedChar] || [])]
            updatedAlternates[currentAlternateIndex - 1] = newGlyph
            return { ...prev, [selectedChar]: updatedAlternates }
          })
        }

        saveToUndoHistory()
      }
      reader.readAsText(file)
    }
  }

  const saveProgress = () => {
    const fontCreatorState: FontCreatorState = {
      glyphs,
      alternates,
      ligatures,
      kerning,
      fontSettings,
    }
    localStorage.setItem('fontCreatorState', JSON.stringify(fontCreatorState))
  }

  const loadProgress = () => {
    const savedState = localStorage.getItem('fontCreatorState')
    if (savedState) {
      const parsedState: FontCreatorState = JSON.parse(savedState)
      setGlyphs(parsedState.glyphs)
      setAlternates(parsedState.alternates)
      setLigatures(parsedState.ligatures)
      setKerning(parsedState.kerning)
      setFontSettings(parsedState.fontSettings)
    }
  }

  const saveToFile = () => {
    const fontCreatorState: FontCreatorState = {
      glyphs,
      alternates,
      ligatures,
      kerning,
      fontSettings,
    }
    const blob = new Blob([JSON.stringify(fontCreatorState)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'font-creator-state.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadFromFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          const parsedState: FontCreatorState = JSON.parse(content)
          setGlyphs(parsedState.glyphs)
          setAlternates(parsedState.alternates)
          setLigatures(parsedState.ligatures)
          setKerning(parsedState.kerning)
          setFontSettings(parsedState.fontSettings)
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  const downloadFont = () => {
    const notdefGlyph = new (opentype as any).Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: 500,
      path: new (opentype as any).Path()
    });
  
    const glyphsData: { [key: string]: any } = {
      '.notdef': notdefGlyph
    };
  
    Object.entries(glyphs).forEach(([char, glyph]) => {
      const path = new (opentype as any).Path();
      glyph.strokes.forEach(stroke => {
        stroke.points.forEach((point, index) => {
          if (index === 0) {
            path.moveTo(point.x, point.y);
          } else {
            path.lineTo(point.x, point.y);
          }
        });
      });
  
      glyphsData[char] = new (opentype as any).Glyph({
        name: char,
        unicode: char.charCodeAt(0),
        advanceWidth: fontSettings.charWidth,
        path: path
      });
    });
  
    const font = new (opentype as any).Font({
      familyName: 'CustomFont',
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      glyphs: Object.values(glyphsData)
    });
  
    const buffer = font.toArrayBuffer();
    const blob = new Blob([buffer], { type: 'font/opentype' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-font.otf';
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="py-8">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Font Creator</h1>
        <ThemeToggle />
      </div>
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between" ref={charBarRef}>
            <Button onClick={() => setStartIndex(Math.max(0, startIndex - 1))} disabled={startIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {visibleChars.map((char, index) => (
              <Button
                key={index}
                onClick={() => {
                  setSelectedChar(char)
                  setCurrentAlternateIndex(0)
                }}
                variant={selectedChar === char ? 'default' : 'outline'}
                className="w-10 h-10"
              >
                {char}
              </Button>
            ))}
            <Button onClick={() => setStartIndex(startIndex + 1)} disabled={startIndex + visibleChars.length >= allCharacters.length}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <ResizableBox
        width={canvasSize.width}
        height={canvasSize.height}
        minConstraints={[MIN_CANVAS_SIZE, MIN_CANVAS_SIZE]}
        maxConstraints={[MAX_CANVAS_WIDTH, MAX_CANVAS_WIDTH]}
        onResize={(e, data) => {
          setCanvasSize({ width: data.size.width, height: data.size.height })
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={() => setIsDrawing(false)}
          onPointerLeave={() => setIsDrawing(false)}
          className="border border-gray-300"
        />
      </ResizableBox>          <div className="mt-4 flex space-x-2">
            <Button onClick={clearCanvas}>Clear</Button>
            <Button onClick={undo}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Undo
            </Button>
            <Button onClick={redo}>
              <RotateCw className="h-4 w-4 mr-2" />
              Redo
            </Button>
            <Button onClick={addAlternate}>Add Alternate</Button>
            <Button onClick={downloadFont}>
              <Download className="h-4 w-4 mr-2" />
              Download Font
            </Button>
            <Button onClick={saveToFile}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button onClick={loadFromFile}>
              <Upload className="h-4 w-4 mr-2" />
              Load
            </Button>
          </div>
          <div className="mt-4">
            <Label>Current Alternate</Label>
            <div className="flex space-x-2 mt-2">
              {[0, ...(alternates[selectedChar] || []).map((_, i) => i + 1)].map((index) => (
                <Button
                  key={index}
                  onClick={() => setCurrentAlternateIndex(index)}
                  variant={currentAlternateIndex === index ? 'default' : 'outline'}
                >
                  {index === 0 ? 'Base' : `Alt ${index}`}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="svg-upload">Import SVG</Label>
            <Input
              id="svg-upload"
              type="file"
              accept=".svg"
              onChange={handleFileUpload}
              className="mt-2"
            />
          </div>
        </div>
        <div className="flex-1">
          <Tabs defaultValue="brush">
            <TabsList>
              <TabsTrigger value="brush">Brush Settings</TabsTrigger>
              <TabsTrigger value="font">Font Settings</TabsTrigger>
              <TabsTrigger value="metrics">Glyph Metrics</TabsTrigger>
            </TabsList>
            <TabsContent value="brush">
              <div className="space-y-4">
                <div>
                  <Label>Tool</Label>
                  <div className="flex space-x-2 mt-2">
                    <Button onClick={() => setTool('pen')} variant={tool === 'pen' ? 'default' : 'outline'}>
                      <PenTool className="h-4 w-4 mr-2" />
                      Pen
                    </Button>
                    <Button onClick={() => setTool('eraser')} variant={tool === 'eraser' ? 'default' : 'outline'}>
                      <Eraser className="h-4 w-4 mr-2" />
                      Eraser
                    </Button>
                    <Button onClick={() => setTool('rectangle')} variant={tool === 'rectangle' ? 'default' : 'outline'}>
                      <Square className="h-4 w-4 mr-2" />
                      Rectangle
                    </Button>
                    <Button onClick={() => setTool('circle')} variant={tool === 'circle' ? 'default' : 'outline'}>
                      <Circle className="h-4 w-4 mr-2" />
                      Circle
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="brush-size">Brush Size: {brushSize}</Label>
                  <Slider
                    id="brush-size"
                    min={1}
                    max={100}
                    step={1}
                    value={[brushSize]}
                    onValueChange={(value) => setBrushSize(value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="brush-roundness">Brush Roundness: {brushRoundness}</Label>
                  <Slider
                    id="brush-roundness"
                    min={0}
                    max={100}
                    step={1}
                    value={[brushRoundness]}
                    onValueChange={(value) => setBrushRoundness(value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="brush-pressure">Brush Pressure: {brushPressure}</Label>
                  <Slider
                    id="brush-pressure"
                    min={0}
                    max={100}
                    step={1}
                    value={[brushPressure]}
                    onValueChange={(value) => setBrushPressure(value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="brush-angle">Brush Angle: {brushAngle}</Label>
                  <Slider
                    id="brush-angle"
                    min={0}
                    max={360}
                    step={1}
                    value={[brushAngle]}
                    onValueChange={(value) => setBrushAngle(value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="brush-opacity">Brush Opacity: {brushOpacity}</Label>
                  <Slider
                    id="brush-opacity"
                    min={0}
                    max={100}
                    step={1}
                    value={[brushOpacity]}
                    onValueChange={(value) => setBrushOpacity(value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="brush-scatter">Brush Scatter: {brushScatter}</Label>
                  <Slider
                    id="brush-scatter"
                    min={0}
                    max={100}
                    step={1}
                    value={[brushScatter]}
                    onValueChange={(value) => setBrushScatter(value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="brush-streamline">Brush Streamline: {brushStreamline}</Label>
                  <Slider
                    id="brush-streamline"
                    min={0}
                    max={100}
                    step={1}
                    value={[brushStreamline]}
                    onValueChange={(value) => setBrushStreamline(value[0])}
                  />
                </div>
                <div>
                  <Label>Brush Shape</Label>
                  <div className="flex space-x-2 mt-2">
                    <Button onClick={() => setBrushShape('round')} variant={brushShape === 'round' ? 'default' : 'outline'}>
                      Round
                    </Button>
                    <Button onClick={() => setBrushShape('square')} variant={brushShape === 'square' ? 'default' : 'outline'}>
                      Square
                    </Button>
                    <Button onClick={() => setBrushShape('ink')} variant={brushShape === 'ink' ? 'default' : 'outline'}>
                      Ink
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Brush Texture</Label>
                  <div className="flex space-x-2 mt-2">
                    <Button onClick={() => setBrushTexture('none')} variant={brushTexture === 'none' ? 'default' : 'outline'}>
                      None
                    </Button>
                    <Button onClick={() => setBrushTexture('rough')} variant={brushTexture === 'rough' ? 'default' : 'outline'}>
                      Rough
                    </Button>
                    <Button onClick={() => setBrushTexture('bristle')} variant={brushTexture === 'bristle' ? 'default' : 'outline'}>
                      Bristle
                    </Button>
                  </div>
                </div>
                {brushTexture === 'bristle' && (
                  <div>
                    <Label htmlFor="bristle-amount">Bristle Amount: {bristleAmount}</Label>
                    <Slider
                      id="bristle-amount"
                      min={0}
                      max={1}
                      step={0.01}
                      value={[bristleAmount]}
                      onValueChange={(value) => setBristleAmount(value[0])}
                    />
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="use-pen-direction"
                    checked={usePenDirection}
                    onCheckedChange={setUsePenDirection}
                  />
                  <Label htmlFor="use-pen-direction">Use Pen Direction</Label>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="font">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="char-width">Character Width: {fontSettings.charWidth}</Label>
                  <Slider
                    id="char-width"
                    min={50}
                    max={200}
                    step={1}
                    value={[fontSettings.charWidth]}
                    onValueChange={(value) => setFontSettings(prev => ({ ...prev, charWidth: value[0] }))}
                  />
                </div>
                <div>
                  <Label htmlFor="letter-spacing">Letter Spacing: {fontSettings.letterSpacing}</Label>
                  <Slider
                    id="letter-spacing"
                    min={-20}
                    max={20}
                    step={1}
                    value={[fontSettings.letterSpacing]}
                    onValueChange={(value) => setFontSettings(prev => ({ ...prev, letterSpacing: value[0] }))}
                  />
                </div>
                <div>
                  <Label htmlFor="line-height">Line Height: {fontSettings.lineHeight}</Label>
                  <Slider
                    id="line-height"
                    min={0.8}
                    max={2}
                    step={0.1}
                    value={[fontSettings.lineHeight]}
                    onValueChange={(value) => setFontSettings(prev => ({ ...prev, lineHeight: value[0] }))}
                  />
                </div>
                <div>
                  <Label htmlFor="slant">Slant: {fontSettings.slant}</Label>
                  <Slider
                    id="slant"
                    min={-45}
                    max={45}
                    step={1}
                    value={[fontSettings.slant]}
                    onValueChange={(value) => setFontSettings(prev => ({ ...prev, slant: value[0] }))}
                  />
                </div>
                <div>
                  <Label htmlFor="weight">Weight: {fontSettings.weight}</Label>
                  <Slider
                    id="weight"
                    min={100}
                    max={900}
                    step={100}
                    value={[fontSettings.weight]}
                    onValueChange={(value) => setFontSettings(prev => ({ ...prev, weight: value[0] }))}
                  />
                </div>
                <div>
                  <Label htmlFor="random-variation">Random Variation: {fontSettings.randomVariation}</Label>
                  <Slider
                    id="random-variation"
                    min={0}
                    max={100}
                    step={1}
                    value={[fontSettings.randomVariation]}
                    onValueChange={(value) => setFontSettings(prev => ({ ...prev, randomVariation: value[0] }))}
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="metrics">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="left-side-bearing">Left Side Bearing</Label>
                  <Slider
                    id="left-side-bearing"
                    min={0}
                    max={100}
                    step={1}
                    value={[getGlyphWithAlternate(selectedChar)?.metrics.leftSideBearing || 0]}
                    onValueChange={(value) => updateMetrics('leftSideBearing', value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="right-side-bearing">Right Side Bearing</Label>
                  <Slider
                    id="right-side-bearing"
                    min={0}
                    max={100}
                    step={1}
                    value={[getGlyphWithAlternate(selectedChar)?.metrics.rightSideBearing || 0]}
                    onValueChange={(value) => updateMetrics('rightSideBearing', value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="advance-width">Advance Width</Label>
                  <Slider
                    id="advance-width"
                    min={0}
                    max={500}
                    step={1}
                    value={[getGlyphWithAlternate(selectedChar)?.metrics.advanceWidth || 0]}
                    onValueChange={(value) => updateMetrics('advanceWidth', value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="baseline">Baseline</Label>
                  <Slider
                    id="baseline"
                    min={0}
                    max={400}
                    step={1}
                    value={[getGlyphWithAlternate(selectedChar)?.metrics.baseline || 0]}
                    onValueChange={(value) => updateMetrics('baseline', value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="x-height">x-Height</Label>
                  <Slider
                    id="x-height"
                    min={0}
                    max={400}
                    step={1}
                    value={[getGlyphWithAlternate(selectedChar)?.metrics.xHeight || 0]}
                    onValueChange={(value) => updateMetrics('xHeight', value[0])}
                  />
                </div>
                <div>
                  <Label htmlFor="cap-height">Cap Height</Label>
                  <Slider
                    id="cap-height"
                    min={0}
                    max={400}
                    step={1}
                    value={[getGlyphWithAlternate(selectedChar)?.metrics.capHeight || 0]}
                    onValueChange={(value) => updateMetrics('capHeight', value[0])}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <div className="mt-8">
        <Label htmlFor="test-text">Test Text</Label>
        <textarea
          id="test-text"
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={3}
          className="w-full mt-2 p-2 border border-gray-300 rounded-md"
        />
        <canvas
          ref={testCanvasRef}
          width={800}
          height={200}
          className="mt-4 border border-gray-300"
        />
      </div>
    </div>
  )
}