# MyAgenticRAG Frontend

Modern React frontend for the MyAgenticRAGFramework with real-time chat, personalization settings, and metadata displays.

## Tech Stack

- **React 18+** with TypeScript
- **Vite** for fast development and optimized production builds
- **Tailwind CSS v4** for styling
- **Zustand** for state management
- **Headless UI** for accessible components
- **react-markdown** for rendering AI responses
- **WebSocket** for real-time communication

## Features

### ✅ Phase 1: Core Chat (Completed)
- [x] Real-time WebSocket chat interface
- [x] Message bubbles with markdown support
- [x] Auto-scroll message list
- [x] Connection status indicator
- [x] Error and warning alerts
- [x] Streaming indicators with node progress

### ✅ Phase 2: Settings & Personalization (Completed)
- [x] Slide-out settings panel
- [x] Language preference selector (Auto, EN, RU, UZ)
- [x] Expertise level (Beginner, Intermediate, Expert, General)
- [x] Response style (Concise, Balanced, Detailed)
- [x] Citation toggle
- [x] Settings persistence to localStorage
- [x] Runtime context integration

### ✅ Phase 3: Metadata & Advanced Features (Completed)
- [x] Source citations with expandable accordion
- [x] Token usage badges
- [x] Confidence score display
- [x] Node event handling (retrieve, rerank, grade, generate)
- [x] Keyboard shortcuts (Ctrl+Enter to send)

## Development

### Prerequisites

- Node.js 20+
- npm or yarn

### Setup

```bash
cd frontend
npm install
```

### Run Development Server

```bash
npm run dev
```

Frontend will be available at `http://localhost:5173`

Backend should be running at `http://localhost:8000` for WebSocket connection.

### Build for Production

```bash
npm run build
```

Output will be in `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Environment Variables

### Development (.env.development)
```
VITE_WS_URL=ws://localhost:8000/ws/chat
```

### Production (.env.production)
```
VITE_WS_URL=ws://localhost:8000/ws/chat
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── chat/            # Chat UI components
│   │   ├── settings/        # Settings panel
│   │   ├── metadata/        # Metadata displays
│   │   └── common/          # Reusable components
│   ├── hooks/               # Custom React hooks
│   ├── store/               # Zustand state management
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions
│   ├── App.tsx             # Root component
│   ├── main.tsx            # Entry point
│   └── index.css           # Tailwind imports
├── public/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Key Components

### ChatContainer
Main chat layout with header, message list, and input field.

### MessageList
Scrollable message container with auto-scroll to bottom.

### Message
Individual message bubble with markdown rendering and source citations.

### SettingsPanel
Slide-out panel with personalization controls.

### WebSocket Hook (useWebSocket)
Custom hook managing WebSocket connection, auto-reconnect, and event handling.

## State Management

Uses Zustand for:
- WebSocket connection state
- Message history
- Settings persistence
- UI state (errors, warnings, streaming)

## Keyboard Shortcuts

- **Ctrl+Enter / Cmd+Enter**: Send message
- **Escape**: Close settings panel (when open)

## Testing

### Manual Testing Checklist

- [ ] WebSocket connects on load
- [ ] Send message and receive response
- [ ] Multi-turn conversation works
- [ ] Settings panel opens and closes
- [ ] Language preference changes response language
- [ ] Expertise level affects response complexity
- [ ] Response style works (concise/detailed)
- [ ] Citations display correctly
- [ ] Token usage shows
- [ ] Confidence score displays
- [ ] Node progress indicator updates
- [ ] Errors and warnings display
- [ ] Auto-reconnect on disconnect
- [ ] Settings persist across reload
- [ ] Keyboard shortcuts work
- [ ] Responsive on mobile

## Integration with Backend

The frontend communicates with the backend via:

1. **WebSocket** (`/ws/chat`) - Real-time chat
2. **HTTP** (`/query`) - Alternative REST endpoint

### WebSocket Message Format

**Send:**
```json
{
  "query": "What is RAG?",
  "thread_id": "abc-123",
  "context": {
    "language_preference": "en",
    "expertise_level": "general",
    "response_style": "balanced",
    "enable_citations": true
  }
}
```

**Receive:**
```json
{
  "event": "generation",
  "data": {
    "answer": "RAG stands for...",
    "sources": [...],
    "context_metadata": {...},
    "thread_id": "abc-123"
  }
}
```

## Deployment

The frontend is served as static files from the FastAPI backend in production:

1. Build frontend: `npm run build`
2. Dockerfile copies `dist/` to `/app/frontend/dist`
3. FastAPI mounts `/assets` and serves `index.html` as SPA fallback
4. Access at `http://localhost:8000`

## Troubleshooting

### WebSocket Won't Connect
- Check backend is running at `http://localhost:8000`
- Verify CORS is configured in backend
- Check browser console for errors

### Build Fails
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check Node version: `node -v` (should be 20+)
- Clear Vite cache: `rm -rf .vite`

### Settings Not Persisting
- Check browser localStorage is enabled
- Clear localStorage: `localStorage.clear()`
- Check for console errors

## License

Part of MyAgenticRAGFramework - MIT License
