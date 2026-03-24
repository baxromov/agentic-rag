# draw.io Architecture Diagram Prompt

Use this prompt to generate a professional draw.io XML architecture diagram for any project.
Replace the bracketed placeholders with your actual components.

---

## Prompt

Generate a professional draw.io XML architecture diagram file with the following strict requirements.

### Components to diagram

**CLIENT section:**
- [e.g. Microsoft Teams / React App / Mobile App]
- Role: [e.g. Primary client, Bot Framework]

**CORE section:**
- [e.g. API Gateway — FastAPI, Auth, SSE, :8000]
- [e.g. Orchestration Engine — LangGraph, self-correcting, HITL, Guardrails]

**AI MODELS section (or SERVICES):**
- [e.g. LLM — llama3.1, local, :11434]
- [e.g. Embeddings — nomic-embed-text, 768-dim, :11434]
- [e.g. Reranker — jina-reranker-v2, cross-encoder, :8080]

**STORAGE section:**
- [e.g. Qdrant — Vector Store, Hybrid Search, :6333]
- [e.g. MongoDB — Sessions, State, Auth, :27017]
- [e.g. MinIO — Document Storage, S3-compatible, :9000]
- [e.g. Redis — Pub/Sub, SSE streaming, :6379]

**Data flow arrows (label each one):**
- CLIENT → API: [e.g. REST + SSE]
- API → Engine: [e.g. graph.astream()]
- Engine → LLM: [e.g. generate response]
- Engine → Embeddings: [e.g. embed query]
- Engine → Reranker: [e.g. rerank chunks]
- Engine → Qdrant: [e.g. hybrid search]
- Engine → MongoDB: [e.g. read/write state]
- Engine → MinIO: [e.g. fetch documents]
- Engine → Redis: [e.g. pub/sub events]
- API → MongoDB: [e.g. auth + sessions] (dashed)

---

### Strict layout and style rules

**Canvas:** white background (`#FFFFFF`), pageWidth=1200, pageHeight=1000.

**Title:** large bold text centered at top (fontSize=22, fontStyle=1, fontColor=#1a1a2e).
**Subtitle:** smaller text below title (fontSize=11, fontColor=#666688).

**Section containers — 4 named areas, each a rounded rectangle:**
Render section containers BEFORE blocks so blocks appear on top (higher z-order).
- CLIENT section: left column, light green fill `#E8F5E9`, stroke `#2E7D32`
- CORE section: center, light blue fill `#E3F2FD`, stroke `#1565C0`
- AI MODELS section: right column, light pink fill `#FCE4EC`, stroke `#AD1457`
- STORAGE section: full-width bottom row, light amber fill `#FFF8E1`, stroke `#F57F17`

Each section: `rounded=1; strokeWidth=2; verticalAlign=top; spacingTop=10; arcSize=4`
Section label appears at top of the container in matching stroke color.

**Every block must be fully inside its section** — 20px padding on all sides. No block may overflow its section boundary.

**Block shapes:**

| Component type | draw.io shape | Color scheme |
|---|---|---|
| Client app | `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.mobile_client` | Teams blue `#1C7FD6` / stroke `#1360a4` |
| API Gateway | `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway` | Purple `#8C4FFF` / stroke `#6a35cc` |
| Orchestration engine | `shape=hexagon;perimeter=hexagonPerimeter2` | Step-Functions pink `#FF4F8B` / stroke `#cc1c6a` / strokeWidth=3 |
| LLM / ML inference | `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sagemaker` | ML teal `#01A88D` / stroke `#016b59` |
| Embeddings | `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.comprehend` | ML teal `#01A88D` |
| Reranker / scoring | `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rekognition` | ML teal `#01A88D` |
| Vector DB | `shape=mxgraph.flowchart.database` (cylinder) | OpenSearch blue `#005EB8` / stroke `#004a93` |
| Document DB | `shape=mxgraph.flowchart.database` (cylinder) | DocDB green `#1A9C3E` / stroke `#157a31` |
| Object storage | `shape=mxgraph.flowchart.database` (cylinder) | S3 green `#7AA116` / stroke `#5d7b11` |
| Cache / queue | `shape=mxgraph.flowchart.database` (cylinder) | ElastiCache red `#C7131F` / stroke `#a01019` |

All blocks: `fontColor=#ffffff; fontSize=12; whiteSpace=wrap; html=1; verticalAlign=middle`
Block labels: `<b>Name</b><br/>description line 1<br/>description line 2`

**Vertical alignment:** CLIENT, API Gateway, and the Orchestration Engine must share the same center_y so the horizontal arrows between them are perfectly straight (no jogs).

**Arrow routing rules:**
1. Use `edgeStyle=orthogonalEdgeStyle; rounded=0; orthogonalLoop=1`
2. Always specify `exitX/exitY/entryX/entryY` connection point anchors
3. **Horizontal arrows** (CLIENT→API→Engine): straight line, no waypoints needed
4. **Engine → AI models** (right side, 3 targets stacked vertically):
   - Use a single vertical stub column at x = midpoint between engine right edge and AI models left edge
   - Top arrow: exit engine at (1, 0.25), go right to stub, go UP to top model center_y, go right to model
   - Middle arrow: exit engine at (1, 0.5), go straight right (nearly horizontal)
   - Bottom arrow: exit engine at (1, 0.75), go right to stub, go DOWN to bottom model center_y, go right to model
5. **Engine → Storage** (4 targets below, staggered lanes):
   - Exit engine bottom at exitX = 0.2, 0.4, 0.6, 0.8 respectively
   - Each arrow uses a DIFFERENT y for its horizontal lane (stagger by 12px each: y₁, y₁+12, y₁+24, y₁+36)
   - Lane y values must be between the bottom of the top sections and the top of the storage blocks
   - Left-going arrows (to storage items left of exit point): go down → turn left → go down to block top
   - Right-going arrows (to storage items right of exit point): go down → turn right → go down to block top
   - NO two horizontal lane segments should share the same y value (prevents visual crossing)
6. **API → MongoDB dashed**: exit API bottom center, go straight down, then jog to MongoDB left center; use `dashed=1`

**Arrow colors** — match the target component's color family:
- → Client connection: use client blue
- → AI models: use ML teal `#00695C`
- → Vector DB: use `#0D47A1`
- → Document DB: use `#1B5E20`
- → Object storage: use `#33691E`
- → Cache: use `#B71C1C`
- Dashed (auth/sessions): use `#4527A0`

Arrow label: `fontStyle=1` (bold), fontSize=11, matching fontColor.

**Storage blocks layout:** 4 cylinders evenly spaced across the full width of the STORAGE section with 20px padding on each side.

**Output:** Valid draw.io XML (`<mxfile>` → `<diagram>` → `<mxGraphModel>` → `<root>`).
Include coordinate comments in the XML so positions are auditable.
Render section containers before blocks (lower cell IDs = rendered first = behind).
