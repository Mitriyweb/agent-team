# Model Routing

How to run agents on local models, cloud API, or a mix of both.

## Modes

### Cloud only (default)

All agents use Anthropic API. Requires `ANTHROPIC_API_KEY`.

```bash
./scripts/run.sh --all
```

### Local only

All agents use qwen3-coder via Ollama. No API costs.

```bash
docker compose -f config/docker-compose.yml up -d
# Wait for model to download (~18GB)
docker logs ollama-pull -f

./scripts/agents.sh local
```

### Hybrid (recommended)

Expensive agents (team-lead, architect) use cloud.
Cheap repetitive agents (developer, qa) use local model.
Routes through LiteLLM proxy.

```bash
docker compose -f config/docker-compose.yml up -d
./scripts/agents.sh both   # opens split view in tmux
```

---

## Local Model Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 22 GB | 32 GB |
| vCPU | 8 | 16 |
| Disk | 25 GB | 40 GB |

Model used: `qwen3-coder:30b-q4_K_M` (~18 GB)

Tune for your machine in `config/docker-compose.yml`:

```yaml
environment:
  - OLLAMA_NUM_THREAD=16   # set to your vCPU count

deploy:
  resources:
    limits:
      cpus: "16"
      memory: 24G
```

---

## model-router Proxy (Universal Token Source)

[model-router](https://mitriyweb.github.io/model-router/) acts as a universal AI proxy and token source.
It offers free-tier access across multiple LLM providers (GitHub Models, Groq, Cerebras, Gemini, OpenRouter, Mistral, NVIDIA NIM, Cloudflare AI, Cohere, Ollama).

### Setup

Start `model-router` on port `8787`:

```bash
# Clone and start model-router
git clone https://github.com/Mitriyweb/model-router.git
cd model-router && bun install && bun run start
```

Configure `.env` in `agent-team`:

```env
PROVIDER=model-router
MODEL_ROUTER_HOST=http://localhost:8787
MODEL_ROUTER_API_KEY=dummy
```

`agent-team` will route requests via `model-router`'s Anthropic (`/v1/messages`) and OpenAI (`/v1/chat/completions`) endpoints.

---

## LiteLLM Proxy

Runs on `http://localhost:8080`.
Routes by model name:

| Model name | Routes to |
|------------|-----------|
| `claude-sonnet` | Anthropic API |
| `claude-opus` | Anthropic API |
| `qwen3-coder` | Ollama (local) |

Fallback: if `qwen3-coder` is unavailable, falls back to `claude-sonnet`.
Configure in `config/litellm.yaml`.

---

## Health Checks

```bash
# Ollama running?
curl http://localhost:11434/api/tags

# model-router running?
curl http://localhost:8787/v1/models

# LiteLLM running?
curl http://localhost:8080/health

# Test local model end-to-end
curl http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: local-key" \
  -d '{"model":"qwen3-coder","max_tokens":50,"messages":[{"role":"user","content":"Hi"}]}'
```
