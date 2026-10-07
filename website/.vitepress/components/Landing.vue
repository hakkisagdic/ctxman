<script setup>
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import showcase from '../data/showcase.json';
import TokenFunnel from './TokenFunnel.vue';
import Terminal from './Terminal.vue';

const props = defineProps({
  lang: { type: String, default: 'en' },
});

const INSTALL = 'npm install -g ctxman';
const REPO = 'https://github.com/hakkisagdic/ctxman';
const { stats, meta } = showcase;

const content = {
  en: {
    eyebrow: 'Open source · MIT · Node.js 22+',
    title: 'Code context that fits.',
    lead: 'ctxman reads your repository the way a language model has to: it honours your ignore rules, counts real tokens, maps methods in 14 languages and exports only what fits — from the CLI, an MCP server or a REST API.',
    primary: 'Get started',
    secondary: 'See it run on itself',
    copy: 'Copy',
    copied: 'Copied',
    proofTitle: 'ctxman on its own repository',
    proofFoot: `Measured at commit ${meta.commit} with exact tiktoken counts`,
    stats: [
      [`${stats.reduction}%`, 'smaller context from two config files'],
      [`${stats.toonSaving}%`, 'fewer tokens with TOON than JSON (method map)'],
      [stats.methods.toLocaleString('en-US'), 'methods mapped with line and token counts'],
      [`${stats.scanMs} ms`, `to scan ${stats.scannedFiles} files`],
    ],
    stepsTitle: 'How it works',
    steps: [
      [
        'Scan',
        'Walks the tree with your .gitignore, then .contextignore or .contextinclude. Binary files and secret-bearing files such as .env never enter.',
      ],
      [
        'Measure',
        'Counts tokens per file and per method — exactly with tiktoken, or with a fast estimate — and checks the total against the model you target.',
      ],
      [
        'Export',
        'Writes TOON, JSON, YAML, Markdown, CSV, XML or a GitIngest digest to a file, the clipboard or chunks. Known credential formats are redacted.',
      ],
    ],
    whereTitle: 'Use it where you work',
    whereLead: 'One analysis engine, wherever you need it.',
    where: [
      [
        'CLI',
        'Analyse, filter and export from your terminal.',
        'ctxman --cli -m --context-export -o toon',
      ],
      [
        'MCP server',
        'Give Claude Desktop or any MCP client tools to analyse, search and list methods.',
        'node "$(npm root -g)/ctxman/bin/mcp-server.js"',
      ],
      [
        'REST API',
        'Local HTTP endpoints for analysis, methods, diffs and budgeted context.',
        'ctxman serve --port 3000',
      ],
      ['Watch mode', 'Re-analyses only the files you change, as you change them.', 'ctxman watch'],
      [
        'Git-aware',
        'Limit any run to what changed on your branch, ready for a code review.',
        'ctxman --cli --changed-since main',
      ],
      [
        'Any GitHub repo',
        'Clone and digest a public repository in one command.',
        'ctxman github facebook/react',
      ],
    ],
    featuresTitle: 'Built for real repositories',
    features: [
      [
        'Exact token counts',
        'tiktoken (cl100k) when installed, a calibrated estimate otherwise; per file, per directory and per method.',
      ],
      [
        'Method-level context',
        'Methods with line numbers in 14 languages, filtered with .methodinclude / .methodignore, wildcards and !negation.',
      ],
      [
        'Fits the model',
        'Context-window check for the model you target, token budgets over REST and MCP, and chunked exports.',
      ],
      [
        'TOON output',
        `The official TOON encoder: ${showcase.examples.formats.files.saving}–${showcase.examples.formats.methods.saving}% fewer tokens than JSON on this repository.`,
      ],
      [
        'Secret redaction',
        'AWS, GitHub, GitLab, Slack, Stripe, Google, OpenAI and Anthropic keys and PEM private keys become [REDACTED].',
      ],
      [
        'Snapshots and diffs',
        'Save context snapshots, diff against the last one and follow token growth over time.',
      ],
      [
        'Local by default',
        'Servers bind to localhost, CORS is off unless you ask, and foreign Host headers are refused.',
      ],
      [
        'Scriptable',
        'A Node API (import { TokenAnalyzer } from "ctxman") with TypeScript types, and JSON output for snapshots, trends and suggestions.',
      ],
    ],
    showcaseTitle: 'We pointed ctxman at its own repository',
    showcaseLead:
      'Every number and output on the showcase page comes from a script that runs the CLI, the MCP server and the REST API on a clone of this repository. Nothing is edited by hand.',
    showcaseCta: 'Open the showcase',
    finalTitle: 'Try it on your repository',
    finalLead: 'One command to install, one to see where your tokens go.',
    github: 'GitHub',
  },
  tr: {
    eyebrow: 'Açık kaynak · MIT · Node.js 22+',
    title: 'Modele sığan kod bağlamı.',
    lead: 'ctxman deponuzu bir dil modelinin okuması gerektiği gibi okur: ignore kurallarınıza uyar, gerçek token sayar, 14 dilde metotları çıkarır ve yalnızca sığanı dışa aktarır — CLI, MCP sunucusu veya REST API ile.',
    primary: 'Başlayın',
    secondary: 'Kendi reposunda görün',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    proofTitle: 'ctxman kendi reposunda',
    proofFoot: `${meta.commit} commit'inde, tiktoken ile birebir sayılarak ölçüldü`,
    stats: [
      [`%${stats.reduction}`, 'iki yapılandırma dosyasıyla daha küçük bağlam'],
      [`%${stats.toonSaving}`, "TOON ile JSON'dan daha az token (metot haritası)"],
      [stats.methods.toLocaleString('tr-TR'), 'satır ve token sayısıyla çıkarılan metot'],
      [`${stats.scanMs} ms`, `${stats.scannedFiles} dosyayı taramak için`],
    ],
    stepsTitle: 'Nasıl çalışır',
    steps: [
      [
        'Tara',
        'Ağacı .gitignore, ardından .contextignore veya .contextinclude ile dolaşır. İkili dosyalar ve .env gibi sır içeren dosyalar hiç girmez.',
      ],
      [
        'Ölç',
        "Token'ları dosya ve metot başına sayar — tiktoken ile birebir ya da hızlı bir tahminle — ve toplamı hedeflediğiniz modelle karşılaştırır.",
      ],
      [
        'Dışa aktar',
        'TOON, JSON, YAML, Markdown, CSV, XML veya GitIngest özetini dosyaya, panoya ya da parçalara yazar. Bilinen kimlik bilgisi biçimleri maskelenir.',
      ],
    ],
    whereTitle: 'Çalıştığınız yerde kullanın',
    whereLead: 'Tek analiz motoru, nerede gerekirse.',
    where: [
      [
        'CLI',
        'Terminalden analiz edin, filtreleyin, dışa aktarın.',
        'ctxman --cli -m --context-export -o toon',
      ],
      [
        'MCP sunucusu',
        'Claude Desktop veya herhangi bir MCP istemcisine analiz, arama ve metot listeleme araçları verin.',
        'node "$(npm root -g)/ctxman/bin/mcp-server.js"',
      ],
      [
        'REST API',
        'Analiz, metotlar, diff ve bütçeli bağlam için yerel HTTP uç noktaları.',
        'ctxman serve --port 3000',
      ],
      [
        'İzleme modu',
        'Yalnızca değiştirdiğiniz dosyaları, değiştirdiğiniz anda yeniden analiz eder.',
        'ctxman watch',
      ],
      [
        'Git farkındalığı',
        'Herhangi bir çalıştırmayı dalınızda değişenlerle sınırlayın; kod incelemesine hazır.',
        'ctxman --cli --changed-since main',
      ],
      [
        'Herhangi bir GitHub reposu',
        'Herkese açık bir repoyu tek komutla klonlayıp özetleyin.',
        'ctxman github facebook/react',
      ],
    ],
    featuresTitle: 'Gerçek repolar için',
    features: [
      [
        'Birebir token sayımı',
        'Kuruluysa tiktoken (cl100k), değilse kalibre edilmiş tahmin; dosya, klasör ve metot başına.',
      ],
      [
        'Metot seviyesinde bağlam',
        '14 dilde satır numaralı metotlar; .methodinclude / .methodignore, joker karakter ve !olumsuzlama ile filtre.',
      ],
      [
        'Modele sığdırma',
        'Hedef modelin bağlam penceresi kontrolü, REST ve MCP üzerinden token bütçesi, parçalı dışa aktarma.',
      ],
      [
        'TOON çıktısı',
        `Resmi TOON kodlayıcı: bu repoda JSON'dan %${showcase.examples.formats.files.saving}–${showcase.examples.formats.methods.saving} daha az token.`,
      ],
      [
        'Sır maskeleme',
        'AWS, GitHub, GitLab, Slack, Stripe, Google, OpenAI ve Anthropic anahtarları ile PEM özel anahtarları [REDACTED] olur.',
      ],
      [
        'Anlık görüntü ve fark',
        'Bağlam anlık görüntüleri alın, sonuncuyla karşılaştırın, token büyümesini zaman içinde izleyin.',
      ],
      [
        'Varsayılan olarak yerel',
        'Sunucular localhost’a bağlanır, CORS siz istemedikçe kapalıdır, yabancı Host başlıkları reddedilir.',
      ],
      [
        'Betiklenebilir',
        'TypeScript tipleriyle Node API (import { TokenAnalyzer } from "ctxman") ve anlık görüntü, eğilim ve öneriler için JSON çıktısı.',
      ],
    ],
    showcaseTitle: "ctxman'i kendi reposuna çevirdik",
    showcaseLead:
      'Vitrin sayfasındaki her sayı ve çıktı, CLI’yi, MCP sunucusunu ve REST API’yi bu reponun bir klonunda çalıştıran bir betikten gelir. Hiçbiri elle düzenlenmedi.',
    showcaseCta: 'Vitrini açın',
    finalTitle: 'Kendi reponuzda deneyin',
    finalLead: "Kurmak için bir komut, token'larınızın nereye gittiğini görmek için bir komut.",
    github: 'GitHub',
  },
};

