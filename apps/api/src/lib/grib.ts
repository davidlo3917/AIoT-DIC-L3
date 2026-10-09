// GRIB2 reader for exactly what CWA's WRF files (M-A0064-*) contain: a Lambert conformal grid (template 3.30),
// simple packing (5.0) without a bitmap, one field per message. Anything else throws rather than being guessed at.
// ponytail: no eccodes, no other templates — add them when a second GRIB product is ingested.

const sm32 = (v: number) => (v & 0x80000000 ? -(v & 0x7fffffff) : v) // GRIB2 signed ints are sign-magnitude
const sm16 = (v: number) => (v & 0x8000 ? -(v & 0x7fff) : v)
const sm8 = (v: number) => (v & 0x80 ? -(v & 0x7f) : v)

export type LccGrid = { nx: number; ny: number; lat1: number; lon1: number; lov: number; latin1: number; latin2: number; dx: number; dy: number; radius: number }

export type GribHeader = {
  length: number // of the whole message
  refTime: Date // the model run
  discipline: number; category: number; parameter: number // e.g. 0/2/2 = meteorological / momentum / U wind
  forecastHours: number
  levelType: number; level: number // 103/10 = 10 m above ground
  grid: LccGrid
  packing: { template: number; R: number; E: number; D: number; bits: number; points: number }
  data: { offset: number; length: number } // section 7's payload, relative to the message start
}

const MAX_MESSAGE = 64 * 1024 * 1024
const MAX_POINTS = 4_000_000

/** Sections 0–6 of one message. Needs only the first few hundred bytes of it (179 or 203 in CWA's files). */
export function parseHeader(b: Buffer): GribHeader {
  if (b.length < 16 || b.toString('latin1', 0, 4) !== 'GRIB' || b[7] !== 2) throw new Error('grib: not a GRIB2 message')
  const length = Number(b.readBigUInt64BE(8))
  if (length < 16 || length > MAX_MESSAGE) throw new Error(`grib: message length ${length}`)
  const h: Partial<GribHeader> = { length, discipline: b[6] }
  let at = 16
  while (at + 5 <= b.length) {
    const len = b.readUInt32BE(at), n = b[at + 4]
    if (len < 5) throw new Error(`grib: section ${n} of ${len} bytes`)
    if (n === 7) { h.data = { offset: at + 5, length: len - 5 }; break }
    if (at + len > b.length) throw new Error(`grib: section ${n} of ${len} bytes runs past the ${b.length} bytes read`)
    const s = b.subarray(at, at + len)
    if (n === 1) h.refTime = new Date(Date.UTC(s.readUInt16BE(12), s[14] - 1, s[15], s[16], s[17], s[18]))
    else if (n === 3) {
      const template = s.readUInt16BE(12)
      if (template !== 30 || len < 81) throw new Error(`grib: grid template 3.${template}; only Lambert conformal (3.30) is supported`)
      if (s[14] !== 6) throw new Error(`grib: earth shape ${s[14]}; only the spherical earth (6) is supported`)
      if (s[46] & 0x08) throw new Error('grib: vector components are grid-relative, not earth-relative')
      if (s[64] !== 0x40) throw new Error(`grib: scanning mode ${s[64].toString(2)}; only +i west→east, +j south→north, rows consecutive is supported`)
      h.grid = {
        nx: s.readUInt32BE(30), ny: s.readUInt32BE(34), lat1: sm32(s.readUInt32BE(38)) / 1e6, lon1: sm32(s.readUInt32BE(42)) / 1e6,
        lov: sm32(s.readUInt32BE(51)) / 1e6, dx: s.readUInt32BE(55) / 1e3, dy: s.readUInt32BE(59) / 1e3,
        // Shape 6 nominally means a 6,371,229 m sphere, but WRF runs on a 6,370,000 m one, and only with that radius
        // does CWA's documented far corner (140.9138°E, 32.1202°N) land on the last grid point; the other is 0.2 cells off.
        latin1: sm32(s.readUInt32BE(65)) / 1e6, latin2: sm32(s.readUInt32BE(69)) / 1e6, radius: 6_370_000,
      }
    } else if (n === 4) {
      if (len < 34) throw new Error('grib: product definition is too short')
      h.category = s[9]
      h.parameter = s[10]
      const unit = s[17], time = s.readUInt32BE(18) // 0 = minutes, 1 = hours
      if (unit !== 0 && unit !== 1) throw new Error(`grib: forecast time unit ${unit}`)
      h.forecastHours = unit === 1 ? time : time / 60
      h.levelType = s[22]
      h.level = sm32(s.readUInt32BE(24)) / 10 ** sm8(s[23])
    } else if (n === 5) {
      if (len < 21) throw new Error('grib: data representation is too short')
      h.packing = { points: s.readUInt32BE(5), template: s.readUInt16BE(9), R: s.readFloatBE(11), E: sm16(s.readUInt16BE(15)), D: sm16(s.readUInt16BE(17)), bits: s[19] }
    } else if (n === 6 && s[5] !== 255) throw new Error('grib: bitmapped data is not supported')
    at += len
  }
  if (!h.data || !h.refTime || !h.grid || !h.packing || h.category == null) throw new Error('grib: incomplete header; read more of the message')
  if (h.grid.nx * h.grid.ny !== h.packing.points || h.packing.points > MAX_POINTS) throw new Error(`grib: ${h.grid.nx}×${h.grid.ny} grid but ${h.packing.points} points`)
  if (h.data.offset + h.data.length + 4 > length) throw new Error('grib: data section runs past the message')
  return h as GribHeader
}

