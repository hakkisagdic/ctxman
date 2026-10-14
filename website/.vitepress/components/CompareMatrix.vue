<script setup>
import { computed } from 'vue';
import landscape from '../data/landscape.json';

const props = defineProps({
  lang: { type: String, default: 'en' },
});

const lang = computed(() => (props.lang === 'tr' ? 'tr' : 'en'));
const legend = computed(() => landscape.legend[lang.value]);
const groups = computed(() =>
  landscape.groups.map((group) => ({
    ...group,
    rows: landscape.rows.filter((row) => row.group === group.id),
  }))
);
const note = (row, column) => row.notes?.[column]?.[lang.value];

// Hover titles don't reach touch screens, so every note is also listed under the table
const columnName = (id) => landscape.columns.find((c) => c.id === id)?.name ?? id;
const notes = computed(() =>
  landscape.rows.flatMap((row) =>
    Object.keys(row.notes || {}).map((column) => ({
      key: `${row.id}-${column}`,
      column: columnName(column),
      row: row.label[lang.value],
      text: note(row, column),
    }))
  )
);
const sources = computed(() =>
  landscape.columns
    .filter((c) => landscape.sources[c.id]?.length)
    .map((c) => ({ id: c.id, name: c.name, urls: landscape.sources[c.id] }))
);
// Notes mark commands with backticks; render them as code without trusting other markup
const escape = (text) =>
  text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );
const code = (text) => escape(text).replace(/`([^`]+)`/g, '<code>$1</code>');
const host = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
</script>

<template>
  <div class="matrix-wrap">
    <table class="matrix">
      <thead>
        <tr>
          <th scope="col"></th>
          <th
            v-for="c in landscape.columns"
            :key="c.id"
            scope="col"
            :class="{ us: c.id === 'ctxman' }"
          >
            <a v-if="c.url" :href="c.url" target="_blank" rel="noopener">{{ c.name }}</a>
            <template v-else>{{ c.name }}</template>
            <small>{{ c.kind[lang] }}</small>
          </th>
        </tr>
      </thead>
      <tbody v-for="g in groups" :key="g.id">
        <tr class="group">
          <th :colspan="landscape.columns.length + 1" scope="rowgroup">{{ g.label[lang] }}</th>
        </tr>
        <tr v-for="r in g.rows" :key="r.id">
          <th scope="row">{{ r.label[lang] }}</th>
          <td
            v-for="c in landscape.columns"
            :key="c.id"
            :class="[r.values[c.id] ?? 'unknown', { us: c.id === 'ctxman' }]"
            :title="note(r, c.id) || legend[r.values[c.id] ?? 'unknown']"
          >
            <span
              v-if="(r.values[c.id] ?? 'unknown') === 'unknown'"
              class="mark-q"
              aria-hidden="true"
              >?</span
            >
            <span v-else class="mark" :class="r.values[c.id]" aria-hidden="true"></span>
            <span class="sr-only">{{ legend[r.values[c.id] ?? 'unknown'] }}</span>
            <sup v-if="note(r, c.id)" aria-hidden="true">*</sup>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="legend">
    <span class="mark yes" aria-hidden="true"></span> {{ legend.yes }} ·
    <span class="mark partial" aria-hidden="true"></span> {{ legend.partial }} ·
    <span class="mark no" aria-hidden="true"></span> {{ legend.no }} ·
    <span class="mark-q" aria-hidden="true">?</span> {{ legend.unknown }} · <sup>*</sup>
    {{ legend.note }}
  </p>
  <details v-if="notes.length" class="fineprint">
    <summary>{{ legend.notesTitle }}</summary>
    <ul>
      <li v-for="n in notes" :key="n.key">
        <strong>{{ n.column }}</strong> — {{ n.row }}: <span v-html="code(n.text)"></span>
      </li>
    </ul>
  </details>
  <details v-if="sources.length" class="fineprint">
    <summary>{{ legend.sourcesTitle }}</summary>
    <p v-if="landscape.method">{{ landscape.method[lang] }}</p>
    <ul>
      <li v-for="s in sources" :key="s.id">
        <strong>{{ s.name }}</strong
        >:
        <template v-for="(url, i) in s.urls" :key="url">
          <a :href="url" target="_blank" rel="noopener">{{ host(url) }}</a
          ><span v-if="i < s.urls.length - 1">, </span>
        </template>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.matrix-wrap {
  /* Contains the absolutely positioned .sr-only labels, which would otherwise widen the page */
  position: relative;
  /* Nine columns need more than the text column: break out of it, centred on the page */
  left: 50%;
  width: min(1180px, calc(100vw - 64px));
  transform: translateX(-50%);
  margin: 1.5rem 0 0.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  overflow-x: auto;
}

.matrix {
  display: table;
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.matrix th,
.matrix td {
  padding: 0.55rem 0.7rem;
  border: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  background: none;
  text-align: center;
  white-space: nowrap;
}

.matrix thead th {
  vertical-align: bottom;
  font-weight: 700;
}

.matrix thead small {
  display: block;
  font-weight: 500;
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

.matrix tbody th[scope='row'] {
  min-width: 13rem;
  text-align: left;
  font-weight: 500;
  white-space: normal;
}

/* The row labels stay in view while the columns scroll sideways */
.matrix tbody th[scope='row'],
.matrix thead th:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--vp-c-bg);
}

.matrix tbody tr:nth-child(2n) th[scope='row'] {
  background: var(--vp-c-bg-soft);
}

@media (max-width: 640px) {
  .matrix tbody th[scope='row'] {
    min-width: 9rem;
  }
}

.matrix tr.group th {
  padding-top: 1rem;
  text-align: left;
  font: 700 0.72rem/1.4 var(--vp-font-family-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
}

.matrix .us {
  background: var(--vp-c-brand-soft);
}

.matrix td {
  font-size: 1rem;
}

.matrix td.yes {
  color: #10b981;
}

.matrix td.partial {
  color: #f59e0b;
}

.matrix td.no,
.matrix td.unknown {
  color: var(--vp-c-text-3);
}

.matrix sup {
  color: var(--vp-c-text-2);
}

.legend {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}

.fineprint {
  margin: 0.75rem 0;
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

.fineprint summary {
  cursor: pointer;
  font-weight: 600;
}

.fineprint ul {
  margin: 0.5rem 0;
}

.fineprint a {
  overflow-wrap: anywhere;
}

.mark {
  display: inline-block;
  box-sizing: border-box;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  vertical-align: middle;
}

.mark.yes {
  background: #10b981;
}

.mark.partial {
  border: 2px solid #f59e0b;
  background: linear-gradient(90deg, #f59e0b 50%, transparent 50%);
}

.mark.no {
  border: 2px solid var(--vp-c-text-3);
}

.mark-q {
  font-weight: 600;
  color: var(--vp-c-text-3);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
