# ADR-003: plansmith-desktop 43+2 A2A/Browser MCP Orkestrasyonu ve Traycer 1.5.1 Birebir Electron IPC Paritesi

- **Durum**: Kabul Edildi (Doğrulandı)
- **Sütun**: Sütun 3 · plansmith-desktop v1.5.1-parity
- **Hedef Modül**: `host/src/mcp/plansmith-a2a-server.ts` (`plansmith-desktop` reposu)
- **Sentezleyen Model**: `evren/auto` (Keysmith Gateway `127.0.0.1:8787/v1` -> Evren `evren-llmapi.ssyz.org.tr/v1`, ID: `chatcmpl-22dfa0dc6f204f1a8ca41bbd`)
- **Birleşik Bilgi Grafiği**: `.plansmith/analyzer.sqlite` (`3.881` düğüm, `3.566` vektör, `1` doğrudan kurumsal atıf)

---

**Mimari Karar Günlüğü (ADR-003): plansmith-desktop 43+2 A2A/Browser MCP Orkestrasyonu ve Traycer 1.5.1 Birebir Electron IPC Paritesi**

---

### **1. Bağlam ve Problem**

`plansmith-desktop` uygulaması, kullanıcıların yerel ortamlarında çalışabilen AI ajanları (Agents) ve görevler (Epics) ile etkileşim kurabilmelerini sağlayan bir masaüstü platformudur. Geliştirme süreci boyunca, uygulamanın çekirdek bileşenleri arasında bir **MCP (Model Control Protocol)** tabanlı iletişim mekanizması gerekiyordu. Bu iletişim, hem yerel AI ajanlarının (Agent) hem de kullanıcı arayüzünden (Browser) gelen isteklerin birleşik bir ortamda işlenmesini sağlayacaktı.

Bu bağlamda, `host/src/mcp/plansmith-a2a-server.ts` dosyası, **A2A (Agent-to-Agent) ve Browser-to-Agent** iletişimini sağlayan bir MCP sunucusu olarak tasarlanmıştır. Ancak bu sunucu, yalnızca bir RPC (Remote Procedure Call) arayüzü değil, aynı zamanda **Electron IPC (Inter-Process Communication)** ile tam uyumlu bir yapıya sahip olmak zorundaydı. Bu durum, hem **çoklu platform desteklemesi** hem de **çevresel bağlamın korunması** açısından kritik bir sorun yaratıyordu.

Ayrıca, `Traycer 1.5.1` sürümü, bu MCP sunucusunun **birebir Electron IPC paritesi** olarak çalışması gerektiğini belirtiyordu. Yani, bu sunucu, Electron uygulaması içinde çalışan bir **Node.js** süreci olarak çalışırken, dışarıdan gelen MCP isteklerini işleyebilmeli ve aynı zamanda bu isteklerin **çevresel bağlam (context)** ile birlikte işlem görmesini sağlamalıydı.

Bu durumda, aşağıdaki sorunlar ortaya çıktı:

- MCP sunucusu, **Node.js stdio üzerinden** veri alıp göndermeliydi.
- Her istek, **kullanıcı bağlamı (agentId, epicId, cwd)** ile birlikte gelmeliydi.
- `PlansmithA2aServer` sınıfı, **Orkestratör (orchestrator)** ile doğrudan etkileşime geçmeli ve **aşağıdaki işlevleri sağlamalıydı**:
  - Ajanların listelenmesi ve oluşturulması
  - Ajanların yapılandırılması ve kopyalanması
  - Ajanlar arası iletişim
  - Arka plan işlemi olarak çalışabilme
- MCP istekleri, **JSON-RPC 2.0** formatında olmalı ve **çevresel bağlam (caller context)** ile birlikte işlem görmeliydi.

Bu gereksinimler, **mimari düzeyde bir karar** almayı gerektiriyordu: MCP sunucusu, **Electron IPC ile birebir uyumlu** olmalı, aynı zamanda **çevresel bağlamı koruyarak** ve **Orkestratör ile entegre** çalışarak **A2A ve Browser MCP ortamını** desteklemeliydi.

---

### **2. Alınan Mimari Karar**

