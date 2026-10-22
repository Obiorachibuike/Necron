"""Per-template design definitions.

Each of the eight templates has its own section order *and* its own typographic treatment,
so they are genuinely different layouts rather than one layout with a different name:

``ats``               plain single column, uppercase headings, no rules, maximum parseability
``modern_developer``  two-column PDF sidebar (contact + skills left, narrative right)
``fullstack_engineer`` single column, accent rule under every heading, two-column skill grid
``backend_engineer``  numbered section headings (01, 02, ...), compact monospace accent
``ai_engineer``       shaded heading bands and a centred identity block
``mobile_developer``  compact type, title-case headings, dates aligned right
``graduate``          boxed headings, centred identity, education-first order
``academic``          centred identity, full-width rules, academic section order, no accent fill

Accent colours are restrained greens; the product brand colour is used in the app UI, not
printed across a CV, and no template relies on colour to convey meaning.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TemplateDesign:
    key: str
    label: str
    layout: str          # single_column | sidebar | compact
    name_align: str      # left | center
    heading: str         # upper_plain | upper_rule | numbered | boxed | band | title | academic
    accent: str          # hex, no leading '#'
    separator: str
    bullet: str
    skills_two_column: bool
    order: tuple[str, ...]
    description: str
    best_for: str
    ats_safe: bool = True

    def as_info(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "layout": self.layout,
            "name_align": self.name_align,
            "heading_style": self.heading,
            "description": self.description,
            "best_for": self.best_for,
            "ats_safe": self.ats_safe,
            "order": list(self.order),
            "skills_two_column": self.skills_two_column,
            "doc_types": ["cv"],
        }


DESIGN_LIST: list[TemplateDesign] = [
    TemplateDesign(
        key="ats",
        label="ATS-Friendly",
        layout="single_column",
        name_align="left",
        heading="upper_plain",
        accent="1F3B25",
        separator="  |  ",
        bullet="•",
        skills_two_column=False,
        order=("summary", "experience", "skills", "projects", "education", "certifications",
               "achievements"),
        description="Single column, standard section headings, no graphics or shading. "
                    "Optimised for text extraction.",
        best_for="Applications through applicant tracking systems and conservative employers.",
    ),
    TemplateDesign(
        key="modern_developer",
        label="Modern Developer",
        layout="sidebar",
        name_align="center",
        heading="upper_rule",
        accent="1B7F4B",
        separator="  ·  ",
        bullet="•",
        skills_two_column=False,
        order=("summary", "experience", "projects", "skills", "education", "certifications",
               "achievements"),
        description="Two-column layout: a tinted sidebar carries contact details and skills while "
                    "the main column tells the experience story.",
        best_for="Startups and product teams hiring broadly skilled engineers.",
    ),
    TemplateDesign(
        key="fullstack_engineer",
        label="Full-Stack Engineer",
        layout="single_column",
        name_align="left",
        heading="upper_rule",
        accent="0F766E",
        separator="  |  ",
        bullet="–",
        skills_two_column=True,
        order=("summary", "skills", "experience", "projects", "education", "certifications",
               "achievements"),
        description="Balanced frontend/backend emphasis with a two-column technical skills grid "
                    "above the experience history.",
        best_for="Full-stack roles that span UI, API and data layers.",
    ),
    TemplateDesign(
        key="backend_engineer",
        label="Backend Engineer",
        layout="single_column",
        name_align="left",
        heading="numbered",
        accent="14532D",
        separator="  |  ",
        bullet="•",
        skills_two_column=True,
        order=("summary", "experience", "skills", "projects", "education", "certifications",
               "achievements"),
        description="Numbered sections lead with systems, APIs, databases and reliability "
                    "evidence, with a compact technical grid.",
        best_for="Backend, platform and infrastructure roles.",
    ),
    TemplateDesign(
        key="ai_engineer",
        label="AI Engineer",
        layout="single_column",
        name_align="center",
        heading="band",
        accent="166534",
        separator="  ·  ",
        bullet="•",
        skills_two_column=True,
        order=("summary", "skills", "projects", "experience", "education", "certifications",
               "achievements"),
        description="Shaded section bands and a centred identity block; projects and applied "
                    "skill evidence are promoted above employment.",
        best_for="Machine learning, applied AI and data-intensive engineering roles.",
    ),
    TemplateDesign(
        key="mobile_developer",
        label="Mobile Developer",
        layout="compact",
        name_align="left",
        heading="title",
        accent="15803D",
        separator="  |  ",
        bullet="›",
        skills_two_column=False,
        order=("summary", "experience", "projects", "skills", "education", "certifications",
               "achievements"),
        description="Compact title-case headings with tighter leading, so shipped mobile "
                    "products and platform skills fit on one page.",
        best_for="Android, iOS and cross-platform mobile roles.",
    ),
    TemplateDesign(
        key="graduate",
        label="Graduate & Early Career",
        layout="single_column",
        name_align="center",
        heading="boxed",
        accent="1F3B25",
        separator="  |  ",
        bullet="•",
        skills_two_column=False,
        order=("summary", "education", "projects", "experience", "skills", "certifications",
               "achievements"),
        description="Boxed headings and a centred identity block; education and projects come "
                    "first for candidates with limited work history.",
        best_for="Graduate schemes, internships and first professional roles.",
    ),
    TemplateDesign(
        key="academic",
        label="Academic & Research",
        layout="single_column",
        name_align="center",
        heading="academic",
        accent="1F2937",
        separator="  —  ",
        bullet="–",
        skills_two_column=False,
        order=("summary", "education", "experience", "projects", "achievements", "skills",
               "certifications"),
        description="Centred identity, full-width section rules and an academic order that puts "
                    "education, research and publications before employment detail.",
        best_for="Research, academic and teaching-intensive roles.",
    ),
]

DESIGNS: dict[str, TemplateDesign] = {design.key: design for design in DESIGN_LIST}
DEFAULT_DESIGN = DESIGNS["ats"]
DESIGN_KEYS = frozenset(DESIGNS)

# Section titles differ where the template audience differs.
SECTION_TITLES: dict[str, dict[str, str]] = {
    "academic": {"achievements": "Research, Awards & Publications",
                 "projects": "Research Projects",
                 "experience": "Research & Teaching Experience"},
}


def design_for(template: str | None) -> TemplateDesign:
    return DESIGNS.get((template or "").strip(), DEFAULT_DESIGN)


def section_title(template: str, section_id: str, default: str) -> str:
    return SECTION_TITLES.get(template, {}).get(section_id, default)
