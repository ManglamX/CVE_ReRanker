# backend/Dockerfile
FROM python:3.11-slim

# Install system dependencies (needed for spacy + compilation if needed)
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Copy requirements first to leverage Docker cache
COPY backend/requirements.txt ./backend/requirements.txt

# 2. Install Python dependencies
# Note: Hugging Face provides enough RAM (16GB), so we don't need to skip anything.
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# 3. Copy the necessary project folders
# We need backend, models, and data for the pipeline to work
COPY backend/ ./backend/
COPY models/ ./models/
COPY data/ ./data/

# 4. Set environment variables
# Hugging Face Spaces run on port 7860 by default
ENV PORT=7860
ENV HOST=0.0.0.0

# 5. Expose the port
EXPOSE 7860

# 6. Run the application
# We use 'backend.main:app' because we are in /app/ and main.py is in /app/backend/
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
