import re
import json
import logging

from modules.utils import detect_section_header

logger = logging.getLogger(__name__)


def _split_text_for_gemini(text, max_chars=12000):
    """Split large extracted text into chunks to avoid model truncation."""
    cleaned = text.strip()
    if not cleaned:
        return []

    if len(cleaned) <= max_chars:
        return [cleaned]

    blocks = re.split(r'\n\s*\n', cleaned)
    chunks = []
    current = []
    current_len = 0

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        add_len = len(block) + (2 if current else 0)
        if current and current_len + add_len > max_chars:
            chunks.append('\n\n'.join(current))
            current = [block]
            current_len = len(block)
        else:
            current.append(block)
            current_len += add_len

    if current:
        chunks.append('\n\n'.join(current))

    return chunks


def _extract_json_payload(response_text):
    """Extract the first valid JSON array or object payload from model output."""
    txt = response_text.strip()
    if txt.startswith('```'):
        parts = txt.split('```')
        if len(parts) >= 2:
            txt = parts[1].strip()
            if txt.lower().startswith('json'):
                txt = txt[4:].strip()

    start_arr = txt.find('[')
    end_arr = txt.rfind(']')
    if start_arr != -1 and end_arr != -1 and end_arr > start_arr:
        return txt[start_arr:end_arr + 1]

    start_obj = txt.find('{')
    end_obj = txt.rfind('}')
    if start_obj != -1 and end_obj != -1 and end_obj > start_obj:
        return txt[start_obj:end_obj + 1]

    return txt


def _normalize_answer_index(raw_correct, options):
    """Normalize answer to 0-based index from int/letter/number/text formats."""
    if not options:
        return None

    opt_len = len(options)
    if isinstance(raw_correct, int):
        return raw_correct if 0 <= raw_correct < opt_len else None

    raw = str(raw_correct or '').strip()
    if not raw:
        return None

    letter_match = re.search(r'\b([A-Z])\b', raw, re.IGNORECASE)
    if letter_match:
        idx = ord(letter_match.group(1).upper()) - ord('A')
        if 0 <= idx < opt_len:
            return idx

    number_match = re.search(r'\b(\d+)\b', raw)
    if number_match:
        idx = int(number_match.group(1)) - 1
        if 0 <= idx < opt_len:
            return idx

    raw_fold = re.sub(r'\s+', ' ', raw).strip().lower()
    for i, opt in enumerate(options):
        if re.sub(r'\s+', ' ', str(opt)).strip().lower() == raw_fold:
            return i

    return None


def _normalize_question(raw_q):
    """Normalize model output question object into app schema."""
    if not isinstance(raw_q, dict):
        return None

    text = str(raw_q.get('text', '')).strip()
    raw_options = raw_q.get('options', [])
    if isinstance(raw_options, dict):
        raw_options = list(raw_options.values())

    options = [str(opt).strip() for opt in raw_options if str(opt).strip()]
    if not text or len(options) < 2:
        return None

    raw_answer_candidates = [
        raw_q.get('correct'),
        raw_q.get('answer'),
        raw_q.get('correct_answer'),
        raw_q.get('final_answer'),
        raw_q.get('answer_key'),
    ]

    correct = None
    for candidate in raw_answer_candidates:
        correct = _normalize_answer_index(candidate, options)
        if correct is not None:
            break

    # Keep question even if model omitted answer; deterministic fallback.
    if correct is None:
        correct = 0

    explanation = str(raw_q.get('explanation') or '').strip() or 'No explanation provided.'
    section = str(raw_q.get('section') or '').strip() or 'General'
    answer_source = str(raw_q.get('answer_source') or '').strip() or 'model_inferred'
    answer_confidence = str(raw_q.get('answer_confidence') or '').strip() or 'medium'
    has_special_chars = bool(
        raw_q.get('has_special_chars')
        or detect_special_symbols(text)
        or any(detect_special_symbols(opt) for opt in options)
    )

    return {
        'text': text,
        'options': options,
        'correct': correct,
        'explanation': explanation,
        'section': section,
        'answer_source': answer_source,
        'answer_confidence': answer_confidence,
        'has_special_chars': has_special_chars,
    }


