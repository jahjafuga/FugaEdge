import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import type { CatalystDef } from '@shared/catalyst-types'

// useCatalystDefs — the vocabulary the DNA catalyst pillar resolves against.
// Thin platform I/O glue, mirroring useDnaConfig (the architecture-rule split: the
// pure compute lives in /src/core/dna, this just feeds it).
//
// includeArchived is TRUE and load-bearing: a trade tagged with a since-archived
// catalyst is still a judged trade, so the pillar must be able to resolve it. Fetching
// active-only would silently reclassify that history as unjudgeable the moment a user
// tidies their vocabulary.
//
// `defs` stays EMPTY until the fetch resolves, and computeDnaAdherence reads an empty
// vocabulary as a LOAD FAILURE rather than an untagged book — which is what keeps the
// card from flashing "go tag your trades" during the first paint.

export interface UseCatalystDefsResult {
  defs: CatalystDef[]
  loading: boolean
}

export function useCatalystDefs(): UseCatalystDefsResult {
  const [defs, setDefs] = useState<CatalystDef[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void ipc
      .catalystDefsGet(true)
      .then((list) => {
        if (!cancelled) setDefs(list)
      })
      .catch(() => {
        if (!cancelled) setDefs([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { defs: defs ?? [], loading: defs === null }
}
