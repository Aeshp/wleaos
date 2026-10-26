# Use an official lightweight Python image
FROM python:3.12-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the requirements file and install dependencies separately from the app
# code so Docker can cache this layer and skip re-installing on code-only changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source into the container
COPY ./app ./app

# Document the port the server binds to (informational only — does not publish
# the port; use docker run -p or a compose ports mapping for that).
EXPOSE 8000

# Shell form is used intentionally: it allows the shell to expand ${PORT:-8000}
# at container startup, making the image compatible with cloud platforms such as
# Render and Heroku that inject a dynamic $PORT environment variable at runtime.
# Exec form (JSON array) would treat "${PORT:-8000}" as a literal string.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}