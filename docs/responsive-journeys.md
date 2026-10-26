# Responsive journeys and OpenCV comparison

Enable **Repeat journey: desktop, tablet and mobile** in AI Simulator, then start Full App or Feature Workflow testing. This creates independent browser journeys at:

| Device | Viewport |
| --- | --- |
| Mobile | 390 × 844 |
| Desktop | 1440 × 900 |
| Tablet | 768 × 1024 |

Each job has its own map, plan, approval, authentication prompts, evidence and results. Open each device tab to inspect and approve its plan. The existing upload, payment and action-safety rules still apply. Repeated submissions can create separate test records; use a test environment. **Stop all journeys** stops the whole group.

## Compare

Discovery and action checkpoints capture the page currently reached by each journey. The Compare tab matches states by route (including non-secret query/hash state) and discovery/action label, not discovery order or arbitrary screen IDs. Choose a state to see mobile, desktop and tablet screenshots side by side, with control-bound annotations, measurements, findings and OpenCV crop masks. Refresh after the journeys advance.

Confirmed observations include horizontal page overflow, controls covered at their center point and images rendered with a distorted intrinsic aspect ratio. Clipping, small targets and actions not visible in an equivalent state are review items: responsive menus and intentional hiding must not be called defects automatically.

OpenCV normalizes matching control crops before calculating grayscale differences. Different whole-page layouts are never directly pixel-compared or treated as failures. Appearance changes are informational evidence; numeric button dimensions remain available alongside the crops.

## Reports and exports

- **Printable report** contains matched screens, annotated screenshots, findings, measurements, OpenCV masks and each device's step results. Print it to PDF in the browser.
- **Export JSON** downloads the complete comparison evidence.
- Each existing job ZIP also includes `responsive-journey.json` with that viewport's evidence and group membership.
- The single-job report shows this viewport's measured responsive status rather than an unconditional 100% result. Use Compare for cross-device coverage.

Authorization follows project membership: viewing/export requires view access; start, approval and stop require edit access. Related jobs must belong to the same project and responsive group. Evidence is stored with the existing job persistence and does not get resent with every live status poll.

## Verification and limits

Unit tests cover separate job creation, startup rollback, plan gates, route/state matching, intentional resizing, actual OpenCV masks, incomplete evidence and HTML escaping. API tests cover authorization, mixed-group rejection, explicit opt-in and stop-all. Browser fixtures navigate and capture real pages at all three sizes and check injected overflow, clipping and covered controls. The CI artifact contains a generated fixture report.

The current capture bound is 60 states and 400 DOM controls per state; the OpenCV annotation pipeline processes up to 150 visible controls. Pixel comparisons sample up to eight shared visible controls per screen/viewport pair. These limits and missing/fallback/failed captures are explicit in the report. Missing equivalent states, a failed or unfinished journey, fallback analysis or unavailable comparison images prevent a complete passing status.

This provides viewport testing, not physical-device certification. It does not prove identical browser/OS behavior or infer every visual defect from pixels. Full live application verification still requires configured AI/browser services, test credentials and an authorized test target.
