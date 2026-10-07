# CYBER NEXUS

Authorized network security configuration audit console.

## Features
- Supabase authentication
- Network asset management
- Defensive configuration auditing
- Security score and findings
- Rate-limit friendly authentication messaging
- Vercel deployment configuration

## Environment variables
Set these in Vercel:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Never commit secret service-role keys.

## Local run
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
```

## Vercel
```bash
npx vercel --prod
```

Use only on networks and assets you own or are authorized to assess.
