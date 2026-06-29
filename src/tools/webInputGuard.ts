interface ExplicitWebTarget {
  raw: string
  url: URL
  host: string
  hasExplicitPath: boolean
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'，。！？；、]+/gi
const DOMAIN_PATTERN = /(?:^|[^\w@.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"'，。！？；、]*)?)/gi
const TRAILING_PUNCTUATION = /[.,，。!?！？;；:：)\]）】>"']+$/

export function normalizeWebToolInput(
  toolName: string,
  input: Record<string, unknown>,
  userMessage: string,
): Record<string, unknown> {
  const targets = extractExplicitWebTargets(userMessage)
  if (targets.length !== 1) return input

  const target = targets[0]!
  if (toolName === 'web_fetch') {
    return normalizeWebFetchInput(input, target)
  }
  if (toolName === 'web_search') {
    return normalizeWebSearchInput(input, target)
  }
  return input
}

function normalizeWebFetchInput(
  input: Record<string, unknown>,
  target: ExplicitWebTarget,
): Record<string, unknown> {
  if (typeof input.url !== 'string') return input

  const requestedUrl = parseLooseUrl(input.url)
  if (!requestedUrl || sameHost(requestedUrl.host, target.host)) return input

  return {
    ...input,
    url: buildCorrectedFetchUrl(requestedUrl, target),
  }
}

function normalizeWebSearchInput(
  input: Record<string, unknown>,
  target: ExplicitWebTarget,
): Record<string, unknown> {
  if (typeof input.query !== 'string') return input
  if (input.query.includes(target.host)) return input

  const queryTargets = extractExplicitWebTargets(input.query)
  if (queryTargets.length === 0) {
    return {
      ...input,
      query: `${target.host} ${input.query}`,
    }
  }

  let query = input.query
  for (const queryTarget of queryTargets) {
    if (!sameHost(queryTarget.host, target.host)) {
      query = query.split(queryTarget.raw).join(target.host)
    }
  }

  if (!query.includes(target.host)) {
    query = `${target.host} ${query}`
  }

  return {
    ...input,
    query,
  }
}

function buildCorrectedFetchUrl(requestedUrl: URL, target: ExplicitWebTarget): string {
  if (target.hasExplicitPath) {
    return target.url.toString()
  }

  const corrected = new URL(requestedUrl.toString())
  corrected.protocol = target.url.protocol
  corrected.hostname = target.url.hostname
  corrected.port = target.url.port
  corrected.username = ''
  corrected.password = ''
  return corrected.toString()
}

function extractExplicitWebTargets(text: string): ExplicitWebTarget[] {
  const targets: ExplicitWebTarget[] = []
  const coveredRanges: Array<[number, number]> = []

  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = cleanTarget(match[0] ?? '')
    const target = toTarget(raw)
    if (target) {
      targets.push(target)
      coveredRanges.push([match.index ?? 0, (match.index ?? 0) + raw.length])
    }
  }

  DOMAIN_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = DOMAIN_PATTERN.exec(text)) !== null) {
    const rawMatch = match[1] ?? ''
    const start = match.index + (match[0].length - rawMatch.length)
    const end = start + rawMatch.length
    if (coveredRanges.some(([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd)) {
      continue
    }

    const raw = cleanTarget(rawMatch)
    const target = toTarget(raw)
    if (target) targets.push(target)
  }

  return dedupeTargets(targets)
}

function toTarget(raw: string): ExplicitWebTarget | undefined {
  const url = parseLooseUrl(raw)
  if (!url || !url.hostname.includes('.')) return undefined

  return {
    raw,
    url,
    host: normalizeHost(url.host),
    hasExplicitPath: url.pathname !== '/' || Boolean(url.search) || Boolean(url.hash),
  }
}

function parseLooseUrl(value: string): URL | undefined {
  const trimmed = cleanTarget(value)
  if (!trimmed) return undefined

  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return undefined
  }
}

function cleanTarget(value: string): string {
  return value.trim().replace(TRAILING_PUNCTUATION, '')
}

function sameHost(a: string, b: string): boolean {
  return normalizeHost(a) === normalizeHost(b)
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '')
}

function dedupeTargets(targets: ExplicitWebTarget[]): ExplicitWebTarget[] {
  const seen = new Set<string>()
  const result: ExplicitWebTarget[] = []
  for (const target of targets) {
    const key = `${target.host}${target.url.pathname}${target.url.search}${target.url.hash}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(target)
  }
  return result
}
