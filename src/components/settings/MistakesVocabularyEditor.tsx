import { ipc } from '@/lib/ipc'
import type { MistakeAxis, MistakeDef } from '@shared/mistakes-types'
import VocabularyEditor, {
  type VocabCopy,
  type VocabDef,
  type VocabGroup,
  type VocabOperations,
} from './VocabularyEditor'

// SELF-CONTAINED + RELOCATABLE: this section owns its mistake ipc wiring and
// hands it to the shared <VocabularyEditor> as a TWO-group (axis) config. The
// adapter maps the neutral groupKey -> the mistake_def axis on create/reorder
// (the group's def carries axis back via toVocab). Renderer UI + IPC only — no
// DB access (ARCHITECTURE #1).

const toVocab = (d: MistakeDef): VocabDef => ({
  id: d.id,
  name: d.name,
  sort_position: d.sort_position,
  is_archived: d.is_archived,
  group: d.axis,
})

const GROUPS: VocabGroup[] = [
  { key: 'technical', label: 'Technical' },
  { key: 'psychological', label: 'Psychological' },
]

const OPERATIONS: VocabOperations = {
  defsGet: (includeArchived) =>
    ipc.mistakeDefsGet(includeArchived).then((ds) => ds.map(toVocab)),
  create: ({ groupKey, name }) =>
    ipc.mistakeDefCreate({ axis: groupKey as MistakeAxis, name }).then(toVocab),
  rename: ({ id, name }) => ipc.mistakeDefRename({ id, name }).then(toVocab),
  reorder: ({ groupKey, ordered_ids }) =>
    ipc
      .mistakeDefsReorder({ axis: groupKey as MistakeAxis, ordered_ids })
      .then((ds) => ds.map(toVocab)),
  delete: ({ id }) => ipc.mistakeDefDelete({ id }),
  unarchive: ({ id }) => ipc.mistakeDefUnarchive({ id }).then(toVocab),
}

const COPY: VocabCopy = {
  label: 'Mistakes',
  description:
    'Your two-axis mistake vocabulary. Rename, reorder, add your own, or remove — defaults and trade-tagged mistakes are archived, not deleted.',
  addPlaceholder: 'Add a mistake (press Enter)',
  keptInHistoryNote: (name) =>
    `“${name}” was kept in your history — it's a default or it's on existing trades.`,
  permanentlyRemovedNote: (name) =>
    `“${name}” was permanently removed — it was a custom mistake with no trades tagged.`,
}

export default function MistakesVocabularyEditor() {
  return <VocabularyEditor groups={GROUPS} operations={OPERATIONS} copy={COPY} />
}
