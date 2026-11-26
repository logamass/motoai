# Car Finance, EMI & Exchange Playbook

Use this playbook when a customer asks about monthly EMI, car loans, down payment, interest rates, or exchanging an existing vehicle.

## EMI Calculation Workflow
1. Always call `get_onroad_price` first to fetch the exact published `onroad1p3` (or `onroad3p3`) rupee total from the database. Never estimate vehicle prices.
2. Calculate an **indicative monthly EMI** using clear, transparent assumptions (or the customer's requested down payment / tenure):
   - Default benchmark: **20% down payment**, **80% loan amount**, **9.0% p.a.** reducing balance, **60 months (5 years)**.
3. Present:
   - Exact On-Road Price (`effectiveDate`)
   - Assumed Down Payment & Loan Principal
   - Indicative Monthly EMI & Tenure
4. Clarify that final interest rate, processing fee, and loan sanction depend on customer credit profile and bank approval at the showroom finance desk.

## Used Car Exchange / Trade-In
- Ask for the existing car's **brand/model, year, fuel type, odometer reading, and city**.
- Explain that exact exchange valuation and applicable loyalty/exchange bonus require a physical inspection at the dealership.
- Offer `handoff_to_human` to connect them with our Chennai showroom evaluator.

## Mandatory Safety & Disclaimer
- Never collect bank account numbers, UPI IDs, card details, or request online transfers.
- Always include: *"Price prevailing at delivery applies. Always pay only at the showroom."*
- Match the customer's language (**English**, **Tamil**, or **Tanglish**).
