MJ Studio's frontend is a React single-page application built with Vite. It consumes the backend HTTP API; authentication, authorization, gallery state, and download policy remain server-owned.

## Getting Started

Install dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set `VITE_API_BASE_URL` in an environment file to override the default API URL (`http://localhost:3001/api`).

Create a production bundle with `npm run build`, or serve the bundle locally with `npm run preview`.

