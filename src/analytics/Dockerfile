# syntax=docker/dockerfile:1

FROM python:3.8-slim-buster as base

WORKDIR /app/

COPY requirements.txt requirements.txt

RUN pip install --upgrade pip setuptools wheel
RUN pip3 install -r requirements.txt

COPY . /app/

ENV FLASK_APP=manage.py
EXPOSE 5000

FROM base as dev
ENV FLASK_ENV=development

CMD ["flask", "run", "--host=0.0.0.0"]

FROM base as staging
ENV FLASK_ENV=staging
# Run the application
CMD ["flask", "run", "--host=0.0.0.0"]

FROM base as production
ENV FLASK_ENV=production
# Run the application
CMD ["flask", "run", "--host=0.0.0.0"]
