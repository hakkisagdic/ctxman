<script setup>
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import showcase from '../data/showcase.json';
import landscape from '../data/landscape.json';
import ContextWindowDemo from './ContextWindowDemo.vue';

const props = defineProps({
  lang: { type: String, default: 'en' },
});

const INSTALL = 'npm install -g ctxman';
const REPO = 'https://github.com/hakkisagdic/ctxman';
const { stats, examples } = showcase;

const content = {
  en: {
    eyebrow: 'Open source · MIT · runs on your machine',
    title: ['Context your AI', 'can trust.'],
    lead: 'ctxman turns any repository into model-ready context: exact token counts, method maps in 14 languages and budgets that never overflow — served to your tools over the CLI, MCP and REST, without your code leaving your machine.',
    primary: 'Get started',
    secondary: 'See it on a real repo',
    copy: 'Copy',
    copied: 'Copied',
    worksWith: 'Works with',
    clients: [
      'Claude Desktop',
      'Claude Code',
      'Cursor',
      'VS Code',
      'any MCP client',
      'CI pipelines',
    ],
    problemTitle: 'Context windows are big. Repositories are bigger.',
    problemLead:
      'Dumping a repository into a prompt wastes the window on lockfiles, build output and boilerplate. ctxman measures what is there and keeps what matters.',
    stats: [
      [`${stats.reduction}%`, 'smaller context from two plain-text rule files'],
      [`${stats.toonSaving}%`, 'fewer tokens for the same method map with TOON'],
      [stats.methods.toLocaleString('en-US'), 'methods mapped with line and token counts'],
      [`${stats.scanMs} ms`, `to scan ${stats.scannedFiles} files`],
    ],
    waysTitle: 'Four ways in, one engine',
    waysLead: 'Use it by hand, wire it into an assistant, call it from a service or embed it.',
    ways: [
      {
        id: 'cli',
        tab: 'CLI',
        title: 'Analyse, filter and export from the terminal',
        code: `$ ctxman --cli -m --context-export -o toon\n$ ctxman --cli --changed-since main --target-model claude-sonnet-4.5\n$ ctxman github facebook/react --chunk`,
      },
      {
        id: 'mcp',
        tab: 'MCP',
        title: 'Give Claude, Cursor or VS Code tools to read your codebase',
        code: `// claude_desktop_config.json\n{\n  "mcpServers": {\n    "ctxman": {\n      "command": "node",\n      "args": ["<npm root -g>/ctxman/bin/mcp-server.js"]\n    }\n  }\n}`,
      },
      {
        id: 'rest',
        tab: 'REST',
        title: 'A local HTTP API for services and scripts',
        code: `$ ctxman serve --port 3000\n$ curl -s localhost:3000/api/v1/context \\\n    -H 'Content-Type: application/json' \\\n    -d '{"path": ".", "targetTokens": 30000}'`,
      },
      {
        id: 'lib',
        tab: 'Library',
        title: 'Embed the analyzer in your own Node.js tooling',
        code: `import { TokenAnalyzer } from 'ctxman';\n\nconst analyzer = new TokenAnalyzer(process.cwd(), { methodLevel: true });\nconst files = analyzer.analyze();\nconsole.log(analyzer.stats.totalTokens);`,
      },
    ],
    bentoTitle: 'Everything a model needs, nothing it does not',
    bento: {
      exact: [
        'Exact token counts',
        'tiktoken counts per file, directory and method, with a calibrated estimate as fallback.',
      ],
      methods: [
        'Method maps',
        'Every method with its line and its own token count, in 14 languages.',
      ],
      budget: [
        'Budgets that hold',
        'Pack the most central files into a hard token budget over REST or MCP.',
      ],
      redact: [
        'Secrets stay out',
        'Cloud keys, tokens and private keys become [REDACTED] before export.',
      ],
      git: [
        'Only what changed',
        'Limit any run to the files changed since a branch, tag or commit.',
      ],
      formats: [
        'Any format',
        'TOON, JSON, YAML, Markdown, CSV, XML or a GitIngest digest — to a file, the clipboard or chunks.',
      ],
    },
    teamTitle: 'Built for teams that cannot send their code away',
    team: [
      [
        'Local-first',
        'No hosted service and no telemetry: analysis runs where the code is, on a laptop or a CI runner.',
      ],
      [
        'Rules in the repository',
        '.contextignore, .contextinclude and .methodinclude are plain files, reviewed and versioned like code.',
      ],
      [
        'Team profiles',
        'Shared profiles and templates give every engineer the same context for the same task.',
      ],
      [
        'Locked-down servers',
        'REST and MCP bind to localhost, refuse foreign Host headers, keep CORS off and accept an auth token.',
      ],
      [
        'Deterministic output',
        'Same commit, same context. Snapshots and diffs show how the context grows over time.',
      ],
      ['MIT licensed', 'Read it, fork it, run it air-gapped. No seats, no lock-in.'],
    ],
    compareTitle: 'How ctxman compares',
    compareLead:
      'Hosted context engines index your code on their servers; packers flatten it into one file. ctxman measures and shapes it locally.',
    compareCta: 'Full comparison with sources',
    compareChecked: 'Checked',
    roadmapTitle: 'On the roadmap',
    roadmapLead:
      'Planned, not shipped yet. Several come from what teams expect of enterprise context engines.',
    roadmapCta: 'Follow and discuss on GitHub',
    showcaseTitle: 'We pointed it at its own repository',
    showcaseLead:
      'Every number on this page comes from a script that runs the CLI, the MCP server and the REST API on a clone of ctxman. Nothing is edited by hand.',
    showcaseCta: 'Open the showcase',
    finalTitle: 'See where your tokens go',
    finalLead: 'One command to install, one to measure your repository.',
    github: 'GitHub',
    unitTokens: 'tokens',
    unitFiles: 'files',
    exactCaption: `ctxman's own source, ${examples.contextinclude.files} files, tiktoken cl100k`,
  },
  tr: {
    eyebrow: 'Açık kaynak · MIT · sizin makinenizde çalışır',
    title: ['Yapay zekânın', 'güvenebileceği bağlam.'],
    lead: 'ctxman her repoyu modele hazır bağlama dönüştürür: birebir token sayımı, 14 dilde metot haritası ve asla taşmayan bütçeler — CLI, MCP ve REST ile araçlarınıza sunulur, kodunuz makinenizden çıkmaz.',
    primary: 'Başlayın',
    secondary: 'Gerçek bir repoda görün',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    worksWith: 'Birlikte çalışır',
    clients: [
      'Claude Desktop',
      'Claude Code',
      'Cursor',
      'VS Code',
      'her MCP istemcisi',
      'CI hatları',
    ],
    problemTitle: 'Bağlam pencereleri büyük. Repolar daha büyük.',
    problemLead:
      'Bir repoyu olduğu gibi prompt’a dökmek pencereyi lock dosyalarına, derleme çıktılarına ve kalıp koda harcar. ctxman ne olduğunu ölçer ve önemli olanı tutar.',
    stats: [
      [`%${stats.reduction}`, 'iki düz metin kural dosyasıyla daha küçük bağlam'],
      [`%${stats.toonSaving}`, 'aynı metot haritası için TOON ile daha az token'],
      [stats.methods.toLocaleString('tr-TR'), 'satır ve token sayısıyla çıkarılan metot'],
      [`${stats.scanMs} ms`, `${stats.scannedFiles} dosyayı taramak için`],
    ],
    waysTitle: 'Dört giriş yolu, tek motor',
    waysLead: 'Elle kullanın, bir asistana bağlayın, bir servisten çağırın ya da gömün.',
    ways: [
      {
        id: 'cli',
        tab: 'CLI',
        title: 'Terminalden analiz edin, filtreleyin, dışa aktarın',
        code: `$ ctxman --cli -m --context-export -o toon\n$ ctxman --cli --changed-since main --target-model claude-sonnet-4.5\n$ ctxman github facebook/react --chunk`,
      },
      {
        id: 'mcp',
        tab: 'MCP',
        title: 'Claude, Cursor veya VS Code’a kod tabanınızı okuyan araçlar verin',
        code: `// claude_desktop_config.json\n{\n  "mcpServers": {\n    "ctxman": {\n      "command": "node",\n      "args": ["<npm root -g>/ctxman/bin/mcp-server.js"]\n    }\n  }\n}`,
      },
      {
        id: 'rest',
        tab: 'REST',
        title: 'Servisler ve betikler için yerel HTTP API',
        code: `$ ctxman serve --port 3000\n$ curl -s localhost:3000/api/v1/context \\\n    -H 'Content-Type: application/json' \\\n    -d '{"path": ".", "targetTokens": 30000}'`,
      },
      {
        id: 'lib',
        tab: 'Kütüphane',
        title: 'Analizi kendi Node.js araçlarınıza gömün',
        code: `import { TokenAnalyzer } from 'ctxman';\n\nconst analyzer = new TokenAnalyzer(process.cwd(), { methodLevel: true });\nconst files = analyzer.analyze();\nconsole.log(analyzer.stats.totalTokens);`,
      },
    ],
    bentoTitle: 'Modelin ihtiyacı olan her şey, fazlası değil',
    bento: {
      exact: [
        'Birebir token sayımı',
        'Dosya, klasör ve metot başına tiktoken sayımı; yedek olarak kalibre edilmiş tahmin.',
      ],
      methods: ['Metot haritaları', 'Her metot satırı ve kendi token sayısıyla, 14 dilde.'],
      budget: [
        'Tutan bütçeler',
        'En merkezi dosyaları REST veya MCP üzerinden kesin bir token bütçesine sığdırın.',
      ],
      redact: [
        'Sırlar dışarıda kalır',
        'Bulut anahtarları, token’lar ve özel anahtarlar dışa aktarımdan önce [REDACTED] olur.',
      ],
      git: [
        'Yalnızca değişenler',
        'Herhangi bir çalıştırmayı bir daldan, etiketten veya commit’ten beri değişen dosyalarla sınırlayın.',
      ],
      formats: [
        'Her format',
        'TOON, JSON, YAML, Markdown, CSV, XML veya GitIngest özeti — dosyaya, panoya ya da parçalara.',
      ],
    },
    teamTitle: 'Kodunu dışarı gönderemeyen ekipler için',
    team: [
      [
        'Önce yerel',
        'Barındırılan servis ve telemetri yok: analiz kodun olduğu yerde, dizüstünde ya da CI makinesinde çalışır.',
      ],
      [
        'Kurallar repoda',
        '.contextignore, .contextinclude ve .methodinclude düz dosyalardır; kod gibi incelenir ve sürümlenir.',
      ],
      [
        'Ekip profilleri',
        'Paylaşılan profiller ve şablonlar her mühendise aynı iş için aynı bağlamı verir.',
      ],
      [
        'Kilitli sunucular',
        'REST ve MCP localhost’a bağlanır, yabancı Host başlıklarını reddeder, CORS kapalıdır, token ile kimlik doğrular.',
      ],
      [
        'Belirlenimci çıktı',
        'Aynı commit, aynı bağlam. Anlık görüntüler ve farklar bağlamın zamanla nasıl büyüdüğünü gösterir.',
      ],
      [
        'MIT lisanslı',
        'Okuyun, çatallayın, internetsiz ortamda çalıştırın. Koltuk yok, bağımlılık yok.',
      ],
    ],
    compareTitle: 'ctxman nasıl ayrışır',
    compareLead:
      'Barındırılan bağlam motorları kodunuzu kendi sunucularında indeksler; paketleyiciler onu tek dosyaya düzleştirir. ctxman onu yerelde ölçer ve şekillendirir.',
    compareCta: 'Kaynaklarıyla tam karşılaştırma',
    compareChecked: 'Kontrol tarihi',
    roadmapTitle: 'Yol haritasında',
    roadmapLead:
      'Planlandı, henüz yayında değil. Birçoğu ekiplerin kurumsal bağlam motorlarından beklediklerinden geliyor.',
    roadmapCta: "GitHub'da takip edin ve tartışın",
    showcaseTitle: 'Kendi reposuna çevirdik',
    showcaseLead:
      'Bu sayfadaki her sayı, CLI’yi, MCP sunucusunu ve REST API’yi ctxman’in bir klonunda çalıştıran bir betikten gelir. Hiçbiri elle düzenlenmedi.',
    showcaseCta: 'Vitrini açın',
    finalTitle: "Token'larınızın nereye gittiğini görün",
    finalLead: 'Kurmak için bir komut, reponuzu ölçmek için bir komut.',
    github: 'GitHub',
    unitTokens: 'token',
    unitFiles: 'dosya',
    exactCaption: `ctxman'in kendi kaynak kodu, ${examples.contextinclude.files} dosya, tiktoken cl100k`,
  },
};