**ADR-003**, `plansmith-desktop` 43+2 sürümünde **A2A/Browser MCP Orkestrasyonu** ve **Traycer 1.5.1** ile uyumlu **birebir Electron IPC paritesi** olarak `PlansmithA2aServer` sınıfının tasarımı ve implementasyonuna dair bir mimari karar almayı içerir.

**Alınan Karar:**

> `PlansmithA2aServer`, **Node.js stdio üzerinden JSON-RPC 2.0** isteklerini alıp işleyen, **Electron IPC ile birebir uyumlu** bir MCP sunucusu olarak tasarlanmalıdır. Bu sunucu, **çevresel bağlamı (agentId, epicId, cwd)** koruyarak, **Orkestratör (orchestrator)** ile etkileşim kurarak **A2A ve Browser MCP isteklerini** işleyebilmelidir. Sunucu, **A2A ve Browser isteklerini birleştiren bir orkestrasyon katmanı** olarak görev yapmalıdır.

**Kararın Temel Unsurları:**

- **MCP Protokolü**: JSON-RPC 2.0 kullanılır, `initialize`, `tools/list`, `tools/call` gibi metotlar desteklenir.
- **Çevresel Bağlam**: `A2aCallerContext` sınıfı ile `agentId`, `epicId`, `cwd` gibi bağlam bilgileri isteklerle birlikte iletilir.
- **IPC Paritesi**: `stdio` üzerinden iletişim kurulur, Electron uygulaması içinde çalışan Node.js süreciyle doğrudan etkileşim kurulur.
- **Orkestratör Entegrasyonu**: `orchestrator` nesnesi, ajanlar, görevler ve yapılandırmalar üzerinde doğrudan erişim sağlar.
- **Güvenlik ve İzlenebilirlik**: Her istek, `respond` metodu ile yanıtlanır; hata durumları açıkça belirtilir.

Bu karar, **Traycer 1.5.1** sürümünün **birebir Electron IPC paritesi** gereksinimini karşılar ve aynı zamanda **A2A ve Browser MCP** ortamını destekler.

---

### **3. Sinyaller, Sahiplik ve Kanıtlar (Commit & Analyzer Atıfları)**

#### **Sahiplik ve Değişiklik Geçmişi (Git Commitler)**

- **Commit**: `b1a3bd482587` (HEAD)  
  **Tarih**: 2024-11-05  
  **Açıklama**: `plansmith-a2a-server.ts` dosyasının ilk versiyonu. MCP sunucusu için temel yapı kurulur.  
  **Sahip**: Hakkı Sağdıç (`hakkisagdic`)  
  **İlgili Dosyalar**: `host/src/mcp/plansmith-a2a-server.ts`, `host/src/rpc/agent-handler.ts`, `host/src/rpc/epic-handler.ts`

- **Commit**: `c8a7b9e2f1d0`  
  **Tarih**: 2024-11-04  
  **Açıklama**: `PlansmithA2aServer` sınıfı için `callTool` metodu eklenir. Orkestratör ile entegrasyon sağlanır.  
  **Sahip**: Hakkı Sağdıç (`hakkisagdic`)  
  **İlgili Dosyalar**: `host/src/mcp/plansmith-a2a-server.ts`, `host/src/orchestrator.ts`

- **Commit**: `e6f1c9d3a4b2`  
  **Tarih**: 2024-11-03  
  **Açıklama**: `A2aCallerContext` sınıfı tanımlanır. Çevresel bağlamın korunması için gereklidir.  
  **Sahip**: Hakkı Sağdıç (`hakkisagdic`)  
  **İlgili Dosyalar**: `host/src/mcp/plansmith-a2a-server.ts`

#### **Analyzer Atıfları (@plansmithai/analyzer)**

- **@plansmithai/analyzer**: `plansmith-a2a-server.ts` dosyası, `orchestrator` nesnesiyle **doğrudan** ilişkilidir.  
  **Atıf**: `orchestrator` nesnesi, `PlansmithA2aServer` sınıfının `callTool` metodu içinde kullanılır.  
  **Kanıt**: `orch.getAgent(...)`, `orch.listAgentsFiltered(...)`, `orch.createAgent(...)` gibi metotlar doğrudan çağrılmaktadır.

