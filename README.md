# MockTest - Exam Simulator

A Flask + vanilla JS mock test platform for practicing MCQ exams with upload, timed test flow, scoring, section-wise analysis, and detailed review.

## Features

- **Intelligent Question Parsing**: Powered by Google Gemini API for handling messy and complex question formats
- **Answer Verification and Correction**: Gemini verifies provided keys, corrects wrong answers, and infers missing answers
- **Smart Formatting**: Automatic detection and proper formatting of series questions, special characters, and various question types
- **Upload question files** and auto-parse MCQs from PDF, DOCX, DOC, and TXT
- **Chunked Parsing for Large Files**: Splits long extracted text to improve reliability and avoid model truncation
- **Total timer** and optional section timer
- **Optional negative marking** and configurable marks per question
- **Optional shuffle** (section-aware)
- **Section-locked progression** during test
- **Auto-save answers** and time-per-question tracking
- **Auto-submit on timeout**
- **Results dashboard** with score, time insights, and section-wise analytics
- **Review answers** with filters (status + section)

## Quick Start

### 1. Install Dependencies

#### Windows (PowerShell)

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

#### Linux / macOS

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open: http://127.0.0.1:5000

### 2. (Optional) Enable Gemini API for Better Question Parsing

The system works without Gemini API using regex-based parsing, but Gemini provides **far superior handling** of messy and complex question files.

#### Get a Free Gemini API Key

1. Visit: https://aistudio.google.com/app/apikey
2. Click **"Create API Key"** (free tier available)
3. Copy your API key

#### Setup

1. Copy `.env.example` to `.env`:

   Windows (PowerShell):
   ```powershell
   Copy-Item .env.example .env
   ```

   Linux/macOS:
   ```bash
   cp .env.example .env
   ```

2. Add your Gemini API key to `.env`:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. Restart the Flask app

The system will now use Gemini for intelligent question parsing with automatic support for:
- **All question types** - Mathematics, Reasoning, English, Science, Aptitude, Logic, Series/Patterns, Matching, Fill-in-the-blank, etc.
- **Special characters and symbols** - Preserves mathematical notation (√, ×, ÷, ≤, ≥) and special symbols (@, #, $, etc.)
- **Complex multi-line questions** - Handles questions with long text, formulas, or nested structures
- **Section/chapter headers** - Automatically detects and organizes questions by section
- **Multiple answer key formats** - Recognizes "Answer:", "Ans:", "Correct:" and other variations
- **Flexible option formats** - Handles A/B/C/D, 1/2/3/4, or other numbering systems
- **Answer quality checks** - Verifies provided answers, fixes incorrect keys, and infers missing answers

Current model: **Gemini 2.5 Flash Lite** (`gemini-2.5-flash-lite`)

### Parsing Pipeline

1. Extract text from uploaded file
2. Parse with Gemini (chunked for long text)
3. Normalize options/answers (0-based indexing)
4. If Gemini is unavailable, fall back to regex parser
5. If parsing fails, generate sample questions as last resort

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
|-- .env.example                # Environment variable template
`-- README.md
```

## Supported Input Files

- TXT
- PDF
- DOC/DOCX

Files can be messy, poorly formatted, or contain complex question structures. Gemini API will intelligently parse them.

Notes on answer handling:
- If answer key is present, Gemini verifies it.
- If answer key is wrong, Gemini corrects it.
- If answer key is missing, Gemini infers a best answer.

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

### Series/Pattern Questions

```
Question: Which element is fourth to the right of the ninth element from the right end?
Series: P 1 R X 4 J E # 7 M T 2 I 9 * B 5 H @ 3 A $ G
A) @
B) 3
C) H
D) 5
E) A
Answer: A
```

### Mathematics Questions

```
Q1. If 3x + 5 = 20, what is the value of x?
A) 3
B) 5
C) 7
D) 9
Answer: B
Explanation: 3x = 20 - 5 = 15, so x = 5
```

### Reasoning Questions

```
Q2. If all cats are animals and all animals have fur, which statement must be true?
A) All cats have fur
B) All animals are cats
C) Some fur is not from animals
D) No animals have fur
Answer: A
```

### English/Comprehension Questions

```
Q3. In the passage above, what is the main idea?
A) History of literature
B) Evolution of writing
C) Modern technology
D) Ancient civilizations
Answer: B
```

## Notes

- `app.py` is the only startup file.
- Routes and business logic are split into the `modules/` package for maintainability.

## Vercel Notes

- Set environment variable `FLASK_SECRET_KEY` in your Vercel project settings.
- Uploads are written to temporary server storage in serverless runtime.
- Test state is stored server-side in temp JSON files keyed by `test_id` to avoid oversized cookie sessions.
