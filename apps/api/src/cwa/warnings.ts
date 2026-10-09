import { z } from 'zod'

// CWA's county weather advisories (特報: 大雨, 豪雨, 陸上強風, 低溫, 濃霧…), checked live 2026-10-09.
// W-C0033-001 lists every county with its current hazards; W-C0033-002 carries the advisory texts.
export const WARNING_DATASETS = { counties: 'W-C0033-001', texts: 'W-C0033-002' } as const

const info = z.object({ phenomena: z.string(), significance: z.string() })
const validTime = z.object({ startTime: z.string(), endTime: z.string() })
const counties = z.object({ records: z.object({ location: z.array(z.object({
  locationName: z.string(),
  hazardConditions: z.object({ hazards: z.array(z.object({ info, validTime })).default([]) }).optional(),
})).default([]) }) })
const texts = z.object({ records: z.object({ record: z.array(z.object({
  datasetInfo: z.object({ validTime }),
  contents: z.object({ content: z.object({ contentText: z.string() }) }).optional(),
  hazardConditions: z.object({ hazards: z.object({ hazard: z.array(z.object({ info })).default([]) }) }).optional(),
})).default([]) }) })

export type Warning = { phenomena: string; significance: string; start: string; end: string; counties: string[]; text: string | null }

// "2026-10-09 10:36:00" is Taiwan time with no offset written.
const taipei = (s: string) => { const d = new Date(`${s.trim().replace(' ', 'T')}+08:00`); return Number.isNaN(d.getTime()) ? null : d.toISOString() }

/** The advisories in force, each with the counties under it and CWA's text; one with an unreadable time is dropped. */
export function normalizeWarnings(countiesRaw: unknown, textsRaw: unknown): Warning[] {
  const byKey = new Map<string, Warning>()
  for (const l of counties.parse(countiesRaw).records.location) {
    for (const h of l.hazardConditions?.hazards ?? []) {
      const start = taipei(h.validTime.startTime), end = taipei(h.validTime.endTime)
      if (!start || !end) continue
      const key = [h.info.phenomena, h.info.significance, start, end].join('|')
      const w = byKey.get(key) ?? { ...h.info, start, end, counties: [], text: null }
      if (!w.counties.includes(l.locationName)) w.counties.push(l.locationName)
      byKey.set(key, w)
    }
  }
  // The text document is matched on phenomenon and period; the leading spaces of each line are CWA's own indentation.
  for (const r of texts.parse(textsRaw).records.record) {
    const start = taipei(r.datasetInfo.validTime.startTime), end = taipei(r.datasetInfo.validTime.endTime)
    for (const h of r.hazardConditions?.hazards.hazard ?? []) {
      const w = byKey.get([h.info.phenomena, h.info.significance, start, end].join('|'))
      if (w && r.contents) w.text = r.contents.content.contentText.replace(/^[ \t]+/gm, '').trim()
    }
  }
  return [...byKey.values()]
}
