# Google Maps Extension PRD

## Overview
A Google Maps extension for Claude Code Local UI that renders interactive maps, routes, and location pins directly in the chat interface when Claude provides location-based information.

## Inspiration
When Claude provides directions or location lists (like a delivery route or places to visit), instead of just showing text or a Google Maps link, render an actual interactive map embed showing the route/pins.

## Problem Statement
Claude often provides location-based information (addresses, routes, place recommendations) as plain text or links. Users must copy links and open them externally, breaking the flow. An embedded map would make this information immediately visual and actionable.

## Goals
- Render interactive Google Maps embeds in chat messages
- Show routes with multiple stops
- Display location pins with labels
- Make locations clickable (open in Google Maps app/web)
- Parse Claude's location outputs automatically

## Non-Goals (v1)
- Turn-by-turn navigation
- Real-time traffic updates
- Place search within the app
- Saving favorite locations
- Location history

---

## Features

### 1. Route Map Embed
**Priority: P0**

When Claude provides a multi-stop route, render an interactive map:
- Show route line connecting all stops
- Numbered markers for each stop
- Stop names/labels visible
- Estimated total time/distance
- Click to open full route in Google Maps

**Trigger Detection:**
```
// Claude outputs something like:
"Here's your route:
1. Ashrama (Vila Clementino)
2. Livraria da Vila (Moema) 
3. Casa do Churrasqueiro (Vila Nova Conceição)
4. Eli Uniformes (Itaim Bibi)"

// Or provides a Google Maps directions URL
"https://www.google.com/maps/dir/..."
```

**UI Concept:**
```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │         [Interactive Map]           │ │
│ │                                     │ │
│ │    ① ──────── ② ──────── ③         │ │
│ │                           │         │ │
│ │                           ④         │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ ① Ashrama · ② Livraria · ③ Casa · ④ Eli│
│ 🚗 ~30-40 min · 8.5 km                  │
│ [Open in Google Maps]                   │
└─────────────────────────────────────────┘
```

### 2. Single Location Pin
**Priority: P0**

When Claude mentions a specific address/place, show a map pin:
- Centered map on location
- Marker with place name
- Address displayed below
- Click to open in Google Maps

**Trigger Detection:**
```
// Claude mentions an address
"The restaurant is at Rua Oscar Freire, 523 - Jardins, São Paulo"

// Or a place name
"I recommend visiting MASP (Museu de Arte de São Paulo)"
```

**UI Concept:**
```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │         [Interactive Map]           │ │
│ │              📍                      │ │
│ │            MASP                     │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ MASP - Museu de Arte de São Paulo       │
│ Av. Paulista, 1578 - Bela Vista         │
│ [Open in Google Maps] [Get Directions]  │
└─────────────────────────────────────────┘
```

### 3. Multiple Pins (No Route)
**Priority: P1**

When Claude lists multiple places (not a route), show pins:
- All locations visible on map
- Labeled markers
- List of places below map
- No route line (just pins)

**Use Case:** "Here are 5 coffee shops near you"

### 4. URL Detection & Parsing
**Priority: P0**

Automatically detect and parse Google Maps URLs:
- Direction URLs → Route map
- Place URLs → Single pin
- Search URLs → Show results area

**Supported URL Patterns:**
```
https://www.google.com/maps/dir/...     → Route
https://www.google.com/maps/place/...   → Single location
https://maps.google.com/...             → Parse and render
https://goo.gl/maps/...                 → Resolve and render
```

### 5. Address Geocoding
**Priority: P1**

Convert text addresses to map coordinates:
- Parse addresses from Claude's text
- Geocode using Google Geocoding API
- Handle ambiguous addresses gracefully
- Support multiple countries/languages

### 6. Map Interactions
**Priority: P1**

Basic map interactions:
- Zoom in/out
- Pan/drag
- Click marker for details
- Fullscreen toggle

---

## Technical Architecture

### Google Maps APIs Required

| API | Purpose | Pricing |
|-----|---------|---------|
| Maps JavaScript API | Render interactive maps | $7/1000 loads |
| Directions API | Calculate routes | $5/1000 requests |
| Geocoding API | Address → Coordinates | $5/1000 requests |
| Places API | Place details/search | $17/1000 requests |

**Note:** Google provides $200/month free credit, which covers ~28k map loads.

### API Key Setup

```bash
GOOGLE_MAPS_API_KEY=AIza...
```

Restrictions recommended:
- HTTP referrer restriction (your domain only)
- API restriction (only enabled APIs)

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Message Content                       │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│              Location Detector (Client)                  │
│  - Regex for Google Maps URLs                           │
│  - Regex for address patterns                           │
│  - Structured location data from Claude                 │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│              Geocoding Service (Server)                  │
│  - Resolve addresses to lat/lng                         │
│  - Cache geocoded results                               │
│  - Parse Google Maps URLs for waypoints                 │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│              Map Renderer (Client)                       │
│  - Google Maps JavaScript API                           │
│  - Render markers, routes, info windows                 │
│  - Handle user interactions                             │
└─────────────────────────────────────────────────────────┘
```

### Component Structure

```typescript
// Location data structure
interface MapLocation {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  placeId?: string;
}

interface MapRoute {
  origin: MapLocation;
  destination: MapLocation;
  waypoints: MapLocation[];
  travelMode: 'driving' | 'walking' | 'transit';
}

