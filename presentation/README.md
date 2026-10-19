# Project presentation

`Pulse_Monitor_Presentation.pptx` — 18-slide project presentation (also exported as `.pdf`).

## What is inside

| File | Purpose |
|---|---|
| `Pulse_Monitor_Presentation.pptx` | The deck — open this in PowerPoint. |
| `Pulse_Monitor_Presentation.pdf` | Read-only PDF copy for sharing. |
| `assets/` | All images used in the deck (diagrams, screenshots, photos). |
| `make_diagrams.py` | Generates every diagram/chart in `assets/` (matplotlib). |
| `build_presentation.py` | Builds the `.pptx` from `assets/` (python-pptx). |
| `fetch_component_photos.py` | Re-downloads the Commons photo candidates into `assets_raw/`. |

## Before presenting

- Slide 1 has placeholder lines: **Presented by**, **Guide**, **Department** — fill them in.
- Every slide has **speaker notes** (View \u2192 Notes Page) with talking points.
- Slides use **Segoe UI**; the deck is standard 16:9, editable in PowerPoint.

## Rebuilding after asset changes

```powershell
pip install python-pptx matplotlib pillow
python make_diagrams.py        # regenerate diagrams into assets/
python build_presentation.py   # rebuild the .pptx
```

## Notes

- The dashboard screenshots in `assets/dashboard_*.png` were captured from a
  temporary demo session; those demo rows were removed from the database
  afterwards, so the real database stays clean.
- The ESP32 photo is from Wikimedia Commons (CC BY-SA 4.0, Edwiyanto); credit
  is shown on the slide. The MAX30102 image is a labelled illustration.
- Verification numbers on slides 13 and 16 come from real test runs of this
  project (ThingSpeak entry forwarded by the bridge, anomaly flagged after
  61 samples, etc.).
