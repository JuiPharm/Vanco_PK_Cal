# Validation Report

## Scope
The uploaded UX/UI was retained and the calculation functions were replaced with a shared JavaScript PK/AUC engine.

## Test set
30 mock cases were included across general adults, elderly patients, renal impairment, AKI, obesity, ICU, ICU+obesity, augmented renal clearance, and dialysis/RRT warning scenarios.

## Result
All 30 smoke tests passed. The test confirms that the calculator returns finite PK parameters, dose recommendations within configured bounds, predicted AUC values, predicted troughs, and safety alerts without runtime calculation failure.

## Limitation
This is numerical smoke validation only. It is not clinical validation, external validation, regulatory validation, or proof of superiority to validated Bayesian TDM software.

## Required before patient care use
- Compare against local TDM pharmacist calculations and/or validated Bayesian software.
- Validate with institutional patient data.
- Define hospital-specific dosing caps, infusion policies, monitoring schedules, and RRT protocols.
- Review all outputs by a qualified clinician/pharmacist.
