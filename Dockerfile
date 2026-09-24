FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY streamlit_app.py ./
COPY app_pages/ app_pages/
COPY utils/ utils/
COPY lead_source/ lead_source/
COPY .streamlit/ .streamlit/

EXPOSE 8501

CMD ["streamlit", "run", "streamlit_app.py", "--server.address=0.0.0.0", "--server.port=8501"]
