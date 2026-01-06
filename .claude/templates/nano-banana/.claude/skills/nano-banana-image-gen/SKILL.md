---
name: nano-banana-image-gen
description: Generate images using Nano Banana Pro and Nano Banana APIs via JavaScript/Node SDK. Use this skill when the user asks to generate images, create graphics, produce visual content, or interact with Nano Banana image generation APIs.
---

# Nano Banana Image Generation

Generate AI images using the Nano Banana API.

## Usage

When the user wants to generate an image:

1. Use the Nano Banana SDK to generate images
2. Save the result to the project directory
3. Display the generated image

## Example Prompts

- "Generate an image of a sunset over mountains"
- "Create a logo for my app"
- "Make a banner image for my website"

## API

```typescript
import { NanoBanana } from 'nano-banana';

const nb = new NanoBanana({ apiKey: process.env.NANO_BANANA_API_KEY });
const result = await nb.generate({ prompt: "your prompt here" });
```