const t = computed(() => content[props.lang] ?? content.en);
const lang = computed(() => (props.lang === 'tr' ? 'tr' : 'en'));
const prefix = computed(() => (props.lang === 'tr' ? '/tr' : ''));
const numberLocale = computed(() => (props.lang === 'tr' ? 'tr-TR' : 'en-US'));
const link = (page) => withBase(`${prefix.value}${page}`);

const activeWay = ref('cli');
const way = computed(() => t.value.ways.find((w) => w.id === activeWay.value) ?? t.value.ways[0]);

const methodSnippet = examples.methods.output.split('\n').slice(5, 12).join('\n');
// Just the key assignment of the fixture's config line, before and after redaction
const keyPart = (line) => line.slice(line.indexOf('accessKeyId')).replace(/\s*};?\s*$/, '');
const redactBefore = keyPart(examples.redaction.source.split('\n')[1]);
const redactAfter = keyPart(
  examples.redaction.digest.split('\n').find((line) => line.includes('aws-access'))
);

// Inline `code` in roadmap texts
const segments = (value) => value.split('`').map((part, i) => ({ code: i % 2 === 1, text: part }));
const changedFiles = examples.changed.files;

// The landing table shows the summary rows and columns; the compare page has everything
const compareColumns = landscape.columns.filter((c) => c.landing);
const compareRows = landscape.rows.filter((r) => r.landing);
const MARK = { yes: '●', partial: '◐', no: '○' };
const markLabel = (value) => landscape.legend[lang.value][value] ?? value;

