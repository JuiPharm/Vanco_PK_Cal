# Vancomycin TDM Calculator v3.0

This package preserves the uploaded UX/UI structure while replacing the calculation functions with a clinically aligned PK/AUC engine.

## Files
- `index.html` — original hub UI preserved
- `enhanced-vancomycin-tdm.html` — uploaded Enhanced UI preserved; calculation moved to JS
- `vancomycin-standard.html` — uploaded Standard UI preserved; calculation moved to JS
- `js/vancomycin-engine.js` — shared PK/AUC/MAP estimation engine
- `js/enhanced-app.js` — adapter for Enhanced UI
- `js/standard-app.js` — adapter for Standard UI
- `tests/mock-cases.json` — 30 mock validation cases
- `tests/run-validation.cjs` — numerical smoke test runner
- `tests/validation-output.csv` — validation outputs
- `tests/validation-summary.json` — test summary

## Clinical safety notice
For pharmacist-supervised TDM and institutional validation only. Not a certified medical device. Do not use as the sole basis for patient care decisions.

## Run tests
```bash
npm test
```

## Deploy to GitHub Pages
Upload the repository contents to GitHub, then enable Pages from `main` branch `/root`.
