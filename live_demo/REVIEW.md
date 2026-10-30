# Review and alerts

The public dashboard applies explainable rules in `public/review-engine.js`.
It does not connect to the local Isolation Forest service, diagnose disease,
estimate clinical confidence, or predict future events.

## Evidence

Sources reviewed October 30, 2026:

- [FDA: Pulse Oximeter Basics](https://www.fda.gov/consumers/consumer-updates/pulse-oximeter-basics): interpret readings alongside symptoms; movement, circulation, pigmentation and other factors affect accuracy.
- [MedlinePlus: Pulse Oximetry](https://medlineplus.gov/lab-tests/pulse-oximetry/): general guidance to contact a provider at 92% or lower and seek immediate attention at 88% or lower. Individual targets can differ.
- [American Heart Association: Target Heart Rates](https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/target-heart-rates): typical adult resting reference of 60–100 BPM; activity, medication and fitness affect interpretation.
- [NICE: COPD recommendations](https://www.nice.org.uk/guidance/ng115/chapter/Recommendations): condition-specific targets and oximeter limitations require clinical context.

These sources do not validate this MAX30102 prototype or its accuracy. Severe
or worsening symptoms require urgent help regardless of the displayed values.

## Implementation choices

Default configurable review bands: pulse 60–100 BPM, oxygen at least 95%,
signal quality at least 40%. The quality threshold, 90-second freshness window,
two-sample persistence rule and trend display thresholds are engineering
heuristics, not clinical diagnostic criteria. Preferences do not change firmware.

Zero or impossible physiological values become missing/invalid, not low-oxygen
medical alerts. Missing quality is never labeled reliable. Stale, future-dated,
failed and empty feeds do not produce current medical conclusions. Poor quality
does not hide a potentially serious valid low oxygen estimate.

On-screen review is automatic. Browser notifications require an explicit button
click and browser permission, last only for the current visit, and require the
dashboard to remain open. Demo feeds never notify. Ordinary alerts require two
distinct consecutive flagged samples; low-oxygen escalation can notify immediately.
Repeated alerts are suppressed until complete fresh readings recover; nonurgent
notifications also have a one-minute cooldown. Browser delivery is not guaranteed.

## Data and display

Charts show uploaded samples, not ECG or a simulated waveform. Smoothing is a
three-sample mean. Time ranges cannot retrieve history beyond the loaded feed.
Temperature, respiration, physical device uptime and battery are not inferred.
Journal entries and settings use this browser's local storage; exports contain
loaded readings. The ThingSpeak read key remains server-side.

## Verification

Run `npm test` for 12 review-engine tests covering boundaries, invalid and missing
data, freshness, persistence, custom bands and descriptive trends. Desktop/mobile
browser checks also covered navigation, dialogs, settings, journal persistence,
literal rendering of user input, exports, feed failures/recovery and notification
permission/deduplication/recovery. These are software checks, not clinical validation.
