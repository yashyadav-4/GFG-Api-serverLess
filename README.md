# GeeksforGeeks API — Serverless Relay

Serverless relay and microservice for fetching public GeeksforGeeks profiles, problem-solving history, activity heatmaps, and stats for [CPPro](https://cppro.dev).

Can be deployed as a **Vercel Serverless Function** (Node.js 20) or run locally as a standalone microservice.

---

## Features

- **Profile & Scores**: Fetches coding score, monthly score, total solved count, institute name, and campus rank.
- **Difficulty Distribution**: Categorized into School, Basic, Easy, Medium, and Hard.
- **Problems & Submissions**: Full list of all solved problems with IDs, slugs, languages, difficulty levels, and ISO timestamps.
- **Activity Heatmap & Streaks**: Daily submission counts mapped to dates (`YYYY-MM-DD`), computed active days, and streak calculations.
- **Direct Error Tracking**: Logs failures directly to MongoDB `errorlogs` so errors are instantly visible in the CPPro Admin Dashboard.
- **Rate-Limit & Deduplication Resilient**: Clean error codes (`404 USER_NOT_FOUND`, `429 RATE_LIMITED`, `500 SERVER_ERROR`).

---

## Endpoints

All requests require authentication via the `x-api-key` header (or `?secret=` query parameter).

### `GET /api/gfg`
Fetch full profile data, activity calendar, difficulty distribution, and solved problems.

#### Query Parameters:
- `handle` *(required)*: GFG username/handle (e.g. `yashydv`).
- `secret` *(optional)*: Alternative to `x-api-key` header.

#### Example Request:
```bash
curl -H "x-api-key: YOUR_SECRET" "https://your-relay-domain.vercel.app/api/gfg?handle=yashydv"
```

#### Example Response:
```json
{
  "success": true,
  "data": {
    "handle": "yashydv",
    "name": "Yash",
    "profilePicture": "https://media.geeksforgeeks.org/...",
    "codingScore": 465,
    "monthlyScore": 32,
    "totalSolved": 129,
    "instituteRank": 14,
    "institution": "ABC Institute",
    "solvedByDifficulty": {
      "school": 0,
      "basic": 7,
      "easy": 39,
      "medium": 68,
      "hard": 15
    },
    "heatmap": [
      { "date": "2026-03-15", "count": 4 }
    ],
    "activeDays": 6,
    "currentStreak": 6,
    "bestStreak": 6,
    "solvedThisMonth": 12,
    "problems": [
      {
        "id": "12345",
        "title": "Reverse a String",
        "slug": "reverse-a-string",
        "lang": "cpp",
        "difficulty": "Easy",
        "submittedAt": "2026-03-15T12:00:00.000Z"
      }
    ],
    "recentSubmissions": [ ... ],
    "languageDistribution": {
      "cpp": 129
    }
  }
}
```

---

## Setup & Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file (see `.env.example`):
   ```env
   PORT=6001
   RELAY_SECRET=your_secret_here
   MongoUrl=mongodb+srv://...
   ```

3. **Start local dev server**:
   ```bash
   npm run dev
   ```
   The relay will listen at `http://localhost:6001/api/gfg?handle=...&secret=...`.

---

## Deployment (Vercel)

This repository is pre-configured for Vercel via [`vercel.json`](./vercel.json):
1. Import the repository into your Vercel team.
2. In the Vercel Project Settings, add the environment variables:
   - `RELAY_SECRET`
   - `MongoUrl`
3. Deploy! Vercel will automatically serve `/api/gfg` as a Serverless Function.
