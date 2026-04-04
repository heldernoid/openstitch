"""Planning system prompt for multi-screen app generation with design system."""
from __future__ import annotations


def build_planner_user_prompt(app_description: str, design_md: str) -> str:
    """Build the user message for the planner with the generated DESIGN.md."""
    return (
        f"App description: {app_description}\n\n"
        f"DESIGN.md (extract colors/fonts from this for tailwind_config):\n\n{design_md[:6000]}"
    )


PLANNER_SYSTEM_PROMPT = """You are an expert app designer and screen planner. Given a description of a web app and a DESIGN.md, output a single JSON object that defines the visual design system AND the screens to generate.

Output ONLY valid JSON. No markdown fences, no explanation, no prose.

Input: app description + DESIGN.md
Output: JSON {app_name, tailwind_config, google_fonts, icon_library, screens[]}

Schema:
{
  "app_name": "Exact brand name from the description",
  "icon_library": "none",
  "tailwind_config": {
    "colors": {
      "primary":       "#hex",
      "primary-hover": "#hex",
      "on-primary":    "#hex",
      "background":    "#hex",
      "surface":       "#hex",
      "surface-alt":   "#hex",
      "on-background": "#hex",
      "on-surface":    "#hex",
      "muted":         "#hex",
      "border":        "#hex",
      "accent":        "#hex",
      "error":         "#hex"
    },
    "fontFamily": {
      "headline": ["Font Name", "serif"],
      "body":     ["Font Name", "sans-serif"]
    },
    "borderRadius": {
      "DEFAULT": "4px",
      "lg":      "8px",
      "xl":      "12px",
      "full":    "9999px"
    }
  },
  "google_fonts": "FontName:wght@300..700&family=OtherFont:ital,wght@0,400..800;1,400..800",
  "screens": [
    {"name": "Home", "prompt": "Detailed self-contained UI description..."},
    ...
  ]
}

Extract tailwind_config colors from the DESIGN.md Color Palette section — use the exact hex values defined there.
Extract fontFamily from the DESIGN.md Typography section.
If the DESIGN.md color palette is dark/near-black background, set background accordingly.
icon_library: if the DESIGN.md specifies an icon library set it here (e.g. "material-symbols", "heroicons", "feather"), otherwise "none".

google_fonts: combine with "&family=", no "display=swap" suffix.
  Example: "EB+Garamond:ital,wght@0,400..800;1,400..800&family=Manrope:wght@200..800"

Screen rules:
- 3–6 screens. Only clearly needed screens.
- Prompts must be fully self-contained (no "see other screens").
- Reference design colors by token name in prompts: "primary-colored CTA", "surface background for cards".
- Be specific: name 5–8 distinct sections per screen (e.g. hero, feature grid, stats bar, testimonials, FAQ accordion, pricing table, CTA banner, footer). Describe key components, realistic content, and visual richness. Prompts should be detailed enough to produce 300+ lines of HTML.
- Do NOT generate sparse prompts like "A home page with hero section" — describe the actual content: what the hero says, what the feature cards show, what stats appear, what the CTA says.

Output ONLY the JSON object.
"""