const copied = ref(false);
async function copyInstall() {
  try {
    await navigator.clipboard.writeText(INSTALL);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    // Clipboard blocked: the command stays selectable
  }
}
</script>

<template>
  <div class="landing">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow"><span class="dot" aria-hidden="true"></span>{{ t.eyebrow }}</p>
        <h1>
          <span>{{ t.title[0] }}</span>
          <span class="accent">{{ t.title[1] }}</span>
        </h1>
        <p class="lead">{{ t.lead }}</p>
        <div class="install">
          <code><span class="sigil" aria-hidden="true">$</span> {{ INSTALL }}</code>
          <button type="button" @click="copyInstall">{{ copied ? t.copied : t.copy }}</button>
        </div>
        <div class="actions">
          <a class="btn primary" :href="link('/getting-started')">{{ t.primary }}</a>
          <a class="btn" :href="link('/showcase')">{{ t.secondary }}</a>
          <a class="btn ghost" :href="REPO" target="_blank" rel="noopener">{{ t.github }} ↗</a>
        </div>
      </div>
      <ContextWindowDemo :lang="lang" />
    </section>

    <!-- Works with -->
    <section class="works" :aria-label="t.worksWith">
      <span class="works-label">{{ t.worksWith }}</span>
      <ul>
        <li v-for="client in t.clients" :key="client">{{ client }}</li>
      </ul>
    </section>

    <!-- Problem + measurements -->
    <section class="block problem">
      <div class="section-head">
        <h2>{{ t.problemTitle }}</h2>
        <p>{{ t.problemLead }}</p>
      </div>
      <div class="stats">
        <div v-for="[value, label] in t.stats" :key="label" class="stat">
          <strong>{{ value }}</strong>
          <span>{{ label }}</span>
        </div>
      </div>
    </section>

    <!-- Ways in -->
    <section class="block">
      <div class="section-head">
        <h2>{{ t.waysTitle }}</h2>
        <p>{{ t.waysLead }}</p>
      </div>
      <div class="ways">
        <div class="tabs" role="tablist">
          <button
            v-for="w in t.ways"
            :id="`tab-${w.id}`"
            :key="w.id"
            type="button"
            role="tab"
            :aria-selected="activeWay === w.id"
            :aria-controls="`panel-${w.id}`"
            :class="{ active: activeWay === w.id }"
            @click="activeWay = w.id"
          >
            {{ w.tab }}
          </button>
        </div>
        <div
          :id="`panel-${way.id}`"
          class="panel"
          role="tabpanel"
          :aria-labelledby="`tab-${way.id}`"
        >
          <p class="panel-title">{{ way.title }}</p>
          <pre class="code"><code>{{ way.code }}</code></pre>
        </div>
      </div>
    </section>

    <!-- Bento -->
    <section class="block">
      <div class="section-head">
        <h2>{{ t.bentoTitle }}</h2>
      </div>
      <div class="bento">
        <article class="cell exact">
          <h3>{{ t.bento.exact[0] }}</h3>
          <p>{{ t.bento.exact[1] }}</p>
          <div class="big-number">
            {{ examples.contextinclude.tokens.toLocaleString(numberLocale) }}
            <small>{{ t.unitTokens }}</small>
          </div>
          <p class="mono-note">{{ t.exactCaption }}</p>
        </article>
        <article class="cell methods">
          <h3>{{ t.bento.methods[0] }}</h3>
          <p>{{ t.bento.methods[1] }}</p>
          <pre class="mini"><code>{{ methodSnippet }}</code></pre>
        </article>
        <article class="cell budget">
          <h3>{{ t.bento.budget[0] }}</h3>
          <p>{{ t.bento.budget[1] }}</p>
          <div class="budget-bar" aria-hidden="true">
            <span
              :style="{ width: `${Math.round((examples.budget.keptTokens / 30000) * 100)}%` }"
            ></span>
          </div>
          <p class="mono-note">
            {{ examples.budget.keptTokens.toLocaleString(numberLocale) }} /
            {{ (30000).toLocaleString(numberLocale) }} · {{ examples.budget.keptFiles }}/{{
              examples.budget.projectFiles
            }}
            {{ t.unitFiles }}
          </p>
        </article>
        <article class="cell redact">
          <h3>{{ t.bento.redact[0] }}</h3>
          <p>{{ t.bento.redact[1] }}</p>
          <pre class="mini"><code><span class="del">- {{ redactBefore }}</span>
