// English copy for the question bank, browse, knowledge-question and difficulty pages.
// Structure mirrors question.zh.ts key-for-key; shared copy reuses common / questionType / homework.
export default {
  questionBank: {
    searchPlaceholder: 'Search by question stem',
    add: 'New question',
    exportAll: 'Export all to PDF',
    mark: 'Mark this bank (pin & highlight)',
    unmark: 'Unmark',
    markAria: 'Mark question bank',
    unmarkAria: 'Unmark question bank',
    rename: 'Rename question bank',
    countAria: 'Question count',
    countUnit: 'questions',
    type: {
      choice: 'Choice',
      fill: 'Fill',
      solve: 'Solve'
    },
    subTitle: 'View the {total} questions in “{name}”',
    editSubTitle: 'Edit this sub-knowledge point (rename / merge / delete)',
    collapse: 'Collapse',
    more: '{n} more',
    empty: 'No knowledge points yet',
    exportScope: 'All questions in this bank',
    renameDialog: {
      prompt: 'Rename bank “{name}” ({total} questions):',
      title: 'Rename question bank',
      placeholder: 'New bank name',
      required: 'Name cannot be empty',
      confirm: 'OK',
      success: 'Renamed to “{name}”'
    }
  },
  questionBrowse: {
    searchPlaceholder: 'Search stem / notes',
    totalPrefix: '',
    totalSuffix: ' questions',
    export: 'Export PDF',
    filter: 'Filter',
    allTypes: 'All types',
    typeSingle: 'Single choice',
    typeMultiple: 'Multiple choice',
    allDifficulty: 'All difficulties',
    allKnowledge: 'All knowledge points',
    allSubKnowledge: 'All sub-knowledge points',
    empty: 'No questions match the current filters',
    difficultySaveFailed: 'Failed to save the difficulty. Please try again.',
    difficulty: 'Difficulty {n} stars',
    keyword: 'Containing “{keyword}”',
    all: 'All questions',
    sortSubtitle: 'Sort: {label}',
    sort: {
      default: 'Default (newest first)',
      difficulty_asc: 'Difficulty: easy → hard',
      difficulty_desc: 'Difficulty: hard → easy',
      created_desc: 'Created: newest → oldest',
      created_asc: 'Created: oldest → newest',
      type_asc: 'Type: choice → fill → solve',
      type_desc: 'Type: solve → fill → choice'
    }
  },
  knowledgeQuestions: {
    back: 'Back to banks',
    rename: 'Rename question bank',
    total: '{n} questions',
    all: 'All',
    difficultyPlaceholder: 'Filter by difficulty',
    stars: '{n} stars',
    export: 'Export PDF',
    subKnowledge: 'Sub-knowledge points',
    dropHint: 'Drop to assign',
    clearFilter: 'Clear filter',
    filterTitle: 'Filter “{name}”',
    levelTitle: 'Mastery: {label} (click to choose Basic / Medium / Advanced)',
    clearLevel: 'Clear level',
    editSubTitle: 'Edit this sub-knowledge point (rename / merge / delete)',
    filterEmptyTitle: 'Show uncategorized questions',
    noQuestions: 'No questions here yet',
    dragHintWithSubs: 'Drag onto a sub-knowledge point on the left to categorize',
    dragHintNoSubs: 'Use the dropdown on the right to categorize',
    addToHomework: 'Add to homework',
    tagsHint:
      'No sub-knowledge points yet — type a name in the dropdown on each question card to create one.',
    level: {
      basic: 'Basic',
      medium: 'Medium',
      advanced: 'Advanced',
      unset: 'Unrated'
    },
    levelMarked: 'Marked “{name}” as {level}',
    levelCleared: 'Cleared the level of “{name}”',
    assigned: 'Moved into “{name}”',
    movedToUncategorized: 'Moved back to uncategorized',
    deleteConfirm: 'Delete this question?',
    difficultySaveFailed: 'Failed to save the difficulty. Please try again.',
    renameDialog: {
      prompt: 'Rename bank “{name}” ({total} questions):',
      title: 'Rename question bank',
      placeholder: 'New bank name',
      required: 'Name cannot be empty',
      confirm: 'OK',
      success: 'Renamed to “{name}”'
    },
    sortSubtitle: 'Sort: {label}',
    sort: {
      default: 'Default (newest first)',
      difficulty_asc: 'Difficulty: easy → hard',
      difficulty_desc: 'Difficulty: hard → easy',
      created_desc: 'Created: newest → oldest',
      created_asc: 'Created: oldest → newest',
      type_asc: 'Type: choice → fill → solve',
      type_desc: 'Type: solve → fill → choice'
    }
  },
  questionAnalysis: {
    title: 'Question bank difficulty',
    intro:
      'Difficulty is a teacher’s manual rating of how complex the solution is (1–5 stars), not a score. “Unrated” is its own group: it means no judgement has been made, not that the question is easy.',
    aiRate: 'AI rate in bulk',
    allTypes: 'All types',
    typeSingle: 'Single choice',
    typeMultiple: 'Multiple choice',
    typeFill: 'Fill',
    typeSolve: 'Free response',
    allKnowledge: 'All knowledge points',
    loadError: 'Failed to load difficulty data',
    stats: {
      total: 'Total questions',
      rated: 'Rated',
      coverage: 'Coverage {percent}',
      unrated: 'Unrated',
      unratedHint: 'These questions are missing from difficulty filters',
      average: 'Average difficulty',
      averageHint: 'Rated questions only'
    },
    charts: {
      distributionTitle: 'Difficulty distribution',
      distributionHint:
        'See whether the bank is top-heavy: clusters in the middle or gaps at the hard end both show up here.',
      typeTitle: 'Type × difficulty',
      typeHint:
        'Spot at a glance whether choice questions skew easy or free-response questions only appear at 4–5 stars.',
      knowledgeTitle: 'Knowledge point × difficulty (top 12)',
      knowledgeHint:
        'A thick band at one level means that topic lacks a training gradient; blank cells mean no questions at that difficulty.',
      // 复数：vue-i18n 的 `a | b` 形式，配 t(key, n) 调用；zh 侧保持单一形式
      star: '{n} star | {n} stars',
      unrated: 'Unrated'
    },
    footer: 'To review or fill in difficulty question by question, go to',
    footerBrowse: 'Browse questions',
    footerEnd: 'and filter by “Difficulty”; click a dot to change it in place.'
  }
}
