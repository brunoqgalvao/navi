---
name: vibe-coder
description: One-shot vibe coding pipeline with 3 specialized agents - Spec Interrogator, Implementation Planner, and Code Implementer. Use when the user wants to build an app, create a project, vibe code something, one-shot a feature, or needs a full development pipeline from idea to implementation.
---

# Vibe Coder - One-Shot Development Pipeline

Transform rough ideas into production code through a structured 3-agent pipeline.

## The Pipeline

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  1. SPEC AGENT  │ →  │  2. PLAN AGENT  │ →  │ 3. IMPLEMENT    │
│  (Interrogator) │    │  (Researcher)   │    │    AGENT        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
     Ask smart            Deep research          Execute with
     questions            + architecture         precision
```

## How to Use

When user provides an idea:

1. **Run the Spec Agent** - Ask clarifying questions, generate SPEC.md
2. **Run the Plan Agent** - Research and create IMPLEMENTATION_PLAN.md
3. **Run the Implement Agent** - Execute the plan step by step

## Quick Start

Just describe what you want to build:

> "I want to build a CLI tool that tracks my coffee consumption"

The pipeline will:
1. Ask clarifying questions about your idea
2. Generate a spec for your approval
3. Create an implementation plan
4. Build it step by step
