import os
import tempfile


ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt'}

# Vercel/serverless runtime allows writes only in temp storage.
if os.getenv('VERCEL'):
	UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), 'mocktest_uploads')
else:
	UPLOAD_FOLDER = 'uploads'

MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
