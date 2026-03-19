import re

from modules.utils import detect_section_header


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
            questions.append({
                'id': len(questions) + 1,
                'text': q_text.strip(),
                'options': current_options,
                'correct': current_answer if current_answer is not None else 0,
                'explanation': current_explanation.strip() if current_explanation else 'No explanation provided.',
                'section': q_section
            })
        q_text = ''
        current_options = []
        current_answer = None
        current_explanation = ''
        option_style = None

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
        elif re.match(r'^[A-Za-z][.)]\s+', line):
            opt_match = re.match(r'^([A-Za-z])[.)]\s+(.*)', line)
            if opt_match:
                option_style = option_style or 'alpha'
                current_options.append(opt_match.group(2).strip())
        elif q_text and re.match(r'^\(?\d+\)?\s*(?:\)|\-)\s+', line):
            num_opt = re.match(r'^\(?\d+\)?\s*(?:\)|\-)\s+(.*)', line)
            if num_opt:
                option_style = option_style or 'numeric'
                current_options.append(num_opt.group(1).strip())
        elif re.match(r'^\d+[.)]\s+', line):
            q_match = re.match(r'^(\d+)[.)]\s+(.*)', line)
            if q_match:
                flush_current_question()
                q_text = q_match.group(2) if q_match.group(2) else ''
                q_section = current_section
        elif re.match(r'^(?:Answer|Ans|Correct)\s*[:\-]?\s*[A-Za-z]\b', line, re.IGNORECASE):
            ans_match = re.match(r'^(?:Answer|Ans|Correct)\s*[:\-]?\s*([A-Za-z])\b', line, re.IGNORECASE)
            if ans_match:
                current_answer = ord(ans_match.group(1).upper()) - ord('A')
        elif re.match(r'^(?:Answer|Ans|Correct)\s*[:\-]?\s*\d+\b', line, re.IGNORECASE):
            ans_num = re.match(r'^(?:Answer|Ans|Correct)\s*[:\-]?\s*(\d+)\b', line, re.IGNORECASE)
            if ans_num:
                current_answer = max(0, int(ans_num.group(1)) - 1)
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
