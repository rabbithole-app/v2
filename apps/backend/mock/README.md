# Mock GitHub API Server

A local mock server for emulating the GitHub API inside a Docker environment. Allows testing release downloads without making requests to the real GitHub.

## Folder Structure

```
mock/
├── nginx.conf          # nginx configuration
├── api/
│   └── releases.json   # List of releases (GitHub API format)
├── assets/             # Binary files (WASM, tar, etc.)
│   ├── encrypted-storage.wasm.gz
│   └── storage-frontend.tar
└── README.md
```

## Usage

### 1. Adding Assets

Place files in the `assets/` folder:

```bash
cp path/to/encrypted-storage.wasm.gz mock/assets/
cp path/to/storage-frontend.tar mock/assets/
```

### 2. Configuring releases.json

Edit `api/releases.json`. The backend parses these fields:

```json
[
  {
    "url": "http://mock-server:8080/repos/mock/releases/releases/1",
    "html_url": "http://mock-server:8080/releases/tag/v0.1.0",
    "id": 1,
    "tag_name": "v0.1.0",
    "name": "Storage v0.1.0",
    "body": "Release notes",
    "draft": true,
    "prerelease": false,
    "created_at": "2024-01-15T10:00:00Z",
    "published_at": "2024-01-15T12:00:00Z",
    "assets": [
      {
        "url": "http://mock-server:8080/assets/encrypted-storage.wasm.gz",
        "id": 101,
        "name": "encrypted-storage.wasm.gz",
        "label": "",
        "content_type": "application/gzip",
        "size": 1048576,
        "created_at": "2024-01-15T10:00:00Z",
        "updated_at": "2024-01-15T10:00:00Z"
      }
    ]
  }
]
```

**Important**: The `url` field in assets must point to the actual download URL. The backend uses this field (not `browser_download_url`).

### 3. Running

```bash
docker compose up -d
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /repos/{owner}/{repo}/releases` | List of releases |
| `GET /assets/{filename}` | Download asset (supports Range requests) |

## Environment Variables

In `docker-compose.yml` for backend:

| Variable | Description | Default (local) |
|----------|-------------|-----------------|
| `DFX_NETWORK` | dfx network | `local` |
| `GITHUB_API_URL` | API URL | `http://mock-server:8080` |
| `GITHUB_OWNER` | Repository owner | `mock` |
| `GITHUB_REPO` | Repository name | `releases` |

## Testing

```bash
# Health check
curl http://mock-server:8080/health

# List releases
curl http://mock-server:8080/repos/mock/releases/releases

# Download asset (full)
curl http://mock-server:8080/assets/encrypted-storage.wasm.gz -o test.wasm.gz

# Download asset (Range request - chunked)
curl -H "Range: bytes=0-1023" http://mock-server:8080/assets/encrypted-storage.wasm.gz -I
```

## Switching to Production

To deploy on IC, change the environment variables:

```yaml
environment:
  - DFX_NETWORK=ic
  - GITHUB_API_URL=https://api.github.com
  - GITHUB_OWNER=rabbithole-app
  - GITHUB_REPO=v2
  - GITHUB_TOKEN=ghp_xxx
```
