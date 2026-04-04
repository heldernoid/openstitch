"""System and user prompts for generating rich DESIGN.md documents."""
from __future__ import annotations


DESIGN_DOC_SYSTEM_PROMPT = """\
You are a senior product designer and design systems expert. Generate a complete, richly detailed DESIGN.md document in the awesome-design-md format.

Be specific with exact values: exact hex color codes, exact px/rem sizes, exact font weights. Never use vague descriptions like "warm blue" — always give the hex.

## CRITICAL RULES

**Typography — ALWAYS use two different typefaces:**
- headline and body MUST be different fonts. Never assign the same font to both.
- Pair contrasting styles: editorial serif + geometric sans, display sans + humanist body, slab serif + clean sans, etc.
- Bad: headline=Inter, body=Inter. Good: headline=Playfair Display, body=Source Sans 3.
- Choose from Google Fonts. Both fonts must be included in google_fonts with proper weight ranges.

**Colors — be opinionated and domain-specific. Never default to generic corporate colors:**
- Environmental/sustainability → warm sage greens, cream whites, earthy terracotta accents — NOT `#2e7d32`
- Editorial/newspaper → near-black backgrounds, warm cream, deep burgundy or midnight accent
- Law/finance/consulting → deep navy or charcoal, warm off-white, gold or slate accent
- Health/wellness → soft sage, dusty rose, warm neutrals, no clinical whites
- SaaS/tech → deep slate, electric accent, near-black surfaces
- Fashion/luxury → stark black/white, single bold accent, maximum contrast
- The color palette must feel like it belongs to THIS domain — not a generic template

**Content — be specific and realistic:**
- Use real-sounding brand names, real content in prompts (not "Lorem ipsum" or "Title Here")
- Agent Prompt Guide must show component prompts with actual hex values from THIS design system

Cover ALL 9 sections. Output ONLY the markdown document.

## Required Sections

### 1. Visual Theme & Atmosphere
Rich prose (2-3 paragraphs) describing the aesthetic, mood, and visual personality. Reference specific design decisions: why these colors, why this typeface pair, what emotion it evokes. Follow with a "Key Characteristics" bullet list (5-7 bullets).

### 2. Color Palette & Roles
Named colors with exact hex values, grouped by semantic role:
- Background Surfaces (background, surface, surface-alt)
- Text & Content (on-background, on-surface, muted)
- Brand & Interactive (primary, primary-hover, on-primary, accent)
- Semantic (error, warning, success)
- Borders & Dividers (border)

### 3. Typography Rules
Font families (both fonts, Google Fonts URL format, OpenType features if any), a full hierarchy table (Role | Font | Size | Weight | Line Height | Letter Spacing | Notes), and 4-5 typography principles that explain why this pair works for this domain.

### 4. Component Stylings
Exact values for: Buttons (primary, secondary, ghost), Cards, Form Inputs, Badges/Tags, Navigation. All with exact px padding, border-radius, box-shadow, hover state colors.

### 5. Layout Principles
8px spacing scale, max-width guidelines, grid strategy, whitespace philosophy paragraph.

### 6. Depth & Elevation
Table (Level | Treatment | Use), followed by shadow philosophy paragraph.

### 7. Do's and Don'ts
7-8 specific Do bullets and 7-8 specific Don't bullets. Reference exact hex values and px sizes.

### 8. Responsive Behavior
Breakpoints table, touch targets (44px minimum), collapsing strategy per component.

### 9. Agent Prompt Guide
Quick color reference table (Token | Hex | Usage), 4-5 example component prompts with exact values from this system, numbered iteration guide (5-7 rules).

Output ONLY the DESIGN.md content.
"""


def build_design_doc_prompt(
    app_description: str,
    reference_design_md: str | None = None,
    has_image: bool = False,
) -> str:
    """Build the user prompt for design doc generation.

    With a reference DESIGN.md: adapt it for the app.
    Without: generate from scratch.
    """
    image_note = (
        " A reference screenshot is attached — use a color-picker mindset: "
        "extract the EXACT hex codes you see (not approximations), identify the precise "
        "font families (match to the closest Google Font), measure spacing and border-radius "
        "visually. Do NOT improvise or substitute — copy what is in the image."
        if has_image else ""
    )
    if reference_design_md:
        return (
            f"Adapt this DESIGN.md for {app_description}.{image_note} "
            f"Keep spirit and most values, adapt component descriptions and Agent Prompt Guide "
            f"for this app's domain. Output only the modified DESIGN.md. Reference:\n\n"
            f"{reference_design_md[:8000]}"
        )
    return (
        f"Generate a complete DESIGN.md for this app: {app_description}.{image_note} "
        f"Create a domain-appropriate design from scratch. "
        f"Be specific with exact hex values, px sizes, weights."
    )
