# Google Calendar Extension PRD

## Overview
A Google Calendar extension for Claude Code Local UI that syncs with the user's Google Calendar, displays upcoming events, and provides time awareness while coding.

## Problem Statement
Developers lose track of time and miss meetings while deep in coding sessions. They need visibility into their schedule without switching to a browser tab or phone.

## Goals
- Show upcoming Google Calendar events in the app
- Provide time awareness (current time, time until next meeting)
- Quick glance at today's schedule
- Desktop notifications before meetings

## Non-Goals (v1)
- Creating/editing events (read-only integration)
- Multiple calendar account support
- Standalone calendar functionality (no local events)
- Full calendar views (week/month grids)

---

## Features

### 1. Google OAuth Authentication
**Priority: P0**

Connect to Google Calendar:
- "Connect Google Calendar" button
- OAuth 2.0 flow with Google
- Secure token storage
- Token refresh handling
- Disconnect/reconnect option

**Technical Requirements:**
- Google Cloud Console project setup
- OAuth 2.0 credentials (client ID, secret)
- Scopes: `calendar.readonly`, `calendar.events.readonly`
- Secure token storage in local database
- Refresh token handling

### 2. Time Widget
**Priority: P0**

Always-visible time display:
- Current time (12h/24h format option)
- Current date
- Time until next event ("Meeting in 23m")

**UI Concept:**
```
┌─────────────────────────────┐
│  🕐 2:34 PM  ·  📅 in 26m   │
└─────────────────────────────┘
```

**Technical Requirements:**
- Client-side time updates
- Fetch next event from synced data
- Configurable time format

### 3. Today's Schedule Panel
**Priority: P0**

View today's events:
- List of today's calendar events
- Event time, title, duration
- Color-coded by calendar
- Current/next event highlighted
- Click to open in Google Calendar

**UI Concept:**
```
┌─────────────────────────────────┐
│ 📅 Today - Saturday, Dec 21    │
├─────────────────────────────────┤
│ ● 10:00 AM  Team Standup (30m) │
│ ○ 2:00 PM   1:1 with Manager   │  ← next
│ ○ 4:00 PM   Code Review        │
├─────────────────────────────────┤
│ Tomorrow                        │
│ ○ 9:00 AM   Sprint Planning    │
└─────────────────────────────────┘
```

**Technical Requirements:**
- Fetch events for today + tomorrow
- Group by day
- Sort by start time
- Handle all-day events

### 4. Meeting Notifications
**Priority: P1**

Desktop notifications before events:
- Configurable lead time (5, 10, 15, 30 min)
- Show event title and time
- Click notification to open Google Calendar
- Option to disable

**Technical Requirements:**
- Web Notifications API
- Background timer checking upcoming events
- Notification permission request
- Link to Google Calendar event

### 5. Calendar Sync
**Priority: P1**

Keep calendar data fresh:
- Sync on app start
- Periodic background sync (every 15 min)
- Manual refresh button
- Sync status indicator

**Technical Requirements:**
- Google Calendar API: `events.list`
- Store events locally for offline access
- Incremental sync with `syncToken`
- Handle API rate limits

### 6. Multi-Calendar View
**Priority: P2**

View multiple calendars:
- List subscribed calendars
- Toggle calendar visibility
- Calendar color coding
- Primary calendar indicator

**Technical Requirements:**
- Google Calendar API: `calendarList.list`
- Store calendar preferences
- Filter events by selected calendars

---

## Technical Architecture

### Google Calendar API Integration

**Required Scopes:**
```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events.readonly
```

**Key Endpoints:**
- `GET /calendars/primary/events` - Fetch events
- `GET /users/me/calendarList` - List calendars

### OAuth Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │────▶│   App   │────▶│ Google  │────▶│   App   │
│ Clicks  │     │Redirect │     │  OAuth  │     │Callback │
│ Connect │     │to Google│     │ Screen  │     │w/ Code  │
└─────────┘     └─────────┘     └─────────┘     └────┬────┘
                                                     │
                    ┌────────────────────────────────┘
                    ▼
              ┌───────────┐     ┌───────────┐
              │  Exchange │────▶│   Store   │
              │  Code for │     │  Tokens   │
              │  Tokens   │     │  in DB    │
              └───────────┘     └───────────┘