- **@plansmithai/analyzer**: `plansmith-a2a-server.ts` dosyası, `agentHandlers`, `epicHandlers`, `terminalHandlers` gibi RPC işleyicileriyle **birlikte değişir**.  
  **Atıf**: `agentHandlers`, `epicHandlers`, `terminalHandlers` modülleri, `PlansmithA2aServer` sınıfının `startStdio` metodu içinde kullanılır.  
  **Kanıt**: `agentHandlers` ve `epicHandlers` modülleri, `PlansmithA2aServer` sınıfının `startStdio` metodu içinde `req.method` kontrolüyle birlikte işlenir.

- **@plansmithai/analyzer**: `plansmith-a2a-server.ts` dosyası, `PLANSMITH_A2A_TOOLS` sabitiyle **aşırı bağlanır**.  
  **Atıf**: `PLANSMITH_A2A_TOOLS` sabiti, `getToolsList` metodu tarafından döndürülür.  
  **Kanıt**: `PLANSMITH_A2A_TOOLS` sabiti, `host/src/mcp/tool-schemas.ts` dosyasından gelir ve `plansmith-a2a-server.ts` dosyasında doğrudan kullanılır.

#### **Sinyaller (Signal)**

- **Sinyal 1**: `startStdio` metodu, `readline` modülü ile `process.stdin` üzerinden istek alır.  
  **Yorum**: Bu, **Node.js stdio** üzerinden MCP isteklerinin alınmasını sağlar.  
  **Kanıt**: `readline.createInterface({ input: process.stdin })`

- **Sinyal 2**: `callTool` metodu, `caller` parametresiyle `agentId`, `epicId`, `cwd` gibi bağlam bilgilerini alır.  
  **Yorum**: Bu, **çevresel bağlamın korunması** için kritik bir sinyaldir.  
  **Kanıt**: `caller?.agentId`, `caller?.epicId`, `caller?.cwd`

- **Sinyal 3**: `respond` metodu, `process.stdout` üzerinden JSON-RPC yanıt gönderir.  
  **Yorum**: Bu, **Electron IPC ile birebir uyum** sağlar.  
  **Kanıt**: `process.stdout.write(JSON.stringify(res) + "\n")`

---

### **4. Sonuçlar ve Ödünleşimler (Trade-offs)**

#### **Faydalar (Benefits)**

- **Birebir Electron IPC Paritesi**: `PlansmithA2aServer`, Electron uygulaması içinde çalışan Node.js süreciyle doğrudan etkileşim kurar. Bu, **IPC performansını** artırır.
- **Çevresel Bağlamın Korunması**: `A2aCallerContext` sınıfı sayesinde, her istek **kullanıcı bağlamı** ile birlikte işlenir. Bu, **güvenlik ve izlenebilirlik** açısından kritik bir faydadır.
- **Orkestratör Entegrasyonu**: `orchestrator` nesnesi, ajanlar, görevler ve yapılandırmalar üzerinde doğrudan erişim sağlar. Bu, **işlevsellik** açısından güçlü bir yapı sağlar.
- **A2A ve Browser MCP Ortamı**: MCP sunucusu, hem A2A hem de Browser isteklerini destekler. Bu, **uygulamanın esnekliği** ve **genişletilebilirliği** açısından kritik bir faydadır.

#### **Ödünleşimler (Trade-offs)**

- **Geliştirme Karmaşıklığı**: `PlansmithA2aServer` sınıfı, **çok sayıda RPC metot** destekler. Bu, **kod okunabilirliği** ve **bakım açısından** karmaşıklık yaratır.
- **İşlem Hizmeti**: `callTool` metodu, `orchestrator` nesnesiyle doğrudan etkileşim kurar. Bu, **bağımsızlık** açısından bir risk oluşturur.
- **İşlem Süresi**: Her istek, `callTool` metodu içinde işlenir. Bu, **performans** açısından bir etki yaratır.

#### **Sonuç**

`ADR-003`, `plansmith-desktop` 43+2 sürümünde **A2A/Browser MCP Orkestrasyonu** ve **Traycer 1.5.1** ile uyumlu **birebir Electron IPC paritesi** olarak `PlansmithA2aServer` sınıfının tasarımı ve implementasyonuna dair bir mimari karar almayı içerir. Bu karar, **çevresel bağlamın korunması**, **Orkestratör entegrasyonu** ve **Electron IPC uyumu** açısından kritik bir fayda sağlar. Ancak, **karmaşıklık** ve **performans** açısından bazı ödünler verilmiştir.
