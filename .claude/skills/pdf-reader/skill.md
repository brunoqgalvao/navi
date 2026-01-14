# PDF Reader Skill

Read PDF files with optional page range support using `pdftotext` (from poppler).

## Usage

Read entire PDF:
```bash
pdftotext -layout "/path/to/file.pdf" -
```

Read specific page range (e.g., pages 5-10):
```bash
pdftotext -f 5 -l 10 -layout "/path/to/file.pdf" -
```

Read a single page (e.g., page 3):
```bash
pdftotext -f 3 -l 3 -layout "/path/to/file.pdf" -
```

## Options

- `-f <int>`: First page to convert (default: 1)
- `-l <int>`: Last page to convert (default: last page)
- `-layout`: Maintain original layout
- `-raw`: Keep strings in content stream order
- `-`: Output to stdout (instead of file)

## Get PDF info (page count, metadata)

```bash
pdfinfo "/path/to/file.pdf"
```

## Setup

Run the setup script first:
```bash
~/.claude/skills/pdf-reader/setup.sh
```
