---
name: drawio-gen
description: Analyze any project and generate a production-quality multi-page draw.io architecture diagram. Covers service topology, agent/LLM flow, data pipelines, hybrid search, and resource requirements. Outputs a ready-to-import .drawio XML file with no overlapping shapes or arrows.
disable-model-invocation: true
---

# Draw.io Architecture Diagram Generator

Analyze this project and produce a complete, multi-page `.drawio` XML file that can be opened directly in draw.io (https://app.diagrams.net) or the VS Code Draw.io Integration extension.

## Step 1 — Read the Project

Before drawing anything, read these files to understand the real architecture:

```
CLAUDE.md / README.md          → project overview, tech stack, key decisions
docker-compose.yml             → ALL services, ports, volumes, env vars
src/ or app/ source tree       → actual service connections, LLM calls, DB calls
pyproject.toml / package.json  → dependencies (reveals frameworks, DB drivers, etc.)
.env or .env.example           → config keys (LLM_PROVIDER, DB URLs, model names)
```

Identify:
- **Every running service** (containers + external hosts)
- **Which services are actually used** vs just configured (grep imports, actual HTTP calls)
- **Data flow** between services (who calls whom, on which port, for what purpose)
- **Agent/LLM orchestration** (LangGraph nodes, LangChain chains, custom loops)
- **Storage layout** (which DB holds what data, vector collections, buckets)
- **GPU vs CPU split** (embedding/LLM on GPU server, rerankers/sparse on CPU)

---

## Step 2 — Determine Which Pages to Generate

Generate only the pages that apply to this project:

| Page | Generate when |
|------|--------------|
| 1. Service Topology | Always |
| 2. Agent / LLM Flow | Project has LangGraph, LangChain, CrewAI, or custom LLM orchestration |
| 3. Ingestion Pipeline | Project ingests documents, processes data, or builds indexes |
| 4. Hybrid Search (RRF) | Project uses vector + keyword search fusion |
| 5. Resource Requirements | Project has clear service boundaries with CPU/RAM/Disk needs |

---

## Step 3 — Layout Rules (CRITICAL — prevents overlaps)

### Layer Band System

Divide the canvas into **horizontal bands** separated by **10–20px gaps**. Every shape lives inside exactly one band. Bands never overlap.

```
BAND NAME        y-start   height   y-end     gap below
─────────────────────────────────────────────────────────
CLIENT           20        80       100       10
FRONTEND         110       100      210       10
BACKEND          220       200      420       10   ← tall enough for contents + notes
APP SERVICES     430       150      580       10
DATA LAYER       590       180      770       20
─ ─ ─ separator line at y=790 ─ ─ ─
GPU SERVER       820       170      990       0    (same row)
BACKUP / EXT     (same y as GPU, x-offset right)
```

Adjust heights to fit content. Add 40–60px padding inside each band.

### Shape Positioning Rules

1. **All band background rectangles**: `x=40`, `width=1574` (full page width minus margins)
2. **Child shapes**: leave ≥ 20px from band top (after label), ≥ 15px from band bottom
3. **No shape may extend beyond its parent band** — the LangGraph note rule: if a child's bottom `y + height` exceeds the band's bottom, either make the band taller or move the child up
4. **Horizontal gaps between sibling shapes**: ≥ 20px
5. **Cylinders** (databases): use `shape=cylinder3` with `boundedLbl=1;backgroundOutline=1;size=12`
6. **Width of band-label shapes**: always 1574 (same as band)

### Arrow Routing Rules (prevents crossing shapes)

Arrows that cross multiple bands MUST use explicit waypoints. Never rely on auto-routing through intermediate bands.

**The routing channel pattern:**

```
LEFT CHANNEL   x=45-55    Use for: FastAPI → left-side DBs (MongoDB)
RIGHT CHANNEL  x=640-660  Use for: FastAPI → center DBs (Qdrant)
FAR RIGHT      x=880-920  Use for: FastAPI → right DBs (MinIO)
FAR LEFT       x=40-50    Use for: FastAPI → GPU Server (goes all the way down)
```

**How to specify waypoints in draw.io XML:**

```xml
<mxCell id="edge-1" ... edge="1" source="src-id" target="tgt-id" parent="p1-1">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="55"  y="303" />   <!-- turn left into channel -->
      <mxPoint x="55"  y="650" />   <!-- travel down through channel -->
    </Array>
  </mxGeometry>
</mxCell>
```

**Mandatory waypoints for common arrow patterns:**

```
FastAPI → Database (crosses APP SERVICES band):
  - Route LEFT  (x=55):  exit FastAPI left,  waypoints [(55, mid-api), (55, db-top)]
  - Route RIGHT (x=645): exit FastAPI right, waypoints [(645, mid-api), (645, db-top)]

FastAPI → GPU Server (crosses DATA band):
  - Far LEFT (x=45): exit FastAPI bottom-left, waypoints [(45, api-bottom), (45, gpu-top)]

DB cylinders → Backup (crosses empty space):
  - Below cylinders (y = data-band-bottom - 18):
    waypoints [(cyl-center-x, y), (1270, y), (1270, backup-mid-y)]
```

### No-Overlap Checklist

Before finalizing, verify:
- [ ] Every child shape's bottom-y ≤ its parent band's bottom-y
- [ ] No two sibling shapes in the same band share x-ranges (check `x` to `x+width`)
- [ ] No arrow passes through a solid shape (add waypoints to route around)
- [ ] Note/label boxes are fully inside their parent band
- [ ] GPU SERVER box and BACKUP box are side-by-side (different x), not stacked

---

## Step 4 — Color Palette

Use these exact colors consistently:

| Layer / Purpose | fillColor | strokeColor | fontColor |
|----------------|-----------|-------------|-----------|
| CLIENT band | `#f5f5f5` | `#666666` | default |
| FRONTEND band + box | `#d5e8d4` | `#82b366` | default |
| BACKEND / API box | `#dae8fc` | `#6c8ebf` | default |
| Agent / LLM node | `#dae8fc` | `#6c8ebf` | default (dashed border for "embedded") |
| APP SERVICES band | `#e1d5e7` | `#9673a6` | default |
| Reranker / Model Server | `#e1d5e7` | `#9673a6` | default |
| DATA LAYER band | `#fff2cc` | `#d6b656` | default |
| DB cylinders (Mongo/Qdrant/MinIO) | `#fff2cc` | `#d6b656` | default |
| Notes / warnings | `#fff2cc` | `#d6b656` | default (italic) |
| GPU SERVER band | `#f8cecc` | `#b85450` | default |
| BACKUP band | `#ffe6cc` | `#d79b00` | default |
| Optional / disabled service | `#f5f5f5` | `#adb5bd` | `#adb5bd` (dashed border) |
| Safety / guardrail node | `#ffe6e6` | `#cc0000` | default |
| Decision diamond | `#fffacd` | `#d6b656` | default |
| Success edge | strokeColor=`#22c55e` fontColor=`#22c55e` | | |
| Failure / retry edge | strokeColor=`#e67e22` fontColor=`#e67e22` | | |
| HITL / interrupt edge | strokeColor=`#9673a6` fontColor=`#9673a6` | | |

---

## Step 5 — Model Name Policy

**Never write specific model names in diagram shapes.** Use generic role labels only:

| Instead of | Write |
|-----------|-------|
| `Qwen2.5:14B`, `gpt-4o`, `llama3.1` | **LLM Model** |
| `nomic-embed-text`, `text-embedding-3-small` | **Embedding Model** |
| `jina-reranker-v2-base-multilingual` | **Reranker Model** |
| `claude-sonnet-4-20250514` | **LLM Model** |

Add a footnote like `(configured via OLLAMA_MODEL / LLM_MODEL in settings)` instead.

---

## Step 6 — Page Templates

### PAGE 1 — Service Topology

Page size: 1654 × 1169 (A3 landscape)

```
Structure:
  [CLIENT band]       Browser box centered
  [FRONTEND band]     Frontend/React box centered
  [BACKEND band]      FastAPI box (left), LangGraph/Agent box (center), note label (below agent box, still inside band)
  [APP SERVICES band] Model Server box (left/center), explanatory note (right)
  [DATA LAYER band]   DB cylinders evenly spaced, optional services (dashed), "not used" note
  ─── LOCAL NETWORK separator line ───
  [GPU SERVER band]   Ollama box + LLM Model box + Embedding Model box
  [BACKUP band]       Backup storage box (same y as GPU, to the right)

Edges:
  Browser → Frontend         short vertical, no routing needed
  Frontend → FastAPI         short vertical, no routing needed
  FastAPI → Model Server     short vertical through band gap, no routing needed
  FastAPI → MongoDB          LEFT channel (x=55)
  FastAPI → Qdrant           RIGHT channel (x=645)
  FastAPI → MinIO            FAR RIGHT (x=880)
  FastAPI → Ollama           FAR LEFT (x=45), long vertical
  DB cylinders → Backup      below cylinders, then right
```

### PAGE 2 — Agent / LLM Flow

Page size: 1169 × 1800 (A4 portrait, tall)

Nodes top-to-bottom, centered around x=534 (center of 1169-wide page):

```
START (ellipse, dark)
  ↓
input_safety (rounded rect, red tint)  →[blocked]→ END-safe (ellipse, right side)
  ↓ [safe]
intent_router (rhombus/diamond)
  ↓[hr_query]         ←[greeting]→ greeting_response → END-greet (left side)
  ↓                   ←[general]→  general_response (right side)
query_prepare
  ↓
retrieve
  ↓
rerank
  ↓
grade_documents (rhombus)
  ↓[pass]        ←[HITL]←  human_feedback (right side)
expand_context   ←[retry]← rewrite_query  (right side)
  ↓
generate
  ↓
output_safety (rounded rect, red tint)
  ↓
END (ellipse, green)
```

Retry loop: rewrite_query → retrieve uses explicit waypoints going right then up.
HITL resume: human_feedback → retrieve uses explicit waypoints going right then up.

### PAGE 3 — Ingestion Pipeline

Page size: 1654 × 820 (A3 landscape, shorter)

Left-to-right flow:
```
[Upload box]
  ↓ store    ↓ deduplicate
[MinIO]     [SHA256 check] →[new]→ [Parse] → [Chunk] → [Language Detect]
                                                              ↓GPU    ↓CPU    ↓GPU
                                                         [Dense Embed] [Sparse Embed] [Hypothetical Qs]
                                                              ↓         ↓              ↓
                                                         [Upsert to Qdrant ←←←←←←←←←←]
```

### PAGE 4 — Hybrid Search (RRF)

Page size: 1169 × 980

Top-to-bottom:
```
[User Query (rewritten)]
  ↙             ↘
[Dense Embed]  [Sparse Embed]     [Metadata Filter (optional, dashed)]
  ↓               ↓                        ↓
[Dense Prefetch] [Sparse Prefetch]         ↓
  ↘               ↙                       ↓
    [RRF Fusion  k=40] ←←←←←←←←←←←←←←←←←
         ↓
    [Language Boost +10%]
         ↓
    [Top-K Results]
         ↓
    [continues → rerank → grade → expand → generate]
```

### PAGE 5 — Resource Requirements

Page size: 1654 × 1169

Contains:
1. App Server services table (CPU/RAM/Disk per service + TOTAL row)
2. Backup plan table (MongoDB/Qdrant/MinIO backup method, schedule, size)
3. GPU Server config box (generic: LLM Model / Embedding Model, Ollama settings)
4. Key config numbers box (chunk sizes, retrieval params, JWT expiry)
5. Final server spec box (CPU cores, RAM, NVMe, HDD recommendations)

---

## Step 7 — XML Structure Rules

### File wrapper

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="YYYY-MM-DDTHH:MM:SS.000Z" agent="Claude Code" version="21.0.0" type="device">
  <diagram id="service-topology" name="1. Service Topology">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1"
                  connect="1" arrows="1" fold="1" page="1" pageScale="1"
                  pageWidth="1654" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="p1-0" />
        <mxCell id="p1-1" parent="p1-0" />
        <!-- shapes here, all parent="p1-1" -->
      </root>
    </mxGraphModel>
  </diagram>
  <diagram id="agent-flow" name="2. LangGraph Agent Flow">
    <!-- ... -->
  </diagram>
  <!-- more pages -->
</mxfile>
```

### ID naming convention

Use page-scoped IDs: `p1-`, `p2-`, `p3-` etc. to avoid collisions across pages.

```
p1-0, p1-1          root cells (required)
p1-cl               CLIENT band
p1-bel              BACKEND band
p1-api              FastAPI box
p1-e1, p1-e2 ...    edges
p1-ebk1             backup edge 1
```

### Band rectangle style

```xml
style="rounded=1;whiteSpace=wrap;html=1;
       fillColor=FILL;strokeColor=STROKE;
       fontStyle=1;fontSize=11;
       verticalAlign=top;arcSize=2;opacity=70;"
```

### Service box style

```xml
style="rounded=1;whiteSpace=wrap;html=1;
       fillColor=FILL;strokeColor=STROKE;fontSize=10;"
```

### Database cylinder style

```xml
style="shape=cylinder3;whiteSpace=wrap;html=1;
       boundedLbl=1;backgroundOutline=1;size=12;
       fillColor=FILL;strokeColor=STROKE;fontSize=10;"
```

### Diamond/decision style

```xml
style="rhombus;whiteSpace=wrap;html=1;
       fillColor=#fffacd;strokeColor=#d6b656;fontSize=10;"
```

### Note/annotation style

```xml
style="text;html=1;strokeColor=none;fillColor=#fff2cc;
       fontSize=9;fontStyle=2;"
```

### Dashed/optional service style

```xml
style="rounded=1;whiteSpace=wrap;html=1;dashed=1;
       fillColor=#f5f5f5;strokeColor=#adb5bd;
       fontColor=#adb5bd;fontSize=10;"
```

### Edge with explicit waypoints

```xml
<mxCell id="p1-e4" value="label text"
        style="edgeStyle=orthogonalEdgeStyle;rounded=0;
               exitX=0;exitY=0.5;exitDx=0;exitDy=0;
               entryX=0;entryY=0.3;entryDx=0;entryDy=0;
               strokeColor=#d6b656;fontColor=#555;fontSize=9;"
        edge="1" source="p1-api" target="p1-mongo" parent="p1-1">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="55" y="303" />
      <mxPoint x="55" y="650" />
    </Array>
  </mxGeometry>
</mxCell>
```

---

## Step 8 — Self-Verification Before Output

Run through this checklist mentally before writing the XML:

**Layout:**
- [ ] Each band's `y + height` < next band's `y` (gap ≥ 10px between every band)
- [ ] Every child shape: `child.y + child.height ≤ band.y + band.height`
- [ ] Note boxes: same check as child shapes
- [ ] GPU SERVER and BACKUP are side-by-side (same y), not overlapping x ranges

**Arrows:**
- [ ] Any arrow that traverses > 1 band has explicit `<Array as="points">` waypoints
- [ ] Waypoints route through clear horizontal channels (not through other shapes)
- [ ] Backup arrows go below cylinder bottoms before turning right
- [ ] Long arrows to GPU server go through far-left channel (x ≤ 50)

**Content:**
- [ ] No specific model names (Qwen, nomic-embed, claude-sonnet, etc.)
- [ ] All disabled/optional services use dashed style and gray color
- [ ] "Not used" services are clearly labeled as such
- [ ] Port numbers on service boxes (`:8000`, `:27017`, etc.)

---

## Step 9 — Output

1. Write the complete `.drawio` XML to `.claude/docs/drawio/<project-name>.drawio`
2. Print a summary table: which pages were generated and why
3. Print import instructions:
   ```
   Open draw.io → File → Import from → Device → select the .drawio file
   Or: open directly in VS Code with the "Draw.io Integration" extension
   ```