const t = computed(() => content[props.lang] ?? content.en);
const prefix = computed(() => (props.lang === 'tr' ? '/tr' : ''));
const link = (page) => withBase(`${prefix.value}${page}`);

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
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">{{ t.eyebrow }}</p>
        <h1>{{ t.title }}</h1>
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

      <aside class="proof" :aria-label="t.proofTitle">
        <h2>{{ t.proofTitle }}</h2>
        <TokenFunnel :lang="lang" />
        <p class="proof-foot">
          <a :href="link('/showcase')">{{ t.proofFoot }} →</a>
        </p>
      </aside>
    </section>

    <section class="stats" aria-label="Measurements">
      <div v-for="[value, label] in t.stats" :key="label" class="stat">
        <strong>{{ value }}</strong>
        <span>{{ label }}</span>
      </div>
    </section>

    <section class="block">
      <h2>{{ t.stepsTitle }}</h2>
      <ol class="steps">
        <li v-for="([title, body], i) in t.steps" :key="title">
          <span class="step-no">{{ i + 1 }}</span>
          <h3>{{ title }}</h3>
          <p>{{ body }}</p>
        </li>
      </ol>
    </section>

    <section class="block">
      <h2>{{ t.whereTitle }}</h2>
      <p class="section-lead">{{ t.whereLead }}</p>
      <div class="where">
        <article v-for="[title, body, cmd] in t.where" :key="title" class="card">
          <h3>{{ title }}</h3>
          <p>{{ body }}</p>
          <code class="cmd">{{ cmd }}</code>
        </article>
      </div>
    </section>

    <section class="block">
      <h2>{{ t.featuresTitle }}</h2>
      <div class="features">
        <article v-for="[title, body] in t.features" :key="title" class="feature">
          <h3>{{ title }}</h3>
          <p>{{ body }}</p>
        </article>
      </div>
    </section>

    <section class="block showcase">
      <div class="showcase-copy">
        <h2>{{ t.showcaseTitle }}</h2>
        <p>{{ t.showcaseLead }}</p>
        <a class="btn primary" :href="link('/showcase')">{{ t.showcaseCta }} →</a>
      </div>
      <Terminal
        title="llm-context.toon"
        :command="showcase.examples.methods.command"
        :output="showcase.examples.methods.output.split('\n').slice(0, 14).join('\n') + '\n…'"
        :copy-label="t.copy"
        :copied-label="t.copied"
      />
    </section>

    <section class="final">
      <h2>{{ t.finalTitle }}</h2>
      <p>{{ t.finalLead }}</p>
      <Terminal
        title="zsh"
        :command="`${INSTALL} && cd your-project && ctxman --cli`"
        output=""
        :copy-label="t.copy"
        :copied-label="t.copied"
      />
    </section>
  </div>
