# Navi Marketing Plan

## Quick Links

- **Instagram Ads**: `./instagram-ads/` (6 creatives ready)
- **Design Philosophy**: `./design-philosophy.md`

---

## 1. Error Logging & Analytics (Recommended Stack)

### Error Tracking: **Sentry** + sentry-tauri plugin
- **Free tier**: 5,000 errors/month
- **Why**: Industry standard, captures JS + Rust panics + native crashes
- **Integration**: `tauri-plugin-sentry` (official Tauri support)

```toml
# Cargo.toml
[dependencies]
sentry = "0.42"
tauri-plugin-sentry = "0.5"
```

### Analytics: **Aptabase**
- **Free tier**: Yes (usage-based)
- **Why**: Built specifically for desktop apps, privacy-first, official Tauri plugin
- **Integration**: `tauri-plugin-aptabase`

**Alternative**: PostHog (1M free events/month, more features but more complex)

---

## 2. Google Search Ads Strategy

### Recommended Budget
| Phase | Monthly | Expected Clicks |
|-------|---------|-----------------|
| Test | $500-1,000 | 100-200 |
| Growth | $2,000-3,000 | 400-600 |
| Scale | $5,000+ | 1,000+ |

### Top Keywords to Target

**High Intent (Primary)**
| Keyword | Est. CPC | Competition |
|---------|----------|-------------|
| "claude code gui" | $3-6 | Medium |
| "claude code desktop app" | $3-6 | Medium |
| "cursor alternative" | $5-8 | High |
| "vibe coding tool" | $2-5 | Medium-Low |
| "ai coding assistant" | $6-12 | High |

**Negative Keywords** (Save budget)
- "free", "open source claude", "claude api", "anthropic jobs"

### Campaign Structure
```
Campaign 1: Brand (5% budget)
Campaign 2: Competitor Conquest (30% budget)
  - "cursor alternative", "windsurf alternative"
Campaign 3: Problem/Solution (50% budget)
  - "claude code gui", "ai coding desktop"
Campaign 4: General AI Coding (15% budget)
```

### Landing Page Must-Haves
1. Hero with product screenshot immediately visible
2. "Download for Mac" primary CTA
3. "View Docs" secondary CTA
4. GitHub stars / user count social proof
5. Fast load time (<3s)

---

## 3. Influencer Outreach List

### Tier 1: High Priority (Most Likely to Convert)

| Creator | Platform | Followers | Why They're Perfect |
|---------|----------|-----------|---------------------|
| **Theo Browne (t3.gg)** | YouTube/X | 470K | Built T3.Chat himself, demos Cursor regularly |
| **NetworkChuck** | YouTube | 5M | Already recommends Claude Pro, made "AI in Terminal" series |
| **Matt Pocock** | YouTube/X | Large | Building "AI Hero" course, shares .cursor/rules |
| **Sabrina Ramonov** | TikTok | 670K | Forbes 30u30, teaches AI tools to millions |

### Tier 2: Strong Fit

| Creator | Platform | Contact |
|---------|----------|---------|
| **Traversy Media** | YouTube (2M) | traversymedia.com |
| **Code with Ania Kubow** | YouTube (400K) | codewithania.com |
| **AI Explained** | YouTube (375K) | @AIExplainedYT |
| **Wes Bos** | X/Podcast | wesbos.com |
| **Cassidy Williams** | X/Newsletter | cassidoo.co |

### Tier 3: Newsletter/Podcast

| Creator | Platform | Angle |
|---------|----------|-------|
| **Swyx (Latent Space)** | Newsletter | Coined "AI Engineer" |
| **Lenny Rachitsky** | Newsletter | Already partners with Cursor, Devin |
| **Alex Xu (ByteByteGo)** | Newsletter (1M+) | Sponsorship-friendly |
| **The AI Native Dev** | Podcast | Interviews tool makers |

### Outreach Template

```
Subject: Navi - GUI for Claude Code (perfect for your audience)

Hey [Name],

I've been watching your [specific video/post about AI coding tools] - loved your take on [specific point].

I built Navi because I got tired of squinting at terminal output while using Claude Code. It's a desktop app that adds:
- Session management (never lose context again)
- Visual task progress (see exactly what Claude is doing)
- Custom agents and usage tracking

Would love to give you early access and see if it's worth covering. Happy to do a demo call or just send you a download link.

[Your name]
```

---

## 4. Instagram Ad Creatives

### Created Assets

| File | Format | Size | Use Case |
|------|--------|------|----------|
| `creative-1-feed.png` | 1080x1080 | Feed post | Main comparison ad |
| `creative-2-story.png` | 1080x1920 | Story/Reel | Full feature showcase |
| `creative-3-carousel-1.png` | 1080x1080 | Carousel | Problem intro |
| `creative-3-carousel-2.png` | 1080x1080 | Carousel | Session management |
| `creative-3-carousel-3.png` | 1080x1080 | Carousel | Visual progress |
| `creative-3-carousel-4-cta.png` | 1080x1080 | Carousel | CTA slide |

### Ad Copy Suggestions

**Feed Post**
```
Claude Code. Now with a GUI.

Stop squinting at terminal output.
✓ Session management
✓ Visual task progress
✓ Custom agents

Early access: link in bio
```

**Story**
```
Building with Claude Code?

Swipe up for the desktop app that shows you exactly what it's doing.

No more lost context. No more guessing.
```

**Carousel**
```
Slide 1: The Problem with Terminal Claude Code
Slide 2: Session Management (never lose context)
Slide 3: Visual Task Progress (see every file change)
Slide 4: Download Navi - The Desktop App for Claude Code
```

---

## Next Steps

1. **Analytics**: Add Sentry + Aptabase to the Tauri app
2. **Google Ads**: Set up account, create campaigns with test budget
3. **Influencers**: Draft personalized outreach for Tier 1 creators
4. **Instagram**: Upload creatives, set up ad campaign

---

*Generated by Navi + Claude on 2026-01-07*
