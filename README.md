# 🎟️ Orynthium Atrium: Tickets v10

O sistema de tickets mais completo para Discord — com slash commands, painel visual, dashboard web em tempo real e transcripts profissionais.

---

## ✨ Funcionalidades

- **Painel visual** com menu de seleção de categorias
- **Slash commands** modernos (`/setup`, `/stats`, `/add`, `/remove`, `/rename`, `/fechar`, `/assumir`, `/painel`)
- **Comandos de texto** (`!tickets config`, `!tickets stats`, etc.)
- **Auto-close** configurável por inatividade
- **Transcripts HTML** com estilo Discord salvos automaticamente
- **Avaliação** de atendimento pós-fechamento (0–5 ⭐)
- **Numeração sequencial** de tickets (#0001, #0002...)
- **Dashboard web** com estatísticas em tempo real via Socket.IO
- **Audit log** completo de ações
- **Configuração totalmente pelo Discord** — sem precisar editar arquivos
- **Multi-servidor** — cada servidor tem suas próprias configurações
- **Adicionar/remover membros** de tickets
- **Renomear tickets**

---

## 🚀 Instalação

### 1. Pré-requisitos
- Node.js 18 ou superior
- Um bot no Discord Developer Portal com as seguintes permissões:
  - `bot` scope
  - `applications.commands` scope
  - Permissões: `Manage Channels`, `Manage Messages`, `View Channels`, `Send Messages`, `Read Message History`, `Attach Files`, `Embed Links`, `Mention Everyone`

### 2. Configurar o bot

```bash
git clone <repositório>
cd cyber-world-ticket-system
npm install
cp .env.example .env
```

Edite o `.env` com seu token e client ID.

### 3. Iniciar

```bash
npm start          # Produção
npm run dev        # Desenvolvimento (reinicia ao salvar)
```

---

## ⚙️ Configuração

### Pelo Discord

1. Use `!tickets config` ou `/setup` para abrir o painel de configuração
2. Configure os IDs de canal, categoria e cargo via botões/modais

### Variáveis obrigatórias

| Variável | Descrição |
|---|---|
| `DISCORD_TOKEN` | Token do bot |
| `CLIENT_ID` | ID do bot (para slash commands) |
| `DASHBOARD_KEY` | Senha de acesso ao dashboard |

### Variáveis opcionais

| Variável | Padrão | Descrição |
|---|---|---|
| `DASHBOARD_PORT` | `3000` | Porta do dashboard |
| `BOT_PREFIX` | `!` | Prefixo de comandos de texto |

---

## 📋 Slash Commands

| Comando | Descrição | Permissão |
|---|---|---|
| `/setup` | Configurar o sistema | Gerenciar Servidor |
| `/stats` | Ver estatísticas | Qualquer membro |
| `/painel` | Recriar o painel de tickets | Gerenciar Servidor |
| `/add @membro` | Adicionar membro ao ticket | Staff |
| `/remove @membro` | Remover membro do ticket | Staff |
| `/rename <nome>` | Renomear o ticket | Staff / Criador |
| `/fechar [motivo]` | Fechar o ticket | Staff / Criador |
| `/assumir` | Assumir o ticket atual | Staff |

---

## 💬 Comandos de Texto

| Comando | Descrição |
|---|---|
| `!painel tickets` | Recriar o painel |
| `!tickets config` | Painel de configuração |
| `!tickets stats` | Estatísticas |
| `!tickets dashboard` | Link do dashboard |
| `!tickets help` | Lista de comandos |

---

## 🖥️ Dashboard Web

Acesse `http://localhost:3000` (ou a porta configurada).

- Digite o **Guild ID** do servidor
- Insira a **Dashboard Key** do seu `.env`
- Visualize tickets, configurações e audit log em tempo real

---

## 📁 Estrutura

```
src/
├── config/constants.js   — Categorias e configurações padrão
├── db/db.js              — Banco de dados SQLite
├── events/
│   ├── ready.js          — Startup + registro de slash commands
│   ├── interactionCreate.js
│   └── messageCreate.js
└── services/
    ├── tickets.js        — Lógica principal de tickets
    ├── panel.js          — Painel de abertura de tickets
    ├── transcript.js     — Geração de transcripts HTML
    └── dashboard.js      — Servidor web do dashboard
dashboard/public/         — Frontend do dashboard
assets/banner.png         — Banner do painel
database/                 — Banco de dados e transcripts (gerado automaticamente)
```

---

## 🔧 Personalizando Categorias

Edite `src/config/constants.js`:

```js
CATEGORIES: {
  suporte: {
    label: 'Suporte',
    emoji: '🔧',
    color: 0x38bdf8,
    intro: 'Descreva seu problema com detalhes.',
    description: 'Suporte técnico geral',
  },
  // Adicione quantas categorias quiser!
}
```

---

## 📝 Licença

Feito por **jho-cyber scripts**. Uso livre para servidores Discord.
