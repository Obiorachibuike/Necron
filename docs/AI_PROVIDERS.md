# AI providers

AI is optional. Every deterministic feature — profile editing, imports, matching, document
drafting from verified evidence, rules-based review, interview question banks and rubric
feedback, tracking and insights — works with no provider configured. When AI is unavailable the
product says so and degrades to those paths instead of inventing content.

## Supported provider types

| Type | `provider` value | Default endpoint | Typical use |
| --- | --- | --- | --- |
| OpenAI-compatible HTTP API | `openai_compatible` | `https://api.openai.com/v1` | OpenAI, Azure-compatible gateways, OpenRouter, Groq, vLLM, LM Studio, Together and other `/v1/chat/completions` services. |
| Ollama | `ollama` | `http://127.0.0.1:11434` | Fully local models on your own machine or LAN. |
| OpenAI (alias) | `openai` | `https://api.openai.com/v1` | Same adapter with OpenAI-specific defaults. |

The adapter calls `POST {base_url}/chat/completions` with `stream: false`, a JSON schema hint and
a temperature configured per provider. Model listing uses `GET {base_url}/models` when the
provider supports it.

## Configuration in the app

1. Sign in and open **Settings → AI provider**.
2. Choose the provider type, enter the base URL and model name, and paste your API key.
3. Read and accept the data disclosure. Until this is accepted, the backend refuses every
   provider call, including generation, review and interview feedback.
4. Save, then press **Test connection**. The result is stored and shown as connected or failed
   with the provider's message.
5. Optionally set a per-task model (strategy, CV, cover letter, review, revision, interview,
   answer feedback, extraction, match explanation), a fallback model, a temperature, an output
   token cap and a monthly token limit.

The API never returns the key. Responses contain `has_api_key: true` and a fingerprint only.

Environment variables (operator side):

```dotenv
CP_AI_ENCRYPTION_KEY=<Fernet key>      # encrypts stored keys; back this up
CP_AI_DAILY_OUTPUT_TOKEN_LIMIT=100000  # per-user ceiling enforced before each call
CP_AI_TIMEOUT_SECONDS=60
CP_AI_ALLOW_PRIVATE_ENDPOINTS=false    # true only for local/LAN providers such as Ollama
CP_AI_PRICING_JSON={}                  # optional USD-per-million-token price table
```

## What is sent to the provider

Only when the user starts an AI action (AI drafting, AI review, AI interview feedback, AI job
extraction or match explanation):

- The relevant slice of the **verified** profile: skills, selected experience, projects, education
  and writing preferences. Unverified records are excluded from document drafting.
- The approved application strategy and the target job's title, company and description.
- The user's instructions for that action.

Never sent: passwords, session tokens, provider keys, other users' data, uploaded files,
notification history or billing details. There is no telemetry or analytics endpoint.

Prompts label the job posting as untrusted data and instruct the model to ignore instructions
inside it. Structured output is validated against a Pydantic schema; invalid output is retried
once and then rejected. Document text produced by AI is additionally checked against the verified
evidence corpus, and any unsupported figure or skill becomes a **critical** review finding that
blocks approval.

## Failure behaviour

| Situation | Behaviour |
| --- | --- |
| No provider configured, AI requested | `422 ai_not_configured` before any work is queued. |
| Disclosure not accepted | `422 ai_disclosure_required`. |
| Provider unreachable or times out | The generation task completes with a clearly labelled deterministic draft; the task result reports `ai_used: false` and a notice explaining why. It never reports AI output that does not exist. |
| Provider returns invalid JSON | One repair attempt, then a validation error; the caller falls back to deterministic output where available. |
| Daily/monthly limit reached | `429`-style AI error with a message telling the user the limit is exhausted. |
| Connection test fails | Stored status `error` with the provider's message; features remain available deterministically. |

Usage is recorded per request with input/output tokens, model, task, latency and success. When
`CP_AI_PRICING_JSON` is empty, the UI shows tokens and states that cost estimates are
unavailable; it does not fabricate a cost.

## Adding a provider

1. Implement a client with the small `AIProviderClient` interface in `app/ai/base.py`
   (`chat`, `list_models`, health check) — most services only need an OpenAI-compatible shape.
2. Register it in `build_client` (`app/ai/service.py`) and add its identifier to `PROVIDERS` in
   `app/schemas/system.py`.
3. Add an entry to the provider metadata returned by `/api/v1/meta` and `/api/v1/ai/status`.
4. Add unit tests for request shaping and error mapping, and an integration test showing the
   failure path is reported honestly.
5. Document the endpoint, auth header format and any model constraints in this file.

Do not add a provider that requires shipping a shared key in the frontend; keys belong to users
or the operator's server-side environment only.

## Ollama example

```bash
ollama pull llama3.1:8b
ollama serve            # http://127.0.0.1:11434
```

Operator environment:

```dotenv
CP_AI_ALLOW_PRIVATE_ENDPOINTS=true
```

In the app: provider `Ollama`, base URL `http://127.0.0.1:11434`, model `llama3.1:8b`, no API
key. Test the connection, then accept the disclosure and save. Because the endpoint is local, no
data leaves the machine — but the disclosure is still required, and the UI still states when AI
is in use.

## Privacy summary

- Profile content leaves the deployment only through the user's configured provider.
- The operator can run everything locally with Ollama; no cloud dependency is required.
- Users can delete their provider configuration at any time, and account deletion removes all
  configurations and usage records.
- Full detail: [`SECURITY.md`](SECURITY.md).
