# Deploying Zakhira

Zakhira has three parts:
- **Backend** — a Cloudflare Worker + D1 database (hosted, free)
- **Desktop app** — a Tauri native app (macOS/Windows/Linux)
- **Mobile app** — an Android APK built via EAS (Expo Application Services)

---

## Prerequisites

Install these once, globally:

```sh
# Node package manager
npm install -g pnpm

# Cloudflare CLI (used to deploy the worker and manage D1)
npm install -g wrangler

# Expo CLI + EAS CLI (used to build the Android APK)
npm install -g expo-cli eas-cli

# Rust (required by Tauri to build the desktop app)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Then install project dependencies from the repo root:

```sh
pnpm install
```

---

## Part 1 — Deploy the Backend

### 1. Create a Cloudflare account

Go to [cloudflare.com](https://cloudflare.com) and sign up. No credit card required.

### 2. Log in with Wrangler

```sh
wrangler login
```

This opens a browser window to authorise your terminal.

### 3. Create the D1 database

```sh
wrangler d1 create zakhira-db
```

Wrangler will print something like:

```
✅ Successfully created DB 'zakhira-db'

[[d1_databases]]
binding = "DB"
database_name = "zakhira-db"
database_id = "abc123xyz..."   # <-- copy this
```

### 4. Paste the database ID into wrangler.toml

Open `backend/wrangler.toml` and replace `YOUR_D1_DATABASE_ID` with the ID from the step above:

```toml
[[d1_databases]]
binding = "DB"
database_name = "zakhira-db"
database_id = "abc123xyz..."   # paste here
migrations_dir = "migrations"
```

### 5. Set your admin secret

This protects the `/admin` endpoints used to create users and manage keys:

```sh
cd backend
wrangler secret put ADMIN_SECRET
```

Type a strong random string when prompted. Save it — you'll need it to create users.

### 6. Run migrations

This creates all the tables in your live D1 database:

```sh
cd backend
pnpm db:migrate:remote
```

### 7. Deploy the Worker

```sh
wrangler deploy
```

Wrangler will print your live URL when done:

```
✅ Deployed zakhira-backend
   https://zakhira-backend.<your-subdomain>.workers.dev
```

### 8. Create your user and API key

Zakhira requires a user account linked to an email. Use your admin secret to create one:

```sh
# Step 1 — create user (copy the id from the response)
curl -X POST https://zakhira-backend.<your-subdomain>.workers.dev/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -d '{"email": "you@example.com"}'

# Step 2 — create an API key for that user (copy the plaintext)
curl -X POST https://zakhira-backend.<your-subdomain>.workers.dev/admin/users/USER_ID_HERE/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -d '{"name": "My Key"}'
```

**Save the `plaintext` key** — it is never shown again.

---

## Part 2 — Build the Desktop App

### 1. Prerequisites (macOS)

```sh
xcode-select --install
```

On Linux, install the [Tauri system dependencies](https://tauri.app/start/prerequisites/#linux).  
On Windows, install [Microsoft C++ Build Tools](https://tauri.app/start/prerequisites/#windows).

### 2. Build

```sh
cd apps/desktop
pnpm tauri:build
```

This compiles Rust and bundles the React frontend. Build output is in `apps/desktop/src-tauri/target/release/bundle/`.

| Platform | File | Location |
|---|---|---|
| macOS | `.dmg` | `bundle/dmg/` |
| Windows | `.msi` | `bundle/msi/` |
| Linux | `.AppImage` | `bundle/appimage/` |

### 3. First launch — connect to your backend

Open the app. On the Setup screen enter:

- **Server URL** — `https://zakhira-backend.<your-subdomain>.workers.dev`
- **API Key** — the `plaintext` from step 8 above

Hit **Connect**.

---

## Part 3 — Build the Mobile App (Android APK)

### 1. Log in to Expo

```sh
eas login
```

Create a free account at [expo.dev](https://expo.dev) if you don't have one.

### 2. Build the APK

```sh
cd apps/mobile
eas build --platform android --profile preview
```

EAS builds on Expo's cloud servers (~5 minutes). When done it prints a download link. The APK is also available at [expo.dev](https://expo.dev) under your project → Builds.

> The `preview` profile produces a sideloadable `.apk`. Use `--profile production` for a Play Store `.aab`.

### 3. Install on your phone

1. Download the `.apk` from the EAS link
2. Rename it: `mv ~/Downloads/application-*.apk ~/Downloads/zakhira.apk`
3. Enable **Install from unknown sources** on your Android device
4. Open `zakhira.apk` to install
5. On first launch enter your Server URL and API Key (same as desktop)

### 4. Upload to GitHub Releases (optional)

```sh
gh release create v1.0.0 ~/Downloads/zakhira.apk#zakhira.apk \
  --title "Zakhira v1.0.0" \
  --notes "Android release"
```

The `#zakhira.apk` suffix sets the display name in GitHub Releases so people download it as `zakhira.apk`.

---

## Updating

### Backend

```sh
cd backend
pnpm db:migrate:remote   # only if new migrations exist
wrangler deploy
```

### Desktop app

```sh
cd apps/desktop
pnpm tauri:build
```

Replace the installed app with the new one from `bundle/`.

### Mobile app

```sh
cd apps/mobile
eas build --platform android --profile preview
```

Download the new APK and reinstall.

---

## Local Development

Three terminals:

```sh
# Terminal 1 — backend on http://localhost:8788
cd backend
pnpm dev

# Terminal 2 — desktop app (opens native window)
cd apps/desktop
pnpm tauri:dev

# Terminal 3 — mobile app (Expo Go or emulator)
cd apps/mobile
npx expo start
```

### Local setup (first time)

Apply migrations to the local SQLite DB:

```sh
cd backend
pnpm db:migrate:local
```

Create a local user and key (uses `.dev.vars` for ADMIN_SECRET):

```sh
# Create user
curl -X POST http://localhost:8788/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_LOCAL_ADMIN_SECRET" \
  -d '{"email": "you@example.com"}'

# Create key
curl -X POST http://localhost:8788/admin/users/USER_ID_HERE/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_LOCAL_ADMIN_SECRET" \
  -d '{"name": "Local Key"}'
```

For mobile on a physical device, set your machine's LAN IP in `apps/mobile/.env.local`:

```
EXPO_PUBLIC_API_URL=http://192.168.x.x:8788
```