interface MapEmbed {
  type: 'pin' | 'pins' | 'route';
  locations: MapLocation[];
  route?: MapRoute;
  bounds?: LatLngBounds;
}
```

### Message Enhancement

The extension hooks into message rendering:

```typescript
// In message renderer
function renderMessage(message: Message) {
  const mapData = detectMapContent(message.content);
  
  if (mapData) {
    return (
      <>
        <MessageText content={message.content} />
        <MapEmbed data={mapData} />
      </>
    );
  }
  
  return <MessageText content={message.content} />;
}
```

---

## Detection Patterns

### Google Maps URL Patterns

```typescript
const patterns = {
  // Directions URL
  directions: /https?:\/\/(www\.)?google\.com\/maps\/dir\/([^?\s]+)/,
  
  // Place URL  
  place: /https?:\/\/(www\.)?google\.com\/maps\/place\/([^?\s]+)/,
  
  // Short URL
  shortUrl: /https?:\/\/goo\.gl\/maps\/([a-zA-Z0-9]+)/,
  
  // Coordinates
  coords: /https?:\/\/(www\.)?google\.com\/maps\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
};
```

### Address Detection (Heuristics)

```typescript
// Common address patterns
const addressPatterns = [
  // Brazilian: "Rua X, 123 - Bairro, Cidade"
  /(?:Rua|Av\.|Avenida|Alameda|Praça)\s+[^,]+,\s*\d+[^,]*,\s*[^,]+/gi,
  
  // US: "123 Main St, City, ST 12345"
  /\d+\s+[^,]+,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}/gi,
  
  // Generic: Look for "at [location]" patterns
  /(?:at|in|near)\s+([A-Z][^,.]+(?:,\s*[A-Z][^,.]+)*)/gi,
];
```

### Structured Output (Preferred)

Encourage Claude to output structured location data:

```json
{
  "type": "route",
  "stops": [
    {"name": "Ashrama", "address": "...", "neighborhood": "Vila Clementino"},
    {"name": "Livraria da Vila", "address": "...", "neighborhood": "Moema"}
  ],
  "totalDistance": "8.5km",
  "estimatedTime": "30-40 min"
}
```

---

## User Interface

### Map Embed Sizes

| Context | Size | Notes |
|---------|------|-------|
| Single pin | 300x200px | Compact |
| Route (2-3 stops) | 400x250px | Medium |
| Route (4+ stops) | 400x300px | Larger |
| Expanded/Fullscreen | 100% viewport | Modal |

### Map Controls

```
┌─────────────────────────────────────────┐
│ [−] [+]                          [⛶]   │  ← Zoom, Fullscreen
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │              MAP                    │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ [🚗 Drive] [🚶 Walk] [🚇 Transit]       │  ← Travel mode (routes)
│ [Open in Google Maps ↗]                 │
└─────────────────────────────────────────┘
```

### Loading States

```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │         ◌ Loading map...            │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Error States

```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │    ⚠️ Could not load map            │ │
│ │    [Open in Google Maps instead]    │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## Privacy & Security

1. **API Key Protection** - Key stored server-side, proxied requests
2. **No Location Tracking** - App doesn't track user's location
3. **Cache Locally** - Geocoded results cached to reduce API calls
4. **User Control** - Option to disable map embeds

---

## Extension Manifest

```json
{
  "id": "google-maps",
  "name": "Google Maps",
  "version": "1.0.0",
  "description": "Render interactive maps for locations and routes in chat",
  
  "type": "content-enhancer",
  
  "permissions": [
    "network",
    "message:read"
  ],
  
  "hooks": [
    "onMessageRender"
  ],
  
  "api": {
    "routes": "./api/routes.ts",
    "prefix": "/api/ext/maps"
  },
  
  "settings": {
    "enabled": {
      "type": "boolean",
      "default": true,
      "label": "Show map embeds"
    },
    "defaultZoom": {
      "type": "number",
      "default": 13,
      "label": "Default zoom level"
    },
    "preferredTravelMode": {
      "type": "select",
      "options": ["driving", "walking", "transit"],
      "default": "driving",
      "label": "Default travel mode"
    }
  }
}
```

---

## Backend Endpoints

```
GET  /api/ext/maps/geocode?address=...     → Geocode address
GET  /api/ext/maps/directions?origin=...   → Get route
GET  /api/ext/maps/place?placeId=...       → Get place details
POST /api/ext/maps/parse-url               → Parse Google Maps URL
```

---

## Success Metrics

- Map embeds rendered per day
- User interactions with maps (zoom, click, open external)
- Reduction in "open in Google Maps" clicks (info visible in-app)

---

## Open Questions

1. Should we support other map providers (Apple Maps, OpenStreetMap)?
2. How to handle API quota limits gracefully?
3. Should Claude be prompted to output structured location data?
4. Offline support? (Cache map tiles?)

---

## Timeline Estimate

| Task | Days |
|------|------|
| Google Maps API setup | 0.5 |
| URL detection & parsing | 1 |
| Geocoding service | 1 |
| Map embed component | 2 |
| Route rendering | 1.5 |
| Multiple pins | 0.5 |
| Map interactions | 1 |
| Settings & polish | 1.5 |
| **Total** | **9 days** |

---

## Dependencies

- Google Cloud Console project
- Maps JavaScript API enabled
- Directions API enabled
- Geocoding API enabled
- API key with appropriate restrictions
