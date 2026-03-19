import os

from flask import Flask

from modules.config import MAX_CONTENT_LENGTH, UPLOAD_FOLDER
from modules.routes import register_routes


app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'mocktest-dev-secret-change-me')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

register_routes(app)


if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.run(debug=True, port=5000)