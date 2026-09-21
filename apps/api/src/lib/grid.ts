import { encodePng } from './png.js'

/** How a float grid is packed into a PNG: value16 = round((v + offset) * scale), R = high byte, G = low byte, A = valid. */
export type GridEncoding = { encoding: 'rg16'; offset: number; scale: number; unit: string; width: number; height: number }

/**
 * CWA grids: scientific notation, first value = south-west corner, west→east then south→north.
 * Separators are inconsistent between products — commas, and in some a bare newline between rows — so split on both.
 */
export function parseGrid(content: string, width: number, height: number): Float32Array {
  const values = Float32Array.from(content.split(/[,\s]+/).filter(Boolean), Number)
  if (values.length !== width * height) throw new Error(`grid: expected ${width}×${height} = ${width * height} values, got ${values.length}`)
  return values
}

export function gridToPng(values: Float32Array, enc: GridEncoding, isValid: (v: number) => boolean): Buffer {
  const { width, height, offset, scale } = enc
  const rgba = new Uint8Array(width * height * 4) // alpha 0 everywhere = "no data" until proven otherwise
  for (let row = 0; row < height; row++) {
    const out = (height - 1 - row) * width // images are north-up; the grid starts in the south
    for (let col = 0; col < width; col++) {
      const v = values[row * width + col]
      if (!isValid(v)) continue
      const q = Math.max(0, Math.min(65535, Math.round((v + offset) * scale)))
      const i = (out + col) * 4
      rgba[i] = q >> 8
      rgba[i + 1] = q & 255
      rgba[i + 3] = 255
    }
  }
  return encodePng(width, height, rgba)
}
