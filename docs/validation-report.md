# Validation Report — Vancomycin TDM Calculator v2.0.0

Generated: 2026-05-19

## Scope

This package implements an adult inpatient vancomycin AUC-guided calculator with a one-compartment MAP Bayesian engine, model selection across Buelga 2005, Adane 2015, Roberts 2011, and Masich 2020, and safety guardrails aligned with AUC-guided monitoring principles.

This is a calculation framework for pharmacist-supervised use after local validation. It is not a certified medical device.

## Implemented guardrails

- Target AUC24 default: 500 mg·h/L
- Target AUC24 range: 400–600 mg·h/L
- Alert when AUC > 600 mg·h/L
- Local hard-stop warning threshold: AUC > 650 mg·h/L
- MIC >= 2 mg/L: hard stop
- Pediatric patient: hard stop
- Renal replacement therapy: hard stop
- ECMO: unsupported by default
- Unstable renal function / AKI: hard stop
- Sample during infusion: hard stop
- Infusion rate: minimum infusion time calculated to keep rate <= 10 mg/min

## Test execution

Command:

```bash
npm test
```

Result:

```text
PASS 30/30
```

## Case coverage

- Adult ward initial dosing
- One-level and two-level MAP updates
- Extreme obesity
- ICU non-obese
- ICU + obesity
- Elderly CKD
- Augmented renal clearance
- Unstable renal function / AKI
- Intermittent HD and CRRT
- ECMO
- Pediatric hard stop
- MIC >= 2 hard stop
- Invalid sample timing
- Nephrotoxin warning

See `tests/validation-output.csv` and `tests/validation-summary.json` for detailed outputs.

## Remaining requirements before clinical use

1. Retrospective validation against local patient TDM encounters.
2. External comparison against an institutional reference method or validated Bayesian platform.
3. Review of local creatinine assay, vancomycin assay, and time-stamping workflow.
4. Governance sign-off by TDM pharmacy, ID, and clinical informatics.
5. Audit logging and user authentication if deployed inside a hospital.
6. Prospective silent-mode evaluation before releasing recommendations to clinicians.
