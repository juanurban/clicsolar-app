import uvicorn
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, log_level="info")
