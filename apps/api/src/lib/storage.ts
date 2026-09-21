// Supabase Storage over plain fetch — three calls don't justify the supabase-js dependency.
const env = () => {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, SUPABASE_STORAGE_BUCKET: bucket } = process.env
  if (!url || !key || !bucket) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET must all be set')
  return { base: `${url}/storage/v1`, bucket, headers: { Authorization: `Bearer ${key}`, apikey: key } }
}

export const publicUrl = (path: string) => `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET}/${path}`

export async function upload(path: string, body: Buffer, contentType: 'image/png' | 'image/jpeg') {
  const { base, bucket, headers } = env()
  const res = await fetch(`${base}/object/${bucket}/${path}`, {
    method: 'POST',
    // Frame paths embed their timestamp, so a given path never changes content: cache forever, overwrite safely.
    headers: { ...headers, 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000, immutable', 'x-upsert': 'true' },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`storage upload ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`)
}

export async function remove(paths: string[]) {
  if (!paths.length) return
  const { base, bucket, headers } = env()
  const res = await fetch(`${base}/object/${bucket}`, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`storage remove (${paths.length} objects): ${res.status} ${(await res.text()).slice(0, 200)}`)
}
