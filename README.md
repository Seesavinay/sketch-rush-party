# Sketch Rush

A real-time drawing and guessing party game for 2–8 players. Create a room, share the four-letter code, draw from your phone, and race to guess before the timer ends.

## Local setup

1. Run `npm install`.
2. Create `.env.local` with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. Run `npm run dev` and open `http://localhost:3000`.

Deploy on Vercel and add an Upstash Redis integration to the project. Room state expires after 24 hours.
