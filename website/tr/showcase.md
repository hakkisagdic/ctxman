---
title: Vitrin
description: ctxman kendi reposunda — CLI, MCP sunucusu ve REST API'nin bir betikle yeniden üretilen gerçek çıktıları.
---

<script setup>
import data from '../.vitepress/data/showcase.json';
import Terminal from '../.vitepress/components/Terminal.vue';
import TokenFunnel from '../.vitepress/components/TokenFunnel.vue';

const ex = data.examples;
const n = (value) => value.toLocaleString('tr-TR');
const json = (value) => JSON.stringify(value, null, 2);
const budget = [
  `tutulan: ${ex.budget.keptFiles}/${ex.budget.projectFiles} dosya, ${n(ex.budget.keptTokens)}/${n(ex.budget.projectTokens)} token`,
  '',
  ...ex.budget.sample.map((file) => `${String(n(file.tokens)).padStart(7)}  ${file.path}`),
  '      …',
].join('\n');
</script>

# Vitrin: ctxman kendi reposunda

Bu sayfadaki her sayı ve çıktı, ctxman'in bu reponun `{{ data.meta.commit }}` commit'indeki
({{ data.meta.commitDate.slice(0, 10) }}) bir klonu üzerinde, tiktoken ile birebir sayılarak
çalıştırılmasından gelir. Bunu yapan betik,
[`website/scripts/build-showcase.mjs`](https://github.com/hakkisagdic/ctxman/blob/main/website/scripts/build-showcase.mjs),
CLI'yi, MCP sunucusunu ve REST API'yi çalıştırır. Sayfadaki hiçbir şey elle düzenlenmedi.

<TokenFunnel lang="tr" />

## 1. Her şeyle başlayın

Hiç yapılandırma yok, yalnızca git'in izlediği dosyalar:

<Terminal title="~/ctxman" :command="ex.raw.command" :output="ex.raw.output" copy-label="Kopyala" copied-label="Kopyalandı" />

Tüm token'ların dörtte biri masaüstü uygulamasının tek bir derlenmiş paketi (`html/assets/*.js`);
sonraki üç kayıt lock dosyaları ve depoya eklenmiş bir metin dökümü. Bunların hiçbiri bir modele
kodu anlatmaz.

## 2. Modele gerekmeyeni çıkarın

`.contextignore`, `.gitignore` söz dizimini kullanır. Beş satır derleme çıktılarını ve lock
dosyalarını dışarıda bırakır:

<Terminal title=".contextignore" :output="ex.contextignore.config" copy-label="Kopyala" copied-label="Kopyalandı" />
<Terminal title="~/ctxman" :command="ex.contextignore.command" :output="ex.contextignore.output" copy-label="Kopyala" copied-label="Kopyalandı" />

{{ n(ex.raw.tokens) }} → {{ n(ex.contextignore.tokens) }} token. Hâlâ her bağlam penceresinden büyük.

## 3. Yalnızca kaynak kodu tutun ve sığıp sığmadığına bakın

`.contextinclude` mantığı tersine çevirir: yalnızca eşleşenler analiz edilir. `--target-model`
sonucu modelin bağlam penceresiyle karşılaştırır:

<Terminal title=".contextinclude" :output="ex.contextinclude.config" copy-label="Kopyala" copied-label="Kopyalandı" />
<Terminal title="~/ctxman" :command="ex.contextinclude.command" :output="ex.contextinclude.output" copy-label="Kopyala" copied-label="Kopyalandı" />

{{ ex.contextinclude.files }} dosya ve {{ n(ex.contextinclude.tokens) }} token: ctxman'in tüm kaynak
kodu Claude Sonnet 4.5'in 200K penceresine sığıyor; başlangıca göre %{{ data.stats.reduction }} daha az.

## 4. Aynı bağlam, daha az token

`--context-export` bağlamı varsayılan olarak JSON yazar; `-o toon` bunun yerine resmi
[TOON](https://github.com/toon-format/toon) kodlayıcısını kullanır. İki dışa aktarımın token sayıları:

| Bağlam                                                        | JSON                             | TOON                             | Tasarruf                         |
| ------------------------------------------------------------- | -------------------------------- | -------------------------------- | -------------------------------- |
| Dosya listesi                                                 | {{ n(ex.formats.files.json) }}   | {{ n(ex.formats.files.toon) }}   | %{{ ex.formats.files.saving }}   |
| Metot haritası (`-m`), {{ n(ex.formats.totalMethods) }} metot | {{ n(ex.formats.methods.json) }} | {{ n(ex.formats.methods.toon) }} | %{{ ex.formats.methods.saving }} |

TOON en çok tek tip listelerde kazandırır; her satırında ad, satır ve token sayısı olan bir metot
haritası gibi:

<Terminal title="llm-context.toon" :command="ex.formats.command" :output="ex.formats.excerpt" copy-label="Kopyala" copied-label="Kopyalandı" />

## 5. Bir modülün metot haritası

`-m` ile her metot satır numarası ve kendi token sayısıyla gelir. Burada yalnızca dört çekirdek modül:

<Terminal title=".contextinclude" :output="ex.methods.config" copy-label="Kopyala" copied-label="Kopyalandı" />
<Terminal title="llm-context.toon" :command="ex.methods.command" :output="ex.methods.output" copy-label="Kopyala" copied-label="Kopyalandı" />

Modülün haritasının tamamı {{ n(ex.methods.tokens) }} token.

## 6. Yalnızca değişenler

`--changed-since`, herhangi bir çalıştırmayı bir daldan, etiketten veya commit'ten bu yana değişen
dosyalarla sınırlar; örneğin bir pull request'in tabanından:

<Terminal title="~/ctxman" :command="ex.changed.command" :output="ex.changed.output" copy-label="Kopyala" copied-label="Kopyalandı" />

## 7. Sırlar özete girmez

Bir yapılandırma dosyasında kimlik bilgisi unutulmuş küçük bir proje (iki anahtar da sahte):

<Terminal title="src/config.js" :output="ex.redaction.source" copy-label="Kopyala" copied-label="Kopyalandı" />
<Terminal title="payments-service" :command="ex.redaction.command" :output="ex.redaction.output" copy-label="Kopyala" copied-label="Kopyalandı" />
<Terminal title="digest.txt" :output="ex.redaction.digest" copy-label="Kopyala" copied-label="Kopyalandı" />

Bilinen biçimler (AWS, GitHub, GitLab, Slack, Stripe, Google, OpenAI ve Anthropic anahtarları, PEM
özel anahtarları) varsayılan olarak maskelenir; `--no-redact` onları korur.

## 8. MCP ile sorun

`bin/mcp-server.js`, stdio üzerinden Model Context Protocol konuşur; Claude Desktop ve diğer MCP
istemcileri ctxman'i doğrudan çağırabilir. `claude_desktop_config.json` içinde:

```json
{
  "mcpServers": {
    "ctxman": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/ctxman/bin/mcp-server.js"]
    }
  }
}
```

Yol, makinenizde `$(npm root -g)/ctxman/bin/mcp-server.js` olur. Sunucu {{ ex.mcp.tools.length }}
araç sunar — {{ ex.mcp.tools.join(', ') }} — ayrıca dosya kaynakları ve prompt'lar. İstemcinin
gönderdiği ve ctxman'in yanıtladığı haliyle bir `list_methods` çağrısı:

<Terminal title="tools/call" :output="json(ex.mcp.request)" copy-label="Kopyala" copied-label="Kopyalandı" />
<Terminal title="result" :output="json(ex.mcp.response)" copy-label="Kopyala" copied-label="Kopyalandı" />

## 9. REST üzerinden kesin token bütçesi

`ctxman serve` yerel bir REST API başlatır. `targetTokens` ile `POST /api/v1/context`, bütçeyi en
üst sıradaki dosyalarla (önce çekirdek kod) doldurur ve asla aşmaz:

<Terminal title="ctxman serve" :command="ex.budget.request" :output="budget" copy-label="Kopyala" copied-label="Kopyalandı" />

## Bu sayfayı yeniden üretin

```bash
npm ci
node website/scripts/build-showcase.mjs
```

Betik repoyu geçici bir klasöre klonlar, yukarıdaki her adımı çalıştırır ve bu sayfanın ve ana
sayfanın okuduğu `website/.vitepress/data/showcase.json` dosyasını yazar.
