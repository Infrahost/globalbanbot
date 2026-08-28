# Global Ban Bot

Discord-Bot für ein zentrales globales Bann-Netzwerk (**Python 3.11+**, discord.py, PostgreSQL/SQLAlchemy, FastAPI). Wenn ein berechtigter Nutzer `/globalban` ausführt, wird der Account auf allen verbundenen Servern gebannt – sofern der Bot dort die Ban-Berechtigung hat.

## Voraussetzungen

- Python 3.11 oder neuer
- Docker (für PostgreSQL) **oder** eine eigene PostgreSQL-Instanz
- Eine Discord-Application mit Bot unter [Discord Developer Portal](https://discord.com/developers/applications)

## Discord-App vorbereiten

1. Application anlegen, Bot erstellen, Token kopieren.
2. **Message Content Intent** wird nicht benötigt. Ban per User-ID funktioniert ohne Members Intent.
3. Invite-URL (OAuth2 → URL Generator):
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Ban Members`, `View Channels`, `Send Messages`, `Embed Links`
4. `CLIENT_ID` ist die Application ID. `BOT_OWNER_ID` ist deine Discord-User-ID.

## Installation

```bash
git clone <repo-url>
cd globalbanbot
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

macOS/Linux:

```bash
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
copy .env.example .env
```

(Unter Linux/macOS: `cp .env.example .env`.)

`.env` ausfüllen (`DISCORD_TOKEN`, `CLIENT_ID`, `BOT_OWNER_ID`, `API_KEY`, `DATABASE_URL`).

PostgreSQL starten:

```bash
docker compose up -d
```

Bot und API starten (Tabellen werden beim ersten Start automatisch angelegt):

```bash
python -m app
```

Die API lauscht standardmäßig auf `http://localhost:3000`. Healthcheck ohne Key: `GET /health`.

## Befehle

| Command | Beschreibung | Wer |
| --- | --- | --- |
| `/setup` | Verbindet den Server mit dem Netzwerk, setzt Log-Kanal und legt den Ausführenden als ADMIN an | Discord-Administrator oder Bot-Owner |
| `/staff add` / `/staff remove` | Globale Admins/Mods pro Server | ADMIN oder Bot-Owner |
| `/globalban` | Bannt den Nutzer auf allen verbundenen Servern | ADMIN, Bot-Owner, optional MOD |
| `/globalunban` | Hebt den globalen Ban auf | wie `/globalban` |
| `/baninfo` | Status, Grund, Aktionsstatistik | ADMIN, MOD, Bot-Owner |
| `/syncbans` | Wendet alle **aktiven** globalen Bans auf **diesen** Server an | ADMIN oder Bot-Owner |

Mods dürfen `/globalban` und `/globalunban` nur, wenn in `/setup` `mods_koennen_bannen` auf `true` steht.

Discord-Administrator-Rechte allein reichen **nicht** für globale Bans – das schützt das Netzwerk vor zufälligen Server-Admins.

## Datenmodell (kurz)

- **Guild** – Server, Netzwerk-Flag, Log-Kanal, ob Mods bannen dürfen
- **GlobalBan** – ein Datensatz pro User-ID, `is_active`
- **Staff** – `ADMIN` / `MOD` pro Guild
- **BanAction** – Ergebnis pro Guild (SUCCESS / FAILED / SKIPPED)

## REST-API (Dashboard-Vorbereitung)

Alle Routen unter `API_PREFIX` (Default `/api/v1`) erfordern Header `X-API-Key: <API_KEY>`.

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/v1/stats` | Guild- und Ban-Zähler |
| GET | `/api/v1/guilds` | Registrierte Server (ohne Secrets) |
| GET | `/api/v1/bans?active=true&limit=50&cursor=` | Ban-Liste, Cursor-Pagination |
| GET | `/api/v1/bans/{user_id}` | Detail inkl. BanActions |
| POST | `/api/v1/bans` | Body `{ "userId": "...", "reason": "..." }` – handelt als Bot-Owner |
| DELETE | `/api/v1/bans/{user_id}` | Global Unban |

Beispiel:

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:3000/api/v1/stats
```

Schreibende API-Aufrufe nutzen intern denselben Ban-Service wie die Slash-Commands (Queue mit `BAN_CONCURRENCY`).

## Hinweise zur Skalierung

Globale Bans laufen mit begrenzter Parallelität (`BAN_CONCURRENCY`, Standard 5), damit Discord-Rate-Limits eingehalten werden. Sharding ist in v1 nicht enthalten.