<span class="add">+ {{ redactAfter }}</span></code></pre>
        </article>
        <article class="cell git">
          <h3>{{ t.bento.git[0] }}</h3>
          <p>{{ t.bento.git[1] }}</p>
          <p class="mono-note">--changed-since HEAD~10 → {{ changedFiles }} {{ t.unitFiles }}</p>
        </article>
        <article class="cell formats">
          <h3>{{ t.bento.formats[0] }}</h3>
          <p>{{ t.bento.formats[1] }}</p>
          <ul class="chips">
            <li v-for="f in ['TOON', 'JSON', 'YAML', 'Markdown', 'CSV', 'XML', 'Digest']" :key="f">
              {{ f }}
            </li>
          </ul>
        </article>
      </div>
    </section>

    <!-- Teams -->
    <section class="block team">
      <div class="section-head">
        <h2>{{ t.teamTitle }}</h2>
      </div>
      <div class="team-grid">
        <article v-for="[title, body] in t.team" :key="title">
          <h3>{{ title }}</h3>
          <p>{{ body }}</p>
        </article>
      </div>
    </section>

    <!-- Compare: shown once landscape.json holds other tools than ctxman -->
    <section v-if="compareColumns.length > 1" class="block">
      <div class="section-head">
        <h2>{{ t.compareTitle }}</h2>
        <p>{{ t.compareLead }}</p>
      </div>
      <div class="compare-wrap">
        <table class="compare">
          <thead>
            <tr>
              <th scope="col"></th>
              <th
                v-for="c in compareColumns"
                :key="c.id"
                scope="col"
                :class="{ us: c.id === 'ctxman' }"
              >
                {{ c.name }}
                <small>{{ c.kind[lang] }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in compareRows" :key="r.id">
              <th scope="row">{{ r.label[lang] }}</th>
              <td
                v-for="c in compareColumns"
                :key="c.id"
                :class="[r.values[c.id], { us: c.id === 'ctxman' }]"
                :title="markLabel(r.values[c.id])"
              >
                <span aria-hidden="true">{{ MARK[r.values[c.id]] ?? '?' }}</span>
                <span class="sr-only">{{ markLabel(r.values[c.id]) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="compare-foot">
        <span class="legend"
          >● {{ landscape.legend[lang].yes }} · ◐ {{ landscape.legend[lang].partial }} · ○
          {{ landscape.legend[lang].no }}</span
        >
        <span
          >{{ t.compareChecked }} {{ landscape.checked }} ·
          <a :href="link('/compare')">{{ t.compareCta }} →</a></span
        >
      </p>
    </section>

    <!-- Roadmap -->
    <section class="block">
      <div class="section-head">
        <h2>{{ t.roadmapTitle }}</h2>
        <p>{{ t.roadmapLead }}</p>
      </div>
      <ol class="roadmap">
        <li v-for="item in landscape.roadmap.filter((i) => i.landing)" :key="item.id">
          <span class="rid">{{ item.id }}</span>
          <div>
            <h3>
              <template v-for="(seg, i) in segments(item.title[lang])" :key="i"
                ><code v-if="seg.code">{{ seg.text }}</code
                ><template v-else>{{ seg.text }}</template></template
              >
            </h3>
            <p>
              <template v-for="(seg, i) in segments(item.body[lang])" :key="i"
                ><code v-if="seg.code">{{ seg.text }}</code
                ><template v-else>{{ seg.text }}</template></template
              >
            </p>
          </div>
        </li>
      </ol>
      <p class="roadmap-cta">
        <a :href="landscape.roadmapUrl" target="_blank" rel="noopener">{{ t.roadmapCta }} ↗</a>
      </p>
    </section>

    <!-- Showcase -->
    <section class="block showcase">
      <div>
        <h2>{{ t.showcaseTitle }}</h2>
        <p>{{ t.showcaseLead }}</p>
        <a class="btn primary" :href="link('/showcase')">{{ t.showcaseCta }} →</a>
      </div>
      <pre class="code"><code>{{ examples.methods.output.split('\n').slice(0, 12).join('\n') }}
…</code></pre>
    </section>

    <!-- Final -->
    <section class="final">
      <h2>{{ t.finalTitle }}</h2>
      <p>{{ t.finalLead }}</p>
      <div class="install center">
        <code
          ><span class="sigil" aria-hidden="true">$</span> {{ INSTALL }} &amp;&amp; ctxman
          --cli</code
        >
        <button type="button" @click="copyInstall">{{ copied ? t.copied : t.copy }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing {
  --gap: clamp(3.5rem, 8vw, 6.5rem);
  overflow-x: clip;
  --radius: 18px;
  max-width: 1200px;
  margin: 0 auto;
  padding: clamp(1.75rem, 5vw, 4rem) clamp(1rem, 4vw, 2rem) 5rem;
}

h1,
h2,
h3 {
  margin: 0;
  border: 0;
  padding: 0;
  color: var(--vp-c-text-1);
}

p {
  margin: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Hero */
.hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: clamp(2rem, 5vw, 3.5rem);
  align-items: center;
}

.hero::before {
  content: '';
  position: absolute;
  inset: -12% -8% auto auto;
  width: 60%;
  height: 120%;
  background: radial-gradient(closest-side, rgba(100, 108, 255, 0.16), transparent);
  pointer-events: none;
  z-index: -1;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font: 600 0.75rem/1.4 var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18);
}

h1 {
  margin-top: 1.25rem;
  font-size: clamp(2.6rem, 6.4vw, 4.6rem);
  line-height: 1;
  font-weight: 850;
  letter-spacing: -0.045em;
}

h1 span {
  display: block;
}

.accent {
  background: linear-gradient(100deg, #646cff 10%, #a855f7 60%, #10b981 110%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  margin-top: 1.4rem;
  max-width: 36rem;
  font-size: clamp(1.02rem, 1.5vw, 1.14rem);
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.install {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 27rem;
  margin-top: 1.75rem;
  padding: 0.55rem 0.55rem 0.55rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.install code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  padding: 0;
  background: none;
  font: 500 0.9rem/1.5 var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
}

.install button {
  flex: none;
  padding: 0.3rem 0.75rem;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
  font-size: 0.8rem;
  font-weight: 600;
  transition: background 0.2s;
}

.install button:hover,
.install button:focus-visible {
  background: var(--vp-c-brand-soft);
}

.sigil {
  color: var(--vp-c-brand-1);
  user-select: none;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 1.4rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  padding: 0.62rem 1.2rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  color: var(--vp-c-text-1);
  font-size: 0.92rem;
  font-weight: 600;
  text-decoration: none;
  transition:
    border-color 0.2s,
    background 0.2s,
    color 0.2s;
}

.btn:hover,
.btn:focus-visible {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.btn.primary {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.btn.primary:hover,
.btn.primary:focus-visible {
  background: var(--vp-c-brand-2);
  color: var(--vp-c-white);
}

.btn.ghost {
  border-color: transparent;
}

/* Works with */
.works {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
  margin-top: clamp(2.5rem, 6vw, 4rem);
  padding: 1rem 1.25rem;
  border-block: 1px solid var(--vp-c-divider);
}

.works-label {
  font: 600 0.72rem/1.4 var(--vp-font-family-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.works ul {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.works li {
  font-weight: 600;
  color: var(--vp-c-text-2);
}

/* Sections */
.block {
  margin-top: var(--gap);
}

.section-head {
  max-width: 46rem;
}

.section-head h2,
.final h2,
.showcase h2 {
  font-size: clamp(1.7rem, 3.6vw, 2.5rem);
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.section-head p {
  margin-top: 0.8rem;
  font-size: 1.04rem;
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

h3 {
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* Stats */
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 2rem;
}

.stat {
  display: grid;
  gap: 0.35rem;
  padding: 1.4rem 1.3rem;
  border-radius: var(--radius);
  background: var(--vp-c-bg-soft);
}

.stat strong {
  font-size: clamp(1.9rem, 3.4vw, 2.5rem);
  font-weight: 850;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.stat span {
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

/* Ways in */
.ways {
  margin-top: 1.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--radius);
  overflow: hidden;
}

.tabs {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.tabs button {
  flex: none;
  padding: 0.85rem 1.3rem;
  border-bottom: 2px solid transparent;
  color: var(--vp-c-text-2);
  font-weight: 600;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.tabs button.active {
  border-bottom-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.panel {
  padding: 1.25rem;
}

.panel-title {
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.code {
  margin: 1rem 0 0;
  padding: 1rem 1.1rem;
  border-radius: 12px;
  background: #0f1117;
  color: #e5e9f2;
  font: 0.82rem/1.65 var(--vp-font-family-mono);
  overflow-x: auto;
}

/* Bento */
.bento {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.75rem;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.4rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--radius);
  background: var(--vp-c-bg-soft);
  min-width: 0;
}

.cell p {
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.exact,
.methods {
  grid-column: span 3;
}

.budget,
.redact,
.git {
  grid-column: span 2;
}

.formats {
  grid-column: span 6;
}

.big-number {
  margin-top: auto;
  font-size: clamp(2.2rem, 5vw, 3.2rem);
  font-weight: 850;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-brand-1);
}

.big-number small {
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--vp-c-text-2);
}

.mini {
  margin: auto 0 0;
  padding: 0.8rem 0.9rem;
  border-radius: 10px;
  background: #0f1117;
  color: #d6dbe7;
  font: 0.74rem/1.6 var(--vp-font-family-mono);
  overflow-x: auto;
}

.del {
  color: #fda4af;
}

.add {
  color: #6ee7b7;
}

.budget-bar {
  height: 12px;
  margin-top: auto;
  border-radius: 999px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}

.budget-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #34d399, #10b981);
}

.mono-note {
  font: 600 0.78rem/1.5 var(--vp-font-family-mono) !important;
  color: var(--vp-c-text-2);
}

.git .mono-note {
  margin-top: auto;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
}

.chips li {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  font: 600 0.78rem/1.4 var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
}

/* Teams */
.team {
  padding: clamp(1.5rem, 4vw, 3rem);
  border-radius: 28px;
  background: linear-gradient(160deg, #11131c, #191d2e);
}

.team .section-head h2 {
  color: #f4f6fb;
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.75rem 2rem;
  margin-top: 2rem;
}

.team-grid h3 {
  color: #f4f6fb;
}

.team-grid h3::before {
  content: '';
  display: block;
  width: 28px;
  height: 3px;
  margin-bottom: 0.9rem;
  border-radius: 3px;
  background: #8b93ff;
}

.team-grid p {
  margin-top: 0.5rem;
  font-size: 0.92rem;
  line-height: 1.6;
  color: #aab2c5;
}

/* Compare */
.compare-wrap {
  margin-top: 1.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--radius);
  overflow-x: auto;
}

.compare {
  display: table;
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.compare th,
.compare td {
  padding: 0.75rem 0.9rem;
  border: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  background: none;
  text-align: center;
  white-space: nowrap;
}

.compare tr:last-child th,
.compare tr:last-child td {
  border-bottom: 0;
}

.compare tbody th {
  text-align: left;
  font-weight: 600;
  color: var(--vp-c-text-1);
  white-space: normal;
  min-width: 12rem;
}

.compare thead th {
  font-weight: 700;
  color: var(--vp-c-text-1);
  vertical-align: bottom;
}

.compare thead small {
  display: block;
  font-weight: 500;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.compare .us {
  background: var(--vp-c-brand-soft);
}

.compare td {
  font-size: 1.05rem;
}

.compare td.yes {
  color: #10b981;
}

.compare td.partial {
  color: #f59e0b;
}

.compare td.no {
  color: var(--vp-c-text-3);
}

.compare-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-top: 0.8rem;
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

/* Roadmap */
.roadmap {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin: 1.75rem 0 0;
  padding: 0;
  list-style: none;
}

.roadmap li {
  display: flex;
  gap: 1rem;
  padding: 1.2rem 1.3rem;
  border: 1px dashed var(--vp-c-divider);
  border-radius: var(--radius);
}

.rid {
  flex: none;
  align-self: flex-start;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  background: var(--vp-c-default-soft);
  font: 700 0.75rem/1.5 var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}

.roadmap p {
  margin-top: 0.35rem;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.roadmap code {
  font-size: 0.85em;
}

.roadmap-cta {
  margin-top: 1rem;
  font-size: 0.9rem;
}

/* Showcase */
.showcase {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: clamp(1.5rem, 4vw, 3rem);
  align-items: center;
  padding: clamp(1.5rem, 4vw, 2.75rem);
  border: 1px solid var(--vp-c-divider);
  border-radius: 28px;
  background: var(--vp-c-bg-soft);
}

.showcase p {
  margin: 0.9rem 0 1.5rem;
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

.showcase .code {
  margin: 0;
}

/* Final */
.final {
  max-width: 44rem;
  margin: var(--gap) auto 0;
  text-align: center;
}

.final p {
  margin-top: 0.6rem;
  color: var(--vp-c-text-2);
}

.install.center {
  margin: 1.5rem auto 0;
  max-width: 32rem;
  text-align: left;
}

/* Responsive */
@media (max-width: 1024px) {
  .team-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .hero,
  .showcase {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero::before {
    display: none;
  }

  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .exact,
  .methods,
  .formats {
    grid-column: span 6;
  }

  .budget,
  .redact,
  .git {
    grid-column: span 6;
  }

  .roadmap {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .stats,
  .team-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .install {
    max-width: none;
  }
}
</style>
