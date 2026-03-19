import json
import os
import tempfile


def _store_dir():
    base = tempfile.gettempdir()
    path = os.path.join(base, 'mocktest_state')
    os.makedirs(path, exist_ok=True)
    return path


def _state_file(test_id):
    return os.path.join(_store_dir(), f'{test_id}.json')


def save_test_data(test_id, data):
    with open(_state_file(test_id), 'w', encoding='utf-8') as f:
        json.dump(data, f)


def load_test_data(test_id):
    path = _state_file(test_id)
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def delete_test_data(test_id):
    path = _state_file(test_id)
    if os.path.exists(path):
        os.remove(path)
