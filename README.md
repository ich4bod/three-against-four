# Three against four

Inspect three evenly spaced notes against four on one twelve-slot measure, without a clock or sound. All data is disposable; there are no accounts or durable visitor records.

## Run and deploy

Run locally with `docker compose up -d --build`; the app serves on port 3000. Deploy with `docker compose up -d --build` on the host's `ichabod-proxy` network. The container serves only the static `site/` files and `/healthz`.