def parse_questions_with_gemini(text):
    """
    Parse questions from extracted text using Google Gemini API.
    Handles messy and complex question formats intelligently.
    """
    try:
        import google.generativeai as genai
        from modules.config import GEMINI_API_KEY, GEMINI_MODEL
        
        if not GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY not configured, falling back to regex parsing")
            return None
        
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL)
        
        prompt_template = """You are an expert MCQ parser and solver. Extract ALL multiple-choice questions from the text and return ONLY JSON.

The source may be very messy (broken lines, OCR noise, mixed subjects, inline options). Parse everything accurately.

Accept ALL question domains and styles:
- reasoning, quantitative aptitude, verbal ability, english comprehension, mathematics, science, logic puzzles
- series/pattern, statement-assumption, analogy, syllogism, coding-decoding, arithmetic, algebra, geometry, DI

Rules:
1. Preserve symbols and formulas exactly (sqrt, fractions, %, <=, >=, ±, etc.).
2. Reconstruct wrapped questions/options split across lines.
3. Support options in separate lines OR inline formats like: A) ... B) ... C) ... D) ...
4. If source has an answer marker (Answer/Ans/Correct/Right Option), verify it against the solved logic.
5. If source answer is missing or wrong, solve the question and output corrected answer.
6. Output 0-based answer index in "correct" and provide short rationale in "explanation".
7. Do not skip valid questions only because answer key is missing/wrong.

Return JSON array format exactly:
[
  {{
    "text": "question text",
    "options": ["opt1", "opt2", "opt3", "opt4"],
    "correct": 0,
    "explanation": "optional explanation",
    "section": "General",
        "answer_source": "provided|model_corrected|model_inferred",
        "answer_confidence": "high|medium|low",
    "has_special_chars": false
  }}
]

TEXT:
{chunk}
"""

        questions = []
        seen = set()
        chunks = _split_text_for_gemini(text)

        for chunk_idx, chunk in enumerate(chunks, start=1):
            prompt = prompt_template.format(chunk=chunk)
            try:
                response = model.generate_content(
                    prompt,
                    generation_config={
                        'temperature': 0.1,
                        'response_mime_type': 'application/json',
                    },
                )
            except Exception:
                # Older SDK/runtime may not support response_mime_type.
                response = model.generate_content(prompt)

            response_text = (response.text or '').strip()
            payload = _extract_json_payload(response_text)
            try:
                parsed = json.loads(payload)
            except json.JSONDecodeError:
                logger.warning(f"Gemini chunk {chunk_idx}: invalid JSON, skipping chunk")
                continue

            if isinstance(parsed, dict):
                parsed = parsed.get('questions', [])
            if not isinstance(parsed, list):
                logger.warning(f"Gemini chunk {chunk_idx}: non-list response ignored")
                continue

            for raw_q in parsed:
                q = _normalize_question(raw_q)
                if not q:
                    continue

                dedupe_key = (
                    q['text'].strip().lower(),
                    tuple(opt.strip().lower() for opt in q['options']),
                )
                if dedupe_key in seen:
                    continue

                seen.add(dedupe_key)
                questions.append(q)

        for idx, q in enumerate(questions, start=1):
            q['id'] = idx
        
        if questions:
            logger.info(f"Gemini API successfully parsed {len(questions)} questions")
        return questions if questions else None
        
    except ImportError:
        logger.warning("google-generativeai not installed, skipping Gemini parsing")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"Gemini API parsing failed: {e}")
        return None


def detect_special_symbols(text):
    """Detect if text contains special symbols that need monospace formatting."""
    special_pattern = r'[@#$*%^&()[\]{}|\\<>~/+\-=√×÷≤≥±≈≠∞∑∏π∆]'
    return bool(re.search(special_pattern, text))