</template>

<style scoped>
.landing {
  --gap: clamp(3rem, 7vw, 5.5rem);
  max-width: 1180px;
  margin: 0 auto;
  padding: clamp(2rem, 5vw, 4rem) clamp(1rem, 4vw, 2rem) 4rem;
}

h1,
h2,
h3 {
  margin: 0;
  border: 0;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
}

p {
  margin: 0;
}

/* Hero */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: center;
}

.eyebrow {
  margin-bottom: 1rem;
  font: 600 0.78rem/1.4 var(--vp-font-family-mono);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
}

h1 {
  font-size: clamp(2.4rem, 6vw, 4rem);
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.035em;
}

.lead {
  margin-top: 1.25rem;
  max-width: 34rem;
  font-size: clamp(1.02rem, 1.6vw, 1.15rem);
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

.install {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 26rem;
  margin-top: 1.75rem;
  padding: 0.6rem 0.6rem 0.6rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.install code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  background: none;
  padding: 0;
  font: 500 0.9rem/1.5 var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
}

.sigil {
  color: var(--vp-c-brand-1);
  user-select: none;
}

.install button {
  flex: none;
  padding: 0.3rem 0.75rem;
  border-radius: 7px;
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

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  padding: 0.6rem 1.15rem;
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

.proof {
  padding: clamp(1.25rem, 3vw, 1.75rem);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
}

.proof h2 {
  margin-bottom: 1.25rem;
  font: 600 0.8rem/1.4 var(--vp-font-family-mono);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.proof-foot {
  margin-top: 1.25rem;
  font-size: 0.8rem;
}

.proof-foot a {
  color: var(--vp-c-text-2);
  text-decoration: none;
}

.proof-foot a:hover {
  color: var(--vp-c-brand-1);
}

/* Stats */
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: var(--gap);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  overflow: hidden;
}

.stat {
  display: grid;
  gap: 0.3rem;
  padding: 1.4rem 1.25rem;
  background: var(--vp-c-bg);
}

.stat + .stat {
  border-left: 1px solid var(--vp-c-divider);
}

.stat strong {
  font-size: clamp(1.6rem, 3vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.stat span {
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--vp-c-text-2);
}

/* Sections */
.block {
  margin-top: var(--gap);
}

.block > h2,
.final h2,
.showcase h2 {
  font-size: clamp(1.6rem, 3.2vw, 2.2rem);
  line-height: 1.15;
  font-weight: 750;
}

.section-lead {
  margin-top: 0.6rem;
  color: var(--vp-c-text-2);
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin: 1.75rem 0 0;
  padding: 0;
  list-style: none;
}

.steps li,
.card,
.feature {
  padding: 1.35rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
}

.step-no {
  display: inline-grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  margin-bottom: 0.9rem;
  border-radius: 50%;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font: 700 0.9rem/1 var(--vp-font-family-mono);
}

h3 {
  font-size: 1.05rem;
  font-weight: 650;
}

.steps p,
.card p,
.feature p {
  margin-top: 0.5rem;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.where {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.75rem;
}

.card {
  display: flex;
  flex-direction: column;
}

.cmd {
  display: block;
  margin-top: auto;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  background: #0f1117;
  color: #d6dbe7;
  font: 0.76rem/1.5 var(--vp-font-family-mono);
  white-space: nowrap;
  overflow-x: auto;
}

.card p {
  margin-bottom: 1rem;
}

.features {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.75rem;
}

.feature {
  background: var(--vp-c-bg);
}

/* Showcase teaser */
.showcase {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: clamp(1.5rem, 4vw, 3rem);
  align-items: center;
  padding: clamp(1.5rem, 4vw, 2.75rem);
  border-radius: 20px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.showcase-copy p {
  margin: 0.9rem 0 1.5rem;
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

/* Final call to action */
.final {
  max-width: 44rem;
  margin: var(--gap) auto 0;
  text-align: center;
}

.final p {
  margin-top: 0.6rem;
  color: var(--vp-c-text-2);
}

.final :deep(.terminal) {
  text-align: left;
}

@media (max-width: 1024px) {
  .features {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .where {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .hero,
  .showcase {
    grid-template-columns: minmax(0, 1fr);
  }

  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stat:nth-child(3) {
    border-left: 0;
  }

  .stat:nth-child(n + 3) {
    border-top: 1px solid var(--vp-c-divider);
  }

  .steps {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .where,
  .features {
    grid-template-columns: minmax(0, 1fr);
  }

  .stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .stat + .stat {
    border-left: 0;
    border-top: 1px solid var(--vp-c-divider);
  }

  .install {
    max-width: none;
  }
}
</style>
