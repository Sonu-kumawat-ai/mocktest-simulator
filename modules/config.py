import os
import tempfile
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt'}

# Vercel/serverless runtime allows writes only in temp storage.
if os.getenv('VERCEL'):
	UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), 'mocktest_uploads')
else:
	UPLOAD_FOLDER = 'uploads'

MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB

# Gemini API Configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
USE_GEMINI = bool(GEMINI_API_KEY)
GEMINI_MODEL = 'gemini-2.5-flash-lite'  # Latest, faster, and more cost-effective
