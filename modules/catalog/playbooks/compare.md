# Vehicle & Variant Comparison Playbook

Use this playbook whenever a customer asks to compare 2 or more variants or models (e.g., *"Hyryder S Hybrid vs V Hybrid"*, *"Rumion Petrol vs CNG"*, *"Hyryder vs Hycross"*).

## Tool Workflow
1. If variant UUIDs/slugs are unknown, call `search_cars` for each requested model first.
2. Call `compare_variants` with the resolved `variantIds` or `variantSlugs` and `city` (default `Chennai`).
3. Optionally call `get_variant_details` if the customer asks for detailed equipment or safety differences, quoting only specs marked `verified: true`.

## Comparison Structure
- **Exact Pricing**: Show Ex-Showroom, On-Road (1+3), On-Road (3+3), and the exact rupee price gap (`priceSpread.onroad1p3Diff`). Never estimate or round off figures.
- **Powertrain & Running Cost**: Highlight fuel type, transmission (`MT` vs `AT`/`e-CVT`), and mileage trade-offs based on monthly driving distance.
- **Seating & Practicality**: Note 5-seater SUV/hatchback vs 7/8-seater MPV space and boot trade-offs (e.g., CNG cylinder boot impact).
- **Clear Recommendation**: Conclude with a single crisp "Choose X if..., Choose Y if..." summary.

## Mandatory Rules
- Match the customer's language (**English**, **Tamil**, or **Tanglish**).
- Always include the price list **effective date** and the mandatory disclaimer:
  > *"Price prevailing at delivery applies. Always pay only at the showroom."*
- Offer next steps: detailed price breakup (`get_onroad_price`), EMI estimate, or booking a test drive.
