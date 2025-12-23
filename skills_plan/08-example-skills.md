# Example Skills

## 1. Debug Detective

```
debug-detective/
├── SKILL.md
└── references/
    └── common-errors.md
```

### SKILL.md

```markdown
---
name: debug-detective
description: Systematic debugging approach for complex issues. Use when encountering errors, unexpected behavior, or investigating problems in code.
version: 1.0.0
allowed-tools: Read, Grep, Glob, Bash
---

# Debug Detective

When debugging issues, follow this systematic approach:

## Step 1: Gather Context

Before making any changes:
- What is the expected behavior?
- What is the actual behavior?
- When did this start happening?
- What changed recently?

## Step 2: Reproduce the Issue

- Identify minimal steps to reproduce
- Note any environment-specific factors
- Document error messages exactly

## Step 3: Analyze

1. **Check logs first** - Always look for error messages and stack traces
2. **Trace data flow** - Follow the data from input to where it fails
3. **Identify boundaries** - Is it frontend, backend, database, or external service?
4. **Check recent changes** - Use git log and git diff

## Step 4: Hypothesize and Test

- Form a hypothesis about the root cause
- Design a minimal test to verify
- If wrong, eliminate that possibility and try next

## Step 5: Fix and Verify

- Make the smallest change that fixes the issue
- Verify the fix doesn't break other things
- Add tests to prevent regression

## Common Patterns

See references/common-errors.md for common error patterns and solutions.
```

---

## 2. Concise Writer

```
concise-writer/
└── SKILL.md
```

### SKILL.md

```markdown
---
name: concise-writer
description: Write clear, concise responses without unnecessary verbosity. Use for all interactions to maintain direct communication.
version: 1.0.0
---

# Concise Writer

Apply these principles to all responses:

## Core Rules

1. **No preamble** - Don't start with "I'll help you with...", "Sure!", "Great question!"
2. **No postamble** - Don't end with "Let me know if you need anything else"
3. **Answer first** - Lead with the answer, not the explanation
4. **Minimal words** - Use fewest words that convey the meaning

## Examples

### Bad
"I'd be happy to help you with that! To rename a file in bash, you can use the mv command. Here's how you would do it: `mv old.txt new.txt`. This moves the file from the old name to the new name. Let me know if you have any questions!"

### Good
`mv old.txt new.txt`

### Bad  
"Great question! The error you're seeing is likely caused by a missing dependency. I would recommend running npm install first to make sure all dependencies are installed. After that, try running your command again and it should work."

### Good
Missing dependency. Run `npm install` first.

## When to Expand

Only add explanation when:
- User explicitly asks "why" or "how does this work"
- The solution has non-obvious gotchas
- Multiple valid approaches exist

Even then, keep it brief.
```

---

## 3. Code Reviewer

```
code-reviewer/
├── SKILL.md
└── references/
    ├── checklist.md
    └── common-issues.md
```

### SKILL.md

```markdown
---
name: code-reviewer
description: Thorough code review following best practices. Use when reviewing pull requests, code changes, or auditing existing code.
version: 1.0.0
allowed-tools: Read, Grep, Glob
---

# Code Reviewer

When reviewing code, follow this structured approach:

## Review Checklist

### 1. Correctness
- [ ] Does the code do what it's supposed to do?
- [ ] Are edge cases handled?
- [ ] Are error conditions handled properly?

### 2. Security
- [ ] No hardcoded secrets or credentials
- [ ] Input validation present
- [ ] No SQL injection, XSS, or other vulnerabilities
- [ ] Proper authentication/authorization checks

### 3. Performance
- [ ] No obvious O(n²) or worse algorithms where O(n) is possible
- [ ] No unnecessary database queries in loops
- [ ] Appropriate caching where needed

### 4. Maintainability
- [ ] Clear naming conventions
- [ ] Reasonable function/method sizes
- [ ] DRY - no unnecessary duplication
- [ ] Comments explain "why", not "what"

### 5. Testing
- [ ] New code has tests
- [ ] Tests cover happy path and edge cases
- [ ] Tests are readable and maintainable

### 6. Style
- [ ] Follows project conventions
- [ ] Consistent formatting
- [ ] No dead code or commented-out blocks

## Giving Feedback

- Be specific: point to exact lines
- Explain why something is a problem
- Suggest a solution when possible
- Distinguish "must fix" from "nice to have"
- Acknowledge good patterns too

See references/checklist.md for detailed checklist.
See references/common-issues.md for common problems to watch for.
```

---

## 4. API Designer

```
api-designer/
└── SKILL.md
```

### SKILL.md

```markdown
---
name: api-designer
description: Design clean, consistent REST APIs following best practices. Use when creating new endpoints or refactoring existing APIs.
version: 1.0.0
---

# API Designer

Follow these conventions when designing APIs:

## URL Structure

- Use nouns, not verbs: `/users` not `/getUsers`
- Plural for collections: `/users`, `/posts`
- Nested for relationships: `/users/:id/posts`
- Lowercase with hyphens: `/user-profiles`

## HTTP Methods

| Method | Purpose | Idempotent |
|--------|---------|------------|
| GET | Read | Yes |
| POST | Create | No |
| PUT | Replace | Yes |
| PATCH | Update | Yes |
| DELETE | Remove | Yes |

## Response Codes

- 200: Success (GET, PUT, PATCH)
- 201: Created (POST)
- 204: No Content (DELETE)
- 400: Bad Request (validation error)
- 401: Unauthorized (not logged in)
- 403: Forbidden (not allowed)
- 404: Not Found
- 409: Conflict (duplicate, etc)
- 500: Server Error

## Request/Response Format

```json
// Success
{
  "data": { ... },
  "meta": { "total": 100, "page": 1 }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": { "field": "email" }
  }
}
```

## Pagination

```
GET /users?page=2&limit=20
GET /users?cursor=abc123&limit=20
```

## Filtering & Sorting

```
GET /users?status=active&role=admin
GET /users?sort=-created_at,name
```

## Versioning

Prefer URL versioning: `/v1/users`
```

---

## 5. Test Writer

```
test-writer/
└── SKILL.md
```

### SKILL.md

```markdown
---
name: test-writer
description: Write comprehensive, maintainable tests. Use when adding tests for new features or improving test coverage.
version: 1.0.0
allowed-tools: Read, Write, Edit, Bash
---

# Test Writer

## Test Structure

Follow AAA pattern:
1. **Arrange** - Set up test data and conditions
2. **Act** - Execute the code being tested  
3. **Assert** - Verify the results

## Naming Convention

```
test_[unit]_[scenario]_[expected_result]
```

Examples:
- `test_user_create_with_valid_email_succeeds`
- `test_user_create_with_duplicate_email_returns_409`
- `test_calculator_divide_by_zero_throws_error`

## What to Test

### Happy Path
- Normal inputs produce expected outputs
- Main use case works correctly

### Edge Cases
- Empty inputs
- Boundary values (0, -1, MAX_INT)
- Null/undefined handling

### Error Cases
- Invalid inputs
- Missing required fields
- Unauthorized access
- External service failures

## Test Independence

- Each test should be independent
- No shared mutable state between tests
- Use setup/teardown for common fixtures
- Tests should pass in any order

## Mocking

Mock external dependencies:
- Database calls
- API requests
- File system
- Time/dates

Don't mock:
- The code being tested
- Simple utilities

## Coverage Goals

- Aim for meaningful coverage, not 100%
- Critical paths: 100%
- Business logic: 90%+
- Utilities: 80%+
- UI components: 70%+
```
