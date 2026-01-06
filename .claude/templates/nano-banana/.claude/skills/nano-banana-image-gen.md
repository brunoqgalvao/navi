# Link to Global Skill

This template uses the global `nano-banana-image-gen` skill.

Location: `~/.claude/skills/nano-banana-image-gen/SKILL.md`

## Quick Reference

```bash
# Generate new image
nano-banana generate "prompt" [-o output.png] [--pro]

# Edit existing image
nano-banana edit image.png "prompt" [-o output.png] [--pro]
```

Models:
- Default: gemini-2.5-flash-image (fast)
- `--pro`: gemini-3-pro-image-preview (high quality)