```

### Data Model

```typescript
interface GoogleCalendarToken {
  id: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  createdAt: Date;
}

interface CalendarEvent {
  id: string;
  googleEventId: string;
  calendarId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  location?: string;
  meetingLink?: string;
  color?: string;
  syncedAt: Date;
}

interface Calendar {
  id: string;
  googleCalendarId: string;
  name: string;
  color: string;
  isPrimary: boolean;
  isVisible: boolean;
}
```

### Backend Endpoints

```
POST /api/ext/calendar/auth/start     → Returns Google OAuth URL
GET  /api/ext/calendar/auth/callback  → Handles OAuth callback
POST /api/ext/calendar/auth/disconnect→ Removes tokens
GET  /api/ext/calendar/status         → Auth status + last sync
POST /api/ext/calendar/sync           → Trigger manual sync
GET  /api/ext/calendar/events         → Get cached events
GET  /api/ext/calendar/calendars      → Get calendar list
PUT  /api/ext/calendar/calendars/:id  → Update calendar visibility
```

### Environment Variables

```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/ext/calendar/auth/callback
```

---

## User Interface

### Connection Flow

**Not Connected:**
```
┌─────────────────────────────────┐
│ 📅 Google Calendar              │
├─────────────────────────────────┤
│                                 │
│  Connect your Google Calendar   │
│  to see upcoming events         │
│                                 │
│  [  Connect Google Calendar  ]  │
│                                 │
└─────────────────────────────────┘
```

**Connected:**
```
┌─────────────────────────────────┐
│ 📅 Today                    🔄  │
├─────────────────────────────────┤
│ ● 10:00  Team Standup      30m │
│ ○ 14:00  1:1 with Sarah    60m │
│ ○ 16:00  Code Review       45m │
├─────────────────────────────────┤
│ Tomorrow                        │
│ ○ 09:00  Sprint Planning   2h  │
├─────────────────────────────────┤
│ ⚙️ Settings                     │
└─────────────────────────────────┘
```

### Settings Panel

```
┌─────────────────────────────────┐
│ Calendar Settings            ✕  │
├─────────────────────────────────┤
│ Connected as: user@gmail.com    │
│ [Disconnect]                    │
├─────────────────────────────────┤
│ Time format: ○ 12h  ● 24h       │
├─────────────────────────────────┤
│ Notifications                   │
│ ☑ Enable meeting reminders      │
│ Remind me: [10 minutes ▼] before│
├─────────────────────────────────┤
│ Calendars                       │
│ ☑ Work Calendar                 │
│ ☑ Personal                      │
│ ☐ Holidays                      │
└─────────────────────────────────┘
```

---

## Security Considerations

1. **Token Storage** - Encrypt tokens at rest in SQLite
2. **Minimal Scopes** - Read-only access only
3. **Token Refresh** - Handle expiration gracefully
4. **No Data Export** - Events stay local, not sent to Claude API
5. **Disconnect Option** - Clear all data on disconnect

---

## Success Metrics
- User connects Google Calendar
- Reduction in missed meetings
- Daily active usage of calendar panel
- Notification engagement rate

---

## Open Questions

1. Should we support other calendar providers (Outlook, iCal)?
2. Should clicking an event open Google Calendar or show details in-app?
3. How far ahead should we sync? (1 week? 1 month?)
4. Should we show declined events?

---

## Timeline Estimate

| Task | Days |
|------|------|
| Google OAuth setup + flow | 2 |
| Token storage + refresh | 1 |
| Calendar sync implementation | 2 |
| Time widget | 0.5 |
| Today panel | 1 |
| Notifications | 1 |
| Settings UI | 1 |
| Testing + polish | 1.5 |
| **Total** | **10 days** |

---

## Dependencies

- Google Cloud Console project (need to set up)
- OAuth consent screen approval (for production)
- Extension framework with database access
