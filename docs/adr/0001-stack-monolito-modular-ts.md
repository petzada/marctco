# Stack: monólito modular TypeScript

Travamos o MVP em TypeScript com Next.js (App Router) + worker Node no mesmo monorepo, PostgreSQL/Supabase Auth + RLS, Prisma, Redis/BullMQ, deploy no Railway (app + worker + Redis), storage Cloudflare R2, UI Tailwind/shadcn + dnd-kit, validação Zod, e-mail Resend, erros Sentry, score LLM via OpenRouter (DeepSeek V4 preferencial / Gemini Flash).

**Status:** accepted · 2026-08-04

**Considered options (rejeitadas):** NestJS como API D0; Clerk/Better Auth; Drizzle; Inngest/pg-boss como fila default; Vercel-only; Supabase Storage para docs; analytics in-app no MVP; OpenAI/Anthropic como default do score.

**Consequences:** webhooks e jobs longos vivem no worker BullMQ (não no request Next); secrets só em env Railway/Supabase; UI segue skill `design-taste-frontend` na implementação.
