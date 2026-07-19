# Onread AI

Onread AI is an evidence-backed business growth audit platform. It combines controlled public website analysis, SEO and social coverage, review and competitor intelligence, action tracking, reports, presentations, and an AI Consultant grounded in saved audit data.

## Local Development

Requirements: Node.js 20.19 or newer, npm, Docker, and PostgreSQL 16 (the included Compose service is sufficient).

```bash
npm ci
copy .env.example .env
npm run docker:up
npm run db:migrate:deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Add local provider credentials to `.env` only for the integrations you are testing. Google sign-in, transactional email, Stripe, OpenAI, and Google Places remain unavailable or fail closed when their local credentials are absent.

Development fixture data is never loaded automatically. The partner fixture command additionally requires `ALLOW_DEVELOPMENT_FIXTURES=true` and refuses non-local database hosts.

## Quality Gates

```bash
npm run db:validate
npm run typecheck
npm run lint
npm test
npm run build
```

Use `npm run db:migrate:dev` only while authoring a migration. Deploy existing migrations with `npm run db:migrate:deploy`.

## Production

The intended deployment is Vercel for Next.js and a paid Render PostgreSQL database. Start with:

- [Production readiness](docs/production-readiness.md)
- [Production deployment](docs/production-deployment.md)
- [Production operations](docs/production-operations.md)
- [Authentication](docs/authentication.md)
- [Stripe setup](docs/stripe-setup.md)
- [Partner Program](docs/partner-program-setup.md)

Production startup validates required server configuration and rejects test Stripe credentials. Never commit `.env`, provider keys, database URLs, or exported customer data.
