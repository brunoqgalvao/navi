# Nano Banana - AI Image Generation Project

This project is set up for **AI image generation** using Google's Gemini image models.

## Available Models

- **Nano Banana** (gemini-2.5-flash-image) - Fast, efficient generation
- **Nano Banana Pro** (gemini-3-pro-image-preview) - Professional-grade, highest quality

## Quick Commands

```bash
# Generate an image
nano-banana generate "a sunset over mountains"

# High quality with Pro model
nano-banana generate "professional portrait" --pro

# Edit an existing image
nano-banana edit input.png "add a red hat"

# Custom output filename
nano-banana generate "a cat" -o my-cat.png
```

## Available Skills

- `nano-banana-image-gen` - Core image generation capability
- `generate-logo` - Professional logo creation
- `canvas-design` - Visual art and design creation

## Workflow

1. **Describe** what you want to create
2. **Generate** using the appropriate model
3. **Iterate** with edits if needed
4. **Export** in the format you need

## Example Prompts

### For Photos/Realism
```
"professional headshot of a business person, studio lighting,
neutral background, sharp focus, high quality"
```

### For Illustrations
```
"whimsical children's book illustration of a forest with
talking animals, watercolor style, soft pastel colors"
```

### For Logos
```
"minimalist logo for a coffee shop called Bean There,
modern clean lines, geometric, vector-style"
```

### For Art
```
"abstract digital art representing growth and innovation,
flowing organic shapes, gradient blues and greens"
```

## Pro Tips

1. **Be specific** - More detail = better results
2. **Use style keywords** - "minimalist", "vintage", "photorealistic"
3. **Specify colors** - "warm earth tones", "electric blue accents"
4. **Include context** - "suitable for app icon", "print-ready"
5. **Use Pro for final versions** - Flash for iteration, Pro for delivery

## Setup

Requires `GEMINI_API_KEY` in your `.env` file:

```bash
GEMINI_API_KEY=your-api-key-here
```

Get your key at: https://makersuite.google.com/app/apikey
