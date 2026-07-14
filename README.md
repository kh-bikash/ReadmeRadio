<div align="center">

# 📻 README Radio

### Turn any GitHub repository into a slick, narrated explainer video — automatically.

`README.md` in → 🎙️ voiceover + 📽️ captioned video out.

[![Node](https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org)
[![Remotion](https://img.shields.io/badge/Remotion-4.0-black?style=for-the-badge&logo=react&logoColor=61DAFB)](https://www.remotion.dev)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)

</div>

---

## ✨ What it does

Point README Radio at any GitHub repo and it will:

1. 📥 Pull the repo's `README.md`
2. 🧠 Ask an LLM to turn it into a **spoken-word script** *and* a **Mermaid architecture diagram**
3. 🗣️ Synthesize the script into a voiceover, with word-accurate captions
4. 🎬 Render everything into a captioned explainer video with Remotion

All from a single terminal command.

## 🎞️ Demo Flow

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant CLI as readme-radio CLI
    participant GH as GitHub (raw README)
    participant LLM as GLM-4 (script + diagram)
    participant TTS as KittenTTS
    participant STT as faster-whisper
    participant RM as Remotion Renderer

    You->>CLI: readme-radio owner/repo
    activate CLI
    CLI->>GH: GET README.md (main → master fallback)
    GH-->>CLI: raw markdown
    CLI->>LLM: README + prompt ("script" + "mermaid")
    LLM-->>CLI: { script, mermaid } JSON
    CLI->>CLI: write script.txt / architecture.mermaid
    CLI->>TTS: synthesize(script.txt)
    TTS-->>CLI: episode.wav
    CLI->>STT: transcribe(episode.wav)
    STT-->>CLI: captions.srt
    CLI->>RM: render(Main, episode.wav, captions.srt)
    RM-->>CLI: explainer.mp4
    CLI-->>You: 🎉 explainer.mp4 + episode.wav + captions.srt
    deactivate CLI
```

## 🏗️ Architecture

```mermaid
graph LR
    subgraph Input
        A[("📄 GitHub<br/>README.md")]
    end

    subgraph "packages/cli — Orchestrator"
        B["index.js<br/>Commander CLI"]
        C["llm.js<br/>GLM-4 client"]
        D["generate_audio.py<br/>Python bridge"]
    end

    subgraph "AI Services"
        E{{"GLM-4<br/>Script + Mermaid gen"}}
        F{{"KittenTTS<br/>Text → Speech"}}
        G{{"faster-whisper<br/>Speech → Captions"}}
    end

    subgraph "packages/remotion — Renderer"
        H["Composition.tsx<br/>React video scene"]
        I(["Remotion CLI<br/>render"])
    end

    subgraph Output
        J[("🎬 explainer.mp4")]
        K[("🔊 episode.wav")]
        L[("📝 captions.srt")]
        M[("🗺️ architecture.mermaid")]
    end

    A --> B
    B --> C --> E --> C
    C --> M
    C --> D
    D --> F --> D
    D --> G --> D
    D --> K
    D --> L
    B --> I
    H --> I
    K --> I
    L --> I
    I --> J

    style A fill:#1f6feb,stroke:#58a6ff,color:#fff
    style E fill:#8250df,stroke:#a371f7,color:#fff
    style F fill:#8250df,stroke:#a371f7,color:#fff
    style G fill:#8250df,stroke:#a371f7,color:#fff
    style I fill:#238636,stroke:#3fb950,color:#fff
    style J fill:#9a6700,stroke:#e3b341,color:#fff
    style K fill:#9a6700,stroke:#e3b341,color:#fff
    style L fill:#9a6700,stroke:#e3b341,color:#fff
    style M fill:#9a6700,stroke:#e3b341,color:#fff
```

## 📦 Monorepo Layout

```mermaid
graph TD
    Root["readme-radio-workspace<br/><i>npm workspaces</i>"]
    Root --> CLI["📦 packages/cli<br/>Node.js orchestrator + Python TTS/STT bridge"]
    Root --> Remotion["📦 packages/remotion<br/>React video-rendering engine"]
    Root --> Web["📦 packages/web<br/>Next.js front-end (in progress)"]

    CLI -.->|"invokes via child_process"| Remotion

    style Root fill:#161b22,stroke:#30363d,color:#fff
    style CLI fill:#0d1117,stroke:#58a6ff,color:#fff
    style Remotion fill:#0d1117,stroke:#3fb950,color:#fff
    style Web fill:#0d1117,stroke:#e3b341,color:#fff
```

| Package | Role | Status |
|---|---|---|
| [`packages/cli`](packages/cli) | The `readme-radio` command — fetches the README, calls the LLM, drives audio/caption generation, and kicks off the Remotion render | ✅ Functional end-to-end pipeline |
| [`packages/core`](packages/core) | Shared repository validation, Mermaid parsing, cycle-safe layout, and cue matching | ✅ Tested |
| [`packages/remotion`](packages/remotion) | Responsive Remotion renderer for landscape, square, and portrait videos | ✅ Functional |
| [`packages/web`](packages/web) | Interactive Next.js studio with queued jobs, real-time progress, cancellation, transcript seeking, and downloads | ✅ Functional |

## 🛠️ Tools & Tech Stack

<table>
<tr><td valign="top">

**Orchestration**
- Node.js + [Commander](https://github.com/tj/commander.js) — CLI framework
- [Axios](https://axios-http.com) — HTTP client for GitHub/LLM calls
- [Ora](https://github.com/sindresorhus/ora) — terminal spinners

</td><td valign="top">

**AI / Generation**
- [GLM-4](https://open.bigmodel.cn) (Zhipu AI) — script & Mermaid diagram generation
- [KittenTTS](https://github.com/KittenML/KittenTTS) — lightweight text-to-speech
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — speech-to-text for captions

</td></tr>
<tr><td valign="top">

**Video**
- [Remotion](https://www.remotion.dev) — React-based programmatic video rendering
- [Tailwind CSS](https://tailwindcss.com) — styling inside video compositions

</td><td valign="top">

**Web**
- [Next.js](https://nextjs.org) 16 + React 19
- TypeScript across all packages

</td></tr>
</table>

## 🚀 Getting Started

```bash
# 1. Install JS dependencies (npm workspaces)
npm install

# 2. Install Python deps for TTS/STT
cd packages/cli
pip install -r requirements.txt

# 3. Configure your GLM API key
cp .env.example .env
# then edit .env and set GLM_API_KEY=your_key

# 4. Generate an explainer video for any repo
node index.js pallets/flask
# or, if linked globally:
readme-radio pallets/flask
```

Run the interactive studio from the repository root:

```bash
npm run dev
```

Open `http://localhost:3000`, enter a public GitHub repository, and choose the narration tone, duration, renderer, and aspect ratio. Each request runs in an isolated job directory and streams real pipeline progress to the browser.

Optional server controls:

```bash
README_RADIO_CONCURRENCY=1       # simultaneous worker limit
README_RADIO_RATE_LIMIT=6        # generation requests per IP per hour
README_RADIO_API_TOKEN=...       # bearer token for direct API access
```

**Output:** `script.txt`, `architecture.mermaid`, `episode.wav`, `captions.srt`, `explainer.mp4`

## 🧭 Pipeline Stages

```mermaid
stateDiagram-v2
    [*] --> Fetching: readme-radio owner/repo
    Fetching --> Scripting: README.md fetched
    Scripting --> Synthesizing: script + mermaid generated
    Synthesizing --> Captioning: episode.wav generated
    Captioning --> Rendering: captions.srt generated
    Rendering --> Done: explainer.mp4 rendered
    Done --> [*]

    Fetching: 📥 Fetching README
    Scripting: 🧠 Writing script with GLM-4
    Synthesizing: 🗣️ Synthesizing voiceover (KittenTTS)
    Captioning: 📝 Transcribing captions (faster-whisper)
    Rendering: 🎬 Rendering video (Remotion)
    Done: ✅ Done
```

## ✅ Quality checks

```bash
npm test       # shared parser, layout, cue, and repository validation tests
npm run lint   # Next.js, Remotion, and TypeScript checks
npm run build  # Remotion bundle and production web build
npm run check  # all of the above
```

The bundled worker architecture is intended for a persistent, self-hosted Node process. A serverless deployment should move workers and generated artifacts to a durable queue and object storage while keeping the same `/api/jobs` contract.

---

<div align="center">
<sub>Built with 🎧 by Build Fast with AI</sub>
</div>
