import os
import random
import uuid

from flask import jsonify, render_template, request, session
from werkzeug.utils import secure_filename

from modules.parsers import (
    extract_text_from_file,
    generate_sample_questions_from_text,
    parse_questions_with_ai_fallback,
)
from modules.storage import delete_test_data, load_test_data, save_test_data
from modules.utils import allowed_file, build_sections_from_questions, parse_bool


def register_routes(app):
    def current_test_data():
        test_id = session.get('test_id')
        if not test_id:
            return None
        return load_test_data(test_id)

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/upload', methods=['POST'])
    def upload_file():
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['file']
        try:
            total_time = int(request.form.get('total_time', 60))
            sectional_time = int(request.form.get('sectional_time', 0))
            marks_per_question = float(request.form.get('marks_per_question', 1.0))
            negative_marking_enabled = parse_bool(request.form.get('negative_marking_enabled', 'false'))
            negative_marks = float(request.form.get('negative_marks', 0.0)) if negative_marking_enabled else 0.0
            shuffle_questions = parse_bool(request.form.get('shuffle_questions', 'false'))
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid test settings values provided.'}), 400

        if total_time < 1:
            return jsonify({'error': 'Total time must be at least 1 minute.'}), 400
        if sectional_time < 0:
            return jsonify({'error': 'Section timer cannot be negative.'}), 400
        if marks_per_question <= 0:
            return jsonify({'error': 'Marks per question must be greater than 0.'}), 400
        if negative_marking_enabled and negative_marks < 0:
            return jsonify({'error': 'Negative marking must be 0 or greater.'}), 400

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed. Use PDF, DOC, DOCX, or TXT'}), 400

        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        filename = secure_filename(file.filename)
        unique_name = f"{uuid.uuid4()}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)

        text = extract_text_from_file(filepath, filename)
        questions = parse_questions_with_ai_fallback(text)

        if not questions:
            questions = generate_sample_questions_from_text(text)

        if not questions:
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': 'Could not extract questions from file. Please ensure your file contains MCQ-format questions (numbered with A/B/C/D options).'}), 400

        pre_sections = build_sections_from_questions(questions)
        has_sections = len(pre_sections) > 1 or any(q.get('section', 'General') != 'General' for q in questions)

        if shuffle_questions:
            if has_sections:
                section_order = []
                section_buckets = {}
                for q in questions:
                    sec = q.get('section', 'General')
                    if sec not in section_buckets:
                        section_buckets[sec] = []
                        section_order.append(sec)
                    section_buckets[sec].append(q)

                shuffled = []
                for sec in section_order:
                    bucket = section_buckets[sec]
                    random.shuffle(bucket)
                    shuffled.extend(bucket)
                questions = shuffled
            else:
                random.shuffle(questions)

        for idx, q in enumerate(questions, start=1):
            q['id'] = idx

        sections = build_sections_from_questions(questions)
        num_sections = len(sections) if sections else 1
        if has_sections:
            per_section_seconds = sectional_time * 60 if sectional_time > 0 else max(30, int((total_time * 60) / num_sections))
        else:
            per_section_seconds = sectional_time * 60 if sectional_time > 0 else 0

        test_id = str(uuid.uuid4())
        test_data = {
            'id': test_id,
            'questions': questions,
            'total_questions': len(questions),
            'total_time': total_time * 60,
            'sectional_time': sectional_time * 60,
            'section_time_seconds': per_section_seconds,
            'has_sections': has_sections,
            'sections': sections,
            'marks_per_question': marks_per_question,
            'negative_marks': negative_marks,
            'shuffle_questions': shuffle_questions,
            'answers': {},
            'time_per_question': {},
            'skipped': [],
            'filename': filename
        }

        save_test_data(test_id, test_data)
        session['test_id'] = test_id
        session.modified = True

        if os.path.exists(filepath):
            os.remove(filepath)

        return jsonify({
            'success': True,
            'test_id': test_id,
            'total_questions': len(questions),
            'total_time': total_time,
            'filename': filename,
            'settings': {
                'sectional_time': sectional_time,
                'section_time_seconds': per_section_seconds,
                'has_sections': has_sections,
                'sections': sections,
                'marks_per_question': marks_per_question,
                'negative_marks': negative_marks,
                'shuffle_questions': shuffle_questions
            }
        })

    @app.route('/test')
    def test_page():
        if not current_test_data():
            return render_template('index.html')
        return render_template('test.html')

    @app.route('/api/test-data')
    def get_test_data():
        data = current_test_data()
        if not data:
            return jsonify({'error': 'No active test'}), 404
        data = data.copy()

        questions_safe = []
        for q in data['questions']:
            questions_safe.append({
                'id': q['id'],
                'text': q['text'],
                'options': q['options'],
                'section': q.get('section', 'General')
            })

        return jsonify({
            'test_id': data['id'],
            'questions': questions_safe,
            'total_questions': data['total_questions'],
            'total_time': data['total_time'],
            'sectional_time': data['sectional_time'],
            'section_time_seconds': data.get('section_time_seconds', 0),
            'has_sections': data.get('has_sections', False),
            'sections': data.get('sections', []),
            'marks_per_question': data.get('marks_per_question', 1.0),
            'negative_marks': data.get('negative_marks', 0.0),
            'shuffle_questions': data.get('shuffle_questions', False),
            'filename': data['filename']
        })

    @app.route('/api/save-answer', methods=['POST'])
    def save_answer():
        test_data = current_test_data()
        if not test_data:
            return jsonify({'error': 'No active test'}), 404

        data = request.json
        q_id = str(data.get('question_id'))
        answer = data.get('answer')
        time_spent = data.get('time_spent', 0)

        test_data['answers'][q_id] = answer
        test_data['time_per_question'][q_id] = time_spent
        save_test_data(test_data['id'], test_data)

        return jsonify({'success': True})

    @app.route('/api/submit-test', methods=['POST'])
    def submit_test():
        test_data = current_test_data()
        if not test_data:
            return jsonify({'error': 'No active test'}), 404

        data = request.json
        answers = data.get('answers', {})
        time_per_question = data.get('time_per_question', {})

        test_data['answers'] = answers
        test_data['time_per_question'] = time_per_question
        test_data['submitted'] = True
        save_test_data(test_data['id'], test_data)

        return jsonify({'success': True, 'redirect': '/results'})

    @app.route('/results')
    def results_page():
        if not current_test_data():
            return render_template('index.html')
        return render_template('results.html')

    @app.route('/api/results')
    def get_results():
        test_data = current_test_data()
        if not test_data:
            return jsonify({'error': 'No results found'}), 404

        questions = test_data['questions']
        answers = test_data.get('answers', {})
        time_per_q = test_data.get('time_per_question', {})
        marks_per_question = float(test_data.get('marks_per_question', 1.0))
        negative_marks = float(test_data.get('negative_marks', 0.0))

        correct = 0
        incorrect = 0
        skipped = 0
        total_time_spent = 0
        results_detail = []
        section_stats = {}

        for q in questions:
            q_id = str(q['id'])
            user_answer = answers.get(q_id)
            time_spent = float(time_per_q.get(q_id, 0))
            total_time_spent += time_spent

            if user_answer is None or user_answer == -1:
                skipped += 1
                status = 'skipped'
            elif int(user_answer) == int(q['correct']):
                correct += 1
                status = 'correct'
            else:
                incorrect += 1
                status = 'incorrect'

            section_name = q.get('section', 'General')
            if section_name not in section_stats:
                section_stats[section_name] = {
                    'section': section_name,
                    'total': 0,
                    'correct': 0,
                    'incorrect': 0,
                    'skipped': 0,
                    'time_spent': 0.0
                }

            section_stats[section_name]['total'] += 1
            section_stats[section_name]['time_spent'] += time_spent
            if status == 'correct':
                section_stats[section_name]['correct'] += 1
            elif status == 'incorrect':
                section_stats[section_name]['incorrect'] += 1
            else:
                section_stats[section_name]['skipped'] += 1

            results_detail.append({
                'id': q['id'],
                'text': q['text'],
                'section': q.get('section', 'General'),
                'options': q['options'],
                'user_answer': user_answer,
                'correct_answer': q['correct'],
                'explanation': q.get('explanation', ''),
                'status': status,
                'time_spent': round(time_spent, 1)
            })

        total = len(questions)
        accuracy = round((correct / total * 100), 1) if total > 0 else 0
        avg_time = round(total_time_spent / total, 1) if total > 0 else 0
        score = round((correct * marks_per_question) - (incorrect * negative_marks), 2)
        max_score = round(total * marks_per_question, 2)

        sections_summary = []
        for section_name, stats in section_stats.items():
            attempted = stats['correct'] + stats['incorrect']
            section_accuracy = round((stats['correct'] / stats['total']) * 100, 1) if stats['total'] > 0 else 0
            attempted_accuracy = round((stats['correct'] / attempted) * 100, 1) if attempted > 0 else 0
            section_score = round((stats['correct'] * marks_per_question) - (stats['incorrect'] * negative_marks), 2)
            section_max_score = round(stats['total'] * marks_per_question, 2)
            avg_section_time = round(stats['time_spent'] / stats['total'], 1) if stats['total'] > 0 else 0

            sections_summary.append({
                'section': section_name,
                'total': stats['total'],
                'correct': stats['correct'],
                'incorrect': stats['incorrect'],
                'skipped': stats['skipped'],
                'attempted': attempted,
                'accuracy': section_accuracy,
                'attempted_accuracy': attempted_accuracy,
                'score': section_score,
                'max_score': section_max_score,
                'time_spent': round(stats['time_spent'], 1),
                'avg_time_per_question': avg_section_time
            })

        return jsonify({
            'summary': {
                'total': total,
                'correct': correct,
                'incorrect': incorrect,
                'skipped': skipped,
                'accuracy': accuracy,
                'score': score,
                'max_score': max_score,
                'marks_per_question': marks_per_question,
                'negative_marks': negative_marks,
                'shuffle_questions': bool(test_data.get('shuffle_questions', False)),
                'total_time': round(total_time_spent, 1),
                'avg_time_per_question': avg_time,
                'filename': test_data.get('filename', '')
            },
            'sections_summary': sections_summary,
            'questions': results_detail
        })

    @app.route('/api/reset', methods=['POST'])
    def reset_test():
        test_id = session.get('test_id')
        if test_id:
            delete_test_data(test_id)
        session.clear()
        return jsonify({'success': True})
