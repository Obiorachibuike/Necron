"""Text utilities shared by matching, imports and document generation."""
from __future__ import annotations

import re
from datetime import date, datetime

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in",
    "is", "it", "its", "of", "on", "or", "that", "the", "to", "was", "were", "will", "with",
    "you", "your", "our", "we", "they", "this", "these", "those", "their", "will", "can",
    "job", "role", "work", "team", "teams", "company", "position", "candidate", "candidates",
    "experience", "years", "year", "including", "using", "ability", "strong", "good",
    "knowledge", "understanding", "plus", "etc", "across", "within", "about", "into",
}

KNOWN_SKILLS = {
    # languages
    "python", "javascript", "typescript", "java", "kotlin", "swift", "go", "golang", "rust",
    "c", "c++", "c#", "ruby", "php", "scala", "dart", "elixir", "r", "matlab", "sql",
    "bash", "shell", "html", "css", "sass",
    # frontend
    "react", "next.js", "nextjs", "vue", "angular", "svelte", "redux", "tailwind", "tailwindcss",
    "webpack", "vite", "graphql", "rest", "restful", "html5", "css3", "jquery", "storybook",
    # backend
    "node.js", "nodejs", "express", "nestjs", "django", "flask", "fastapi", "spring",
    "spring boot", "rails", "laravel", "dotnet", ".net", "grpc", "celery", "rabbitmq",
    "kafka", "redis", "postgresql", "postgres", "mysql", "mongodb", "sqlite", "oracle",
    "elasticsearch", "dynamodb", "firebase", "supabase",
    # ai/data
    "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn", "pandas",
    "numpy", "nlp", "llm", "llms", "langchain", "openai", "hugging face", "transformers",
    "data analysis", "data engineering", "spark", "airflow", "dbt", "tableau", "power bi",
    "computer vision", "mlops", "vector database", "rag",
    # cloud/devops
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "terraform", "ansible",
    "jenkins", "github actions", "gitlab ci", "ci/cd", "linux", "nginx", "prometheus",
    "grafana", "serverless", "microservices", "devops", "cloudformation",
    # mobile
    "react native", "flutter", "android", "ios", "swiftui", "jetpack compose", "expo",
    # qa/security
    "cypress", "playwright", "selenium", "jest", "vitest", "pytest", "junit", "tdd",
    "security", "penetration testing", "owasp", "oauth", "jwt", "saml",
    # product/soft
    "agile", "scrum", "kanban", "jira", "figma", "product management", "stakeholder management",
    "communication", "leadership", "mentoring", "project management", "analytics",
    "a/b testing", "seo", "salesforce", "hubspot", "excel", "powerpoint",
    # design
    "ui design", "ux design", "user research", "design systems", "accessibility",
}

SKILL_ALIASES = {
    "js": "javascript", "ts": "typescript", "nextjs": "next.js", "nodejs": "node.js",
    "node": "node.js", "postgres": "postgresql", "golang": "go", "tailwindcss": "tailwind",
    "reactjs": "react", "react.js": "react", "vuejs": "vue", "vue.js": "vue",
    "gcp": "google cloud", "k8s": "kubernetes", "ml": "machine learning",
    "llm": "llms", "c#/.net": "c#", "dotnet": ".net", "ci cd": "ci/cd",
}

SENIORITY_PATTERNS = [
    ("intern", r"\bintern(ship)?\b"),
    ("junior", r"\b(junior|graduate|entry[- ]level|early[- ]career)\b"),
    ("mid", r"\b(mid[- ]level|intermediate)\b"),
    ("senior", r"\b(senior|sr\.?)\b"),
    ("lead", r"\b(lead|principal|staff)\b"),
    ("manager", r"\b(manager|head of|director)\b"),
]

WRITING_STYLE_LABELS = {
    "professional": "Professional",
    "conversational": "Conversational",
    "concise": "Concise",
    "detailed": "Detailed",
    "confident": "Confident",
    "understated": "Understated",
    "technical": "Technical",
    "accessible": "Accessible",
    "direct": "Direct",
    "diplomatic": "Diplomatic",
}


def clean_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z][a-zA-Z0-9+#./-]{1,30}", (text or "").lower())


def normalize_skill(value: str) -> str:
    key = clean_whitespace(value.lower())
    return SKILL_ALIASES.get(key, key)


def extract_skills(text: str) -> list[str]:
    lowered = f" {clean_whitespace(text).lower()} "
    found: set[str] = set()
    for alias, canonical in SKILL_ALIASES.items():
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", lowered):
            found.add(canonical)
    for skill in KNOWN_SKILLS:
        if re.search(rf"(?<![a-z0-9]){re.escape(skill)}(?![a-z0-9])", lowered):
            found.add(normalize_skill(skill))
    return sorted(found)


def extract_keywords(text: str, limit: int = 30) -> list[str]:
    counts: dict[str, int] = {}
    for token in tokenize(text):
        if len(token) < 3 or token in STOPWORDS:
            continue
        counts[token] = counts.get(token, 0) + 1
    skills = set(extract_skills(text))
    ranked = sorted(counts.items(), key=lambda item: (-(item[1] + (2 if item[0] in skills else 0)), item[0]))
    result: list[str] = []
    for word, _count in ranked:
        if word not in result:
            result.append(word)
        if len(result) >= limit:
            break
    return result


def detect_seniority(title: str, description: str = "") -> str:
    haystack = f"{title} {description[:2000]}".lower()
    for level, pattern in SENIORITY_PATTERNS:
        if re.search(pattern, haystack):
            return level
    return "unknown"


def detect_work_arrangement(text: str) -> str:
    lowered = (text or "").lower()
    if re.search(r"\bremote\b|\bwork from home\b|\bdistributed team\b|\banywhere\b", lowered):
        if re.search(r"\bhybrid\b", lowered):
            return "hybrid"
        return "remote"
    if re.search(r"\bhybrid\b", lowered):
        return "hybrid"
    if re.search(r"\bon[- ]?site\b|\boffice[- ]based\b|\bin[- ]office\b", lowered):
        return "onsite"
    return "unknown"


def slugify(value: str, max_length: int = 60) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return (cleaned or "document")[:max_length]


def format_date_range(start: date | datetime | None, end: date | datetime | None,
                      is_current: bool = False) -> str:
    def fmt(value: date | datetime | None) -> str:
        if not value:
            return ""
        return value.strftime("%b %Y")

    start_text, end_text = fmt(start), fmt(end)
    if is_current:
        return f"{start_text} – Present" if start_text else "Present"
    if start_text and end_text:
        return f"{start_text} – {end_text}"
    return start_text or end_text


def sentence_split(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean_whitespace(text)) if s.strip()]


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def truncate_words(text: str, limit: int) -> str:
    words = (text or "").split()
    if len(words) <= limit:
        return text
    return " ".join(words[:limit]).rstrip(".,;:") + "…"


def strip_control_characters(text: str) -> str:
    """Remove NUL and control characters that break PDF/DOCX output."""
    if not text:
        return ""
    return "".join(ch for ch in text if ch in "\n\t\r" or ord(ch) >= 32)


def safe_json_value(value):
    """Coerce values for JSON columns (dates become ISO strings)."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: safe_json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [safe_json_value(v) for v in value]
    return value
