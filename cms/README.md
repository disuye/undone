# Undone CMS

Wagtail 8 / Django 6.1 / PostgreSQL 17. Renders the same markup as the static prototype (`../index.html`) and serves the shared front-end from `../assets/` at `/static/assets/`.

## Setup

```sh
cd cms
/opt/homebrew/bin/python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env            # fill in secret key + DB password
createuser -P undone && createdb -O undone undone
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py runserver
```

- Site: <http://localhost:8000/> · Admin: <http://localhost:8000/admin/>

## Layout

| Path | Role |
|---|---|
| `undone/settings.py` | Single settings module, configured from `.env` |
| `pages/models.py` | `HomePage` (site root, shows splash) and `ContentPage` (everything else) |
| `pages/blocks.py` | StreamField blocks — one per `data-is` block in `<main>` |
| `pages/wagtail_hooks.py` | Rich-text marks: Brand `<b>`, Highlight, 中 `<i lang>`, Emphasis `<em>` |
| `templates/base.html` | Masthead, background layers, footer — shared by every page |
| `pages/templates/pages/blocks/` | One template per block, markup identical to the prototype |