def extract_text_from_file(filepath, filename):
    ext = filename.rsplit('.', 1)[1].lower()
    text = ''
    if ext == 'txt':
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
    elif ext == 'pdf':
        try:
            import PyPDF2
            with open(filepath, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + '\n'
        except Exception as e:
            text = f'Error reading PDF: {str(e)}'
    elif ext in ['doc', 'docx']:
        try:
            import docx
            doc = docx.Document(filepath)
            for para in doc.paragraphs:
                text += para.text + '\n'
        except Exception as e:
            text = f'Error reading Word file: {str(e)}'
    return text


def parse_questions_with_ai_fallback(text):
    """Parse questions from extracted text using pattern matching."""
    questions = []

    lines = text.split('\n')
    current_options = []
    current_answer = None
    current_explanation = ''
    q_text = ''
    current_section = 'General'
    q_section = 'General'
    option_style = None

    def flush_current_question():
        nonlocal q_text, current_options, current_answer, current_explanation, option_style
        if q_text and current_options:
            # Detect special characters for formatting
            has_symbols = detect_special_symbols(q_text) or any(detect_special_symbols(opt) for opt in current_options)
            
            questions.append({
                'id': len(questions) + 1,
                'text': q_text.strip(),
                'options': current_options,
                'correct': current_answer if current_answer is not None else 0,
                'explanation': current_explanation.strip() if current_explanation else 'No explanation provided.',
                'section': q_section,
                'has_special_chars': has_symbols
            })
        q_text = ''
        current_options = []
        current_answer = None
        current_explanation = ''
        option_style = None

    def parse_answer_index(line_text):
        answer_core = re.match(r'^(?:Answer|Ans|Correct|Right\s*Option)\s*[:\-]?\s*(.+)$', line_text, re.IGNORECASE)
        if not answer_core:
            return None

        value = answer_core.group(1).strip()
        alpha = re.search(r'\b([A-Za-z])\b', value)
        if alpha:
            return ord(alpha.group(1).upper()) - ord('A')

        numeric = re.search(r'\b(\d+)\b', value)
        if numeric:
            return max(0, int(numeric.group(1)) - 1)

        return None

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        section_name = detect_section_header(line)
        if section_name:
            flush_current_question()
            current_section = section_name
            i += 1
            continue

        q_explicit = re.match(r'^(?:Q\.?\s*\d+|Question\s+\d+)\s*[:.)\-]?\s*(.*)', line, re.IGNORECASE)
        if q_explicit:
            flush_current_question()
            q_text = q_explicit.group(1) if q_explicit.group(1) else ''
            q_section = current_section
        elif re.match(r'^\d+[.)]\s+', line):
            q_match = re.match(r'^(\d+)[.)]\s+(.*)', line)
            if q_match:
                flush_current_question()
                q_text = q_match.group(2) if q_match.group(2) else ''
                q_section = current_section
        elif re.match(r'^[A-Za-z][.):-]\s+', line):
            opt_match = re.match(r'^([A-Za-z])[.):-]\s+(.*)', line)
            if opt_match:
                option_style = option_style or 'alpha'
                current_options.append(opt_match.group(2).strip())
        elif q_text and re.match(r'^\(?\d+\)?\s*(?:\)|\-|\:)\s+', line):
            num_opt = re.match(r'^\(?\d+\)?\s*(?:\)|\-|\:)\s+(.*)', line)
            if num_opt:
                option_style = option_style or 'numeric'
                current_options.append(num_opt.group(1).strip())
        else:
            inline_alpha = re.findall(r'([A-Ha-h])[.):-]\s*(.*?)(?=(?:\s+[A-Ha-h][.):-]\s+)|$)', line)
            if q_text and len(inline_alpha) >= 2:
                option_style = option_style or 'alpha'
                current_options.extend([opt.strip() for _, opt in inline_alpha if opt.strip()])
            else:
                inline_num = re.findall(r'(\d{1,2})[.):-]\s*(.*?)(?=(?:\s+\d{1,2}[.):-]\s+)|$)', line)
                if q_text and len(inline_num) >= 2:
                    option_style = option_style or 'numeric'
                    current_options.extend([opt.strip() for _, opt in inline_num if opt.strip()])
                else:
                    parsed_answer = parse_answer_index(line)
                    if parsed_answer is not None:
                        current_answer = parsed_answer
                    elif re.match(r'^(?:Explanation|Reason|Solution)[:\s]', line, re.IGNORECASE):
                        current_explanation = re.sub(r'^(?:Explanation|Reason|Solution)[:\s]*', '', line, flags=re.IGNORECASE)
                    elif current_explanation:
                        current_explanation += ' ' + line
                    elif q_text and not current_options:
                        q_text += ' ' + line

        i += 1

    flush_current_question()
    return questions


def generate_sample_questions_from_text(text):
    """Generate MCQ-style questions from raw text using simple NLP."""
    sentences = [s.strip() for s in re.split(r'[.!?]', text) if len(s.strip()) > 20]
    questions = []

    for i, sent in enumerate(sentences[:10]):
        if len(sent) < 20:
            continue
        words = sent.split()
        if len(words) < 5:
            continue

        key_idx = len(words) // 2
        key_word = words[key_idx]
        blanked = ' '.join(words[:key_idx] + ['_____'] + words[key_idx + 1:])

        fake_words = ['concept', 'theory', 'method', 'process']
        options = [key_word] + fake_words[:3]

        questions.append({
            'id': i + 1,
            'text': f'Fill in the blank: {blanked}',
            'options': options,
            'correct': 0,
            'explanation': f"The correct answer is '{key_word}'. Original context: {sent}",
            'section': 'General'
        })

    return questions
