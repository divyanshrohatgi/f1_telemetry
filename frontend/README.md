# GridInsight — Frontend

React 18 + TypeScript + Vite frontend for the GridInsight F1 dashboard.

See the [root README](../README.md) for full project documentation and setup instructions.

## Dev

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build to dist/
npx tsc --noEmit  # type check only
```

Proxies all `/api/*` requests to `http://localhost:8000` (configured in `vite.config.ts`).
