# MockTest - Exam Simulator

A Flask + vanilla JS mock test platform for practicing MCQ exams with upload, timed test flow, scoring, section-wise analysis, and detailed review.

## Quick Start

### Windows (PowerShell)

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### Linux / macOS

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open: http://127.0.0.1:5000

## Project Structure

```
MockTest/
|-- app.py                      # App entrypoint (startup remains here)
|-- modules/
|   |-- __init__.py
|   |-- config.py               # App constants and settings
|   |-- utils.py                # Shared helpers
|   |-- parsers.py              # File text extraction + question parsing
|   `-- routes.py               # Route registration and handlers
|-- templates/
|   |-- index.html
|   |-- test.html
|   `-- results.html
|-- static/
|   |-- css/
|   |   |-- style.css
|   |   |-- index.css
|   |   |-- test.css
|   |   `-- results.css
|   `-- js/
|       |-- index.js
|       |-- test.js
|       `-- results.js
|-- uploads/                    # Temporary upload files (runtime)
|-- requirements.txt
`-- README.md
```

## Supported Input Files

- TXT
- PDF
- DOC/DOCX

## Question Format Examples

### Alphabetic options

```
1. What is the capital of France?
A) London
B) Berlin
C) Paris
D) Madrid
Answer: C
Explanation: Paris is the capital of France.
```

### Numeric options

```
1) 2 + 2 = ?
1) 3
2) 4
3) 5
4) 6
Answer: 2
```

## Features

- Upload question files and auto-parse MCQs
- Total timer and optional section timer
- Optional negative marking and configurable marks per question
- Optional shuffle (section-aware)
- Section-locked progression during test
- Auto-save answers and time-per-question tracking
- Auto-submit on timeout
- Results dashboard with score, time insights, and section-wise analytics
- Review answers with filters (status + section)

## Notes

- `app.py` is the only startup file.
- Routes and business logic are split into the `modules/` package for maintainability.

## Vercel Notes

- Set environment variable `FLASK_SECRET_KEY` in your Vercel project settings.
- Uploads are written to temporary server storage in serverless runtime.
- Test state is stored server-side in temp JSON files keyed by `test_id` to avoid oversized cookie sessions.
