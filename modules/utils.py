import re

from modules.config import ALLOWED_EXTENSIONS


def parse_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def detect_section_header(line):
    """Return a normalized section name if line looks like a section header."""
    if not line:
        return None
    s = line.strip()
    match = re.match(r'^(?:section|part|unit)\s*([A-Za-z0-9]+)?\s*[:\-]?\s*(.*)$', s, re.IGNORECASE)
    if not match:
        return None
    suffix = (match.group(1) or '').strip()
    title = (match.group(2) or '').strip()
    if not suffix and not title:
        return None
    if suffix and title:
        return f"Section {suffix}: {title}"
    if suffix:
        return f"Section {suffix}"
    return title


def build_sections_from_questions(questions):
    """Build contiguous section metadata based on question order."""
    sections = []
    if not questions:
        return sections

    current_name = questions[0].get('section', 'General')
    start_idx = 0

    for idx, q in enumerate(questions):
        q_name = q.get('section', 'General')
        if q_name != current_name:
            sections.append({
                'id': len(sections) + 1,
                'name': current_name,
                'start_idx': start_idx,
                'end_idx': idx - 1
            })
            current_name = q_name
            start_idx = idx

    sections.append({
        'id': len(sections) + 1,
        'name': current_name,
        'start_idx': start_idx,
        'end_idx': len(questions) - 1
    })
    return sections


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
