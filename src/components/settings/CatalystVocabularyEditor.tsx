import { ipc } from '@/lib/ipc'
import type { CatalystDef } from '@shared/catalyst-types'
import VocabularyEditor, {
  type VocabCopy,
  type VocabDef,
  type VocabGroup,
  type VocabOperations,
} from './VocabularyEditor'

// SELF-CONTAINED + RELOCATABLE: this section owns its catalyst ipc wiring and
// hands it to the shared <VocabularyEditor> as a SINGLE-group (no-axis) config.
// The adapter drops the neutral groupKey on create/reorder — catalyst has no
// axis. Renderer UI + IPC only — no DB access (ARCHITECTURE #1).

const toVocab = (d: CatalystDef): VocabDef => ({
  id: d.id,
  name: d.name,
  sort_position: d.sort_position,
  is_archived: d.is_archived,
  group: null,
})

const GROUPS: VocabGroup[] = [{ key: null, label: 'Catalyst type' }]

const OPERATIONS: VocabOperations = {
  defsGet: (includeArchived) =>
    ipc.catalystDefsGet(includeArchived).then((ds) => ds.map(toVocab)),
  create: ({ name }) => ipc.catalystDefCreate({ name }).then(toVocab),
  rename: ({ id, name }) => ipc.catalystDefRename({ id, name }).then(toVocab),
  reorder: ({ ordered_ids }) =>
    ipc.catalystDefsReorder({ ordered_ids }).then((ds) => ds.map(toVocab)),
  delete: ({ id }) => ipc.catalystDefDelete({ id }),
  unarchive: ({ id }) => ipc.catalystDefUnarchive({ id }).then(toVocab),
}

const COPY: VocabCopy = {
  label: 'Catalysts',
  description:
    'Your catalyst vocabulary. Rename, reorder, add your own, or remove — defaults and catalysts used on trades are archived, not deleted.',
  addPlaceholder: 'Add a catalyst (press Enter)',
  keptInHistoryNote: (name) =>
    `“${name}” was kept in your history — it’s a default or it’s used on trades.`,
}

export default function CatalystVocabularyEditor() {
  return <VocabularyEditor groups={GROUPS} operations={OPERATIONS} copy={COPY} />
}