/** Simple packing (template 5.0): value = (R + X · 2^E) / 10^D, X an unsigned `bits`-wide integer per point. */
export function unpackSimple(payload: Buffer, { template, R, E, D, bits, points }: GribHeader['packing']): Float32Array {
  if (template !== 0) throw new Error(`grib: packing template 5.${template}; only simple packing is supported`)
  if (bits < 1 || bits > 31) throw new Error(`grib: ${bits} bits per value`)
  if (payload.length * 8 < points * bits) throw new Error(`grib: ${payload.length} bytes hold fewer than ${points} values`)
  const scale = 2 ** E / 10 ** D, base = R / 10 ** D
  const out = new Float32Array(points)
  let acc = 0, have = 0, at = 0 // acc never exceeds bits + 7 ≤ 38 bits, exact in a double
  for (let i = 0; i < points; i++) {
    while (have < bits) { acc = acc * 256 + payload[at++]; have += 8 }
    have -= bits
    const x = Math.floor(acc / 2 ** have)
    acc -= x * 2 ** have
    out[i] = base + x * scale
  }
  return out
}

/** (lat, lon) → fractional grid position [i, j] of a Lambert conformal conic grid on a sphere (Snyder's secant-cone form). */
export function lccProjector({ lat1, lon1, lov, latin1, latin2, dx, dy, radius }: LccGrid) {
  const rad = Math.PI / 180, p1 = latin1 * rad, p2 = latin2 * rad
  const T = (p: number) => Math.tan(Math.PI / 4 + p / 2)
  const n = p1 === p2 ? Math.sin(p1) : Math.log(Math.cos(p1) / Math.cos(p2)) / Math.log(T(p2) / T(p1))
  const F = (Math.cos(p1) * T(p1) ** n) / n
  const xy = (lat: number, lon: number) => {
    const rho = (radius * F) / T(lat * rad) ** n, theta = n * ((((lon - lov + 540) % 360) - 180) * rad)
    return [rho * Math.sin(theta), -rho * Math.cos(theta)] // y grows northward: rho shrinks toward the pole
  }
  const [x0, y0] = xy(lat1, lon1)
  return (lat: number, lon: number): [number, number] => {
    const [x, y] = xy(lat, lon)
    return [(x - x0) / dx, (y - y0) / dy]
  }
}
