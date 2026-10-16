## UI restoration after review

The group channel sidebar, member sidebar, integrated voice stage, incoming-call accept/decline overlay and in-chat call controls have been restored from the previous Nebula UI instead of replacing them with simplified new pages. The new global navigation remains from the friend frontend. Avatar rendering now safely resolves asset URLs; profile avatars are used in member lists, direct-message lists, home cards, spaces and voice participants, and group avatars appear in the navigation and search results.

# Nebula integration status

## Frontend and backend integration

The React frontend uses the existing Go API with `VITE_USE_MOCK=false` and `VITE_API_URL=http://localhost:8080/api`. API requests use the stored bearer token. Authenticated server-sent events are consumed by `RealtimeEvents` for chat updates, voice signaling and call notifications.

The interface keeps the supplied graphite/amber visual system and now connects these workflows to the API:

- Profile avatar upload and removal; group avatar upload for the group owner.
- Persisted direct messages and text-channel messages.
- File, image, video and audio attachments in direct messages and group text channels, including authenticated attachment previews/downloads.
- Voice-message recording via `MediaRecorder` and upload as a dedicated voice attachment.
- Creating text and voice channels from a group's detail page when the current user is its owner.
- Voice room membership, mute/deafen state, optional camera video and WebRTC peer signaling.
- Outgoing and incoming direct calls, accepting/declining/cancelling/ending calls, and screen sharing during calls or in voice rooms.
- Real-time chat message updates and message-read requests.

## API features used by the frontend

All routes are prefixed by `/api`. Except for registration/login endpoints, they require `Authorization: Bearer <access_token>`.

- Profile avatars: `POST /me/avatar`, `DELETE /me/avatar`; public avatar media at `/avatars/{userID}.png`.
- Group avatar: `POST /spaces/{spaceID}/avatar`; public group avatar media at `/space-avatars/{spaceID}.png`.
- Group and channels: `GET|POST /spaces`, `GET /spaces/{spaceID}`, `POST /spaces/{spaceID}/channels`, `POST /spaces/{spaceID}/voice`.
- Channel messages: `GET|POST /channels/{channelID}/messages`; the POST route accepts JSON text or multipart form data with `text` and repeated `files` fields.
- Direct messages: `GET /dm`, `GET /dm/{userID}`, `GET|POST /dm/{userID}/messages`, `POST /dm/{userID}/read`.
- Message attachments: `/dm/attachments/{attachmentID}` and `/channels/attachments/{attachmentID}`.
- Realtime: `GET /events` uses Server-Sent Events; the client authenticates it with the bearer token.
- Calls and voice: `/calls`, `/calls/pending`, `/calls/{callID}/{accept|decline|cancel|end}`, `/voice`, `/voice/config`, and `/voice/{roomID}/{join|leave|state|signal}`.

## Uploads and voice networking

`UPLOAD_DIR` controls server-side storage and defaults to `uploads`. Each message can contain up to 10 attachments, with a 25 MB limit per attachment and a 100 MB request limit. Avatar uploads accept JPG and PNG up to 5 MB; profile banners accept JPG and PNG up to 8 MB. Apply all database migrations in `migrations/` before running the app; the current feature set includes migrations 000001 through 000012.

Voice and calls use browser WebRTC plus the API signaling channel. The server supplies STUN servers by default. To improve connectivity between users on restrictive networks, configure a reachable TURN service with `TURN_URL`, `TURN_USERNAME` and `TURN_PASSWORD`, or set `ICE_SERVERS` to a JSON array of RTC ICE server objects. Production deployment requires HTTPS for browser microphone, camera and screen-capture permissions.

## Run locally

Start the backend from the project root after configuring the database, Redis, mail and JWT environment variables:

```bash
go run ./cmd/api
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server is configured for `127.0.0.1:5173`. The backend CORS middleware allows that origin and `localhost:5173`.

## Validation and known limitations

JavaScript/JSX syntax and local/alias import targets were checked, and `gofmt` successfully parsed the Go source files. A production Vite build could not be executed in this environment because the npm package cache does not contain the frontend dependencies and registry access is unavailable. Go tests could not be run because the module requests Go 1.27 and that toolchain could not be downloaded in this environment.

The current environment did not permit a full production build or Go test run: npm dependencies are not installed and registry access is unavailable, while this project requests Go 1.27 and that toolchain could not be downloaded. JSX syntax and alias imports were checked across 82 frontend source files, and `gofmt` parsed the Go sources. Password recovery/reset routes `/auth/recover` and `/auth/reset` remain outside this change; settings email/password updates are implemented. Calls are held in the API process's memory, so running multiple backend instances requires shared call state and a shared realtime bus.

## Profile fixes

- `/app/users/:userId` shows another user's profile (relationship buttons, public fields only); linked from friends, group members and the DM header.
- `PATCH /me` keeps the current avatar when `avatarUrl` is omitted.
- Profile form limits match the server: username 3–16, bio 255.

## Channel settings, roles and section access (migration 000011)

Terminology: a "channel" here is the top-level group (`spaces` table); its text/voice rooms are "sections" (`space_channels`).

- **Settings page** `/app/spaces/:id/settings` (gear in the sidebar header): name, description, avatar upload/remove, invite link, delete (owner only). API: `PATCH|DELETE /spaces/{id}`, `DELETE /spaces/{id}/avatar`, `GET /spaces/{id}/settings`.
- **Roles**: every group has a base `@everyone` role (invite + write by default) plus custom roles with a colour and permission bits: administrator 1, manage channel 2, manage sections 4, manage roles 8, invite 16, write/speak 32. The owner and administrators bypass all checks. Nobody can grant or edit rights they do not hold themselves. API: `POST /spaces/{id}/roles`, `PATCH|DELETE /spaces/{id}/roles/{roleId}`, `PATCH /spaces/{id}/members/{userId}` (`{roleIds}`).
- **Section access**: a section can be `restricted`; then only roles listed in `space_channel_access` (view / write, or connect for voice) can see it. Enforced for message read/send, attachments, search, section lists, voice join and realtime event audiences. API: `PATCH|DELETE /spaces/{id}/channels/{sectionId}`.
- **Invites**: `GET /invites/{code}` previews a link without joining. Opening a link or seeing it in a message shows the group with a **Join** button (`InviteCard`). A repeated accept no longer burns an invite use; the use limit is checked atomically. Creating invites needs the invite permission.
- **Avatars**: group avatars show on the home page (group cards and the channel cards) and in the sidebar; they refresh live through the `space_updated` event.
- Also fixed: the member list used translation keys (`members.*`) that did not exist in any locale.

The previous baseline was reported as verified with `go vet`, Go tests including `roles_integration_test.go` against PostgreSQL 16, and `vite build` before the changes described below. Run all migrations through 000012 on existing databases; migration 000011 backfills `@everyone` for existing groups.

### Role hierarchy (follow-up)

Roles are ordered by position. Someone who is not the owner or an administrator can only edit, delete or hand out roles that sit **below** their own highest role and contain only rights they hold; they cannot change their own roles, the owner's roles, or those of members whose top role is not below theirs. New roles created by such a user are placed below their own. The settings payload marks each role `manageable` and each member `editable`, and the UI disables what is not allowed. An open chat now leaves automatically when access to its channel is revoked (`space_updated` event).



## Message actions, shared channels and profile banners (migration 000012)

- Text and direct messages can be replied to, edited by their author and deleted by their author. Channel managers can also delete channel messages. Changes are persisted and broadcast to the affected conversation; deleting messages also removes attachment files.
- The message composer displays a reply preview, and messages that have been edited receive an edited marker.
- Text and voice channel navigation rows and the space avatar area are slightly larger. The channel cards on the home page use a smaller group avatar with the description to its left where an avatar is available.
- The home page shows at most eight recent text channels and eight recent spaces. Recent order is stored per browser in local storage.
- The channel sidebar no longer displays the bottom profile/settings strip while inside a channel.
- User profiles show the text and voice channels both users can view, plus shared spaces. Restricted channels are only included when both users have view access.
- Profile banner upload/removal is available from the profile editor and the banner is visible on public profiles. The backend stores banner images under `UPLOAD_DIR/banners` and serves them from `/api/banners/{userID}.png`.
- Account email and password changes now use authenticated `POST /me/email` and `POST /me/password` endpoints. Both verify the current password; password changes enforce at least eight characters and the bcrypt 72-byte limit.

Migration 000012 must be applied before deploying these changes. The migration adds message edit timestamps, reply references and the user's banner URL.
