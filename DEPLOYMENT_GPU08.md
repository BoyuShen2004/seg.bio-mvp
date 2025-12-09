# pytc-client Deployment on GPU08

This document captures the exact steps required to stand up the
`pytc-client` backend and viewer UI on GPU08 and expose it at a
`*.seg.bio` subdomain. It mirrors the working GPU02 setup where it
matters (Docker, uv, nginx) but omits machine-specific details so you can
reuse it later.

## 1. Prerequisites

1. **System packages**
   ```bash
   sudo apt update
   sudo apt install -y git curl build-essential docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
   ```
2. **Docker permissions**
   ```bash
   sudo usermod -aG docker "$USER"
   newgrp docker
   ```
3. **GPU drivers**
   - Install the same NVIDIA driver / CUDA / cuDNN combo that GPU02 uses.
   - Confirm visibility:
     ```bash
     nvidia-smi
     docker info | grep -i runtime
     ```
4. **Repo checkout**
   ```bash
   git clone https://github.com/<org>/pytc-client.git
   cd pytc-client
   ```

## 2. Backend Container (FastAPI + PyTC worker)

The backend container already bundles uv and PyTorch Connectomics. Prepare
bind mounts for datasets/logs before starting:

```bash
sudo mkdir -p /data/pytc/{lucchi_test,test_output,configs}
sudo chown -R "$USER":"$USER" /data/pytc
```

Copy your Lucchi TIFFs, checkpoints, and hydra configs into those
directories.

### Build
```bash
docker compose build backend
```

### Run
```bash
docker compose up -d backend
```

Ports exposed:
- `4242` FastAPI API (`/api`, `/segment`, `/neuroglancer`, chatbot)
- `4243` PyTC worker (`/start_model_training`, `/start_model_inference`)
- `4244` Neuroglancer token server
- `6006` TensorBoard

Check health:
```bash
curl http://127.0.0.1:4242/hello
curl http://127.0.0.1:4243/hello
```

Logs:
```bash
docker compose logs -f backend
```

## 3. Frontend Build

Run once per deployment or after client changes:
```bash
cd client
npm install
rm -f .env            # ensure prod URLs are auto-detected
npm run build
cd ..
```

Publish the build output to nginx’s web root:
```bash
sudo mkdir -p /var/www/seg.bio
sudo rsync -av --delete client/build/ /var/www/seg.bio/
```

## 4. nginx on GPU08

Create `/etc/nginx/sites-available/seg.bio` with the following structure
(swap `viewer.seg.bio` for the desired subdomain):

```nginx
server {
    listen 80;
    server_name viewer.seg.bio;
    location /.well-known/acme-challenge/ {
        root /var/www/seg.bio;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name viewer.seg.bio;

    ssl_certificate     /etc/letsencrypt/live/seg.bio/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seg.bio/privkey.pem;

    root /var/www/seg.bio;
    index index.html;
    client_max_body_size 512M;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4242/;
        include /etc/nginx/proxy_params;
    }

    location /neuroglancer/ {
        proxy_pass http://127.0.0.1:4244/;
        include /etc/nginx/proxy_params;
    }

    location /tensorboard/ {
        proxy_pass http://127.0.0.1:6006/;
        include /etc/nginx/proxy_params;
    }
}
```

Enable and reload:
```bash
sudo ln -sf /etc/nginx/sites-available/seg.bio /etc/nginx/sites-enabled/seg.bio
sudo nginx -t
sudo systemctl reload nginx
```

### TLS

Point the DNS record for `viewer.seg.bio` at GPU08’s public IP. Then run:
```bash
sudo certbot --nginx -d viewer.seg.bio
```
Certbot will inject the SSL directives automatically. Renewals are handled by
`/etc/cron.d/certbot`.

## 5. Chatbot + External Services

The chatbot points to an Ollama instance at
`http://cscigpu08.bc.edu:11434`. If you want GPU08 to host its own Ollama:

1. Install Ollama and the required model.
2. Update `server_api/chatbot/chatbot.py` to use `http://127.0.0.1:11434`.
3. Rebuild/restart the backend container.

## 6. Verifications

1. Visit `https://viewer.seg.bio` and confirm the SPA loads.
2. Upload the demo Lucchi files or use the prepopulated entries and click
   **Visualize**. You should see a new Neuroglancer tab after a short delay.
3. Kick off a segmentation run; verify `/start_model_inference` logs appear
   (`docker compose logs -f backend`).
4. Check TensorBoard via `https://viewer.seg.bio/tensorboard/`.

## 7. Operational Notes

- To update the backend:
  ```bash
  git pull
  docker compose build backend
  docker compose up -d backend
  ```
- To update the UI, rebuild via `npm run build` and re-rsync to `/var/www`.
- Keep `/data/pytc/test_output` sized appropriately; TensorBoard scans it for
  new runs.
- If you need to expose the API under `/api/` only, configure your firewall so
  ports 4242/4243/4244/6006 are reachable only from localhost and let nginx be
  the sole public entry point.

Following these steps reproduces the GPU02 functionality on GPU08 while
preserving flexibility for future subdomains or alternate datasets.
