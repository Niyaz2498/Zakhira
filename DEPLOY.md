# Deploying Zakhira

Zakhira has three parts:
- **Backend** — a Cloudflare Worker + D1 database (hosted, free)
- **Desktop app** — a Tauri native app (macOS/Windows/Linux)
- **Mobile app** — a sideloaded Android APK

> **Shipping a new version?** Don't follow this file — push a `vX.Y.Z` tag and CI
> builds and publishes both apps. See [docs/RELEASING.md](docs/RELEASING.md).
> The manual steps below are for first-time setup and local builds.

---

## Prerequisites

Install these once, globally:

```sh
# Node package manager
npm install -g pnpm

# Cloudflare CLI (used to deploy the worker and manage D1)
npm install -g wrangler

# Java 17 (required to build the Android APK locally)
brew install --cask temurin@17

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

Releases are built by CI — see [docs/RELEASING.md](docs/RELEASING.md) for the tag
flow and the Obtainium setup. This section covers building an APK locally.

### 1. Generate the native project

`apps/mobile/android/` is generated and gitignored (CNG):

```sh
cd apps/mobile
npx expo prebuild --platform android
```

### 2. Build

```sh
cd apps/mobile/android
./gradlew assembleRelease
```

The APK lands at `app/build/outputs/apk/release/app-release.apk`.

> A local build with no keystore properties is signed with the React Native
> **debug** key, which is public. It is fine for testing on your own device, but
> it will not update an app installed from a CI release, and must never be
> distributed. CI passes the real keystore in — see docs/RELEASING.md.

### 3. Install on your phone

1. Enable **Install from unknown sources** on your Android device
2. `adb install -r app-release.apk`, or copy the APK across and open it
3. On first launch enter your Server URL and API Key (same as desktop)

---

## Updating

### Backend

```sh
cd backend
pnpm db:migrate:remote   # only if new migrations exist
wrangler deploy
```

### Desktop app

Push a `vX.Y.Z` tag. The installed app checks for updates on launch and offers
"Restart to update" — no manual replacement. See [docs/RELEASING.md](docs/RELEASING.md).

### Mobile app

Push a `vX.Y.Z` tag — CI builds the APK and attaches it to the GitHub Release,
and Obtainium picks it up on your phone. See [docs/RELEASING.md](docs/RELEASING.md).

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
