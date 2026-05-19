# Vancomycin TDM Calculator Production Bundle

This bundle contains an adult inpatient vancomycin AUC-guided calculation engine with MAP Bayesian estimation, a browser UI, and a 30-case mock validation suite.

## Important clinical scope

This project is **not a certified medical device** and must not be used as an autonomous dosing tool. It is intended for pharmacist-supervised TDM workflows after local institutional validation.

Hard-stop populations in the default engine include pediatric patients, MIC >= 2 mg/L, renal replacement therapy, ECMO, unstable renal function/AKI, and samples drawn during infusion.

## Files

- `index.html` enhanced/Bayesian UI
- `standard.html` standard UI shell using the same safety engine
- `js/vancomycin-engine.js` headless PK/Bayesian calculation engine
- `js/vancomycin-adapter.js` DOM adapter
- `tests/mock-cases.json` 30 mock cases
- `tests/run-validation.mjs` validation runner
- `tests/validation-output.csv` generated test output
- `docs/validation-report.md` generated validation summary

## Run tests

```bash
npm test
```

## Deploy

Any static hosting service can serve this folder. For hospital deployment, place behind institutional authentication, enable audit logging in the adapter layer, and complete retrospective local validation before clinical release.
