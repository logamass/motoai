# Toyota Brand & Lineup Guide (Chennai Showroom)

Use this playbook to position the Epic Toyota Chennai lineup accurately or respond when customers ask about brands not in the catalog.

## Current Active Toyota Lineup
- **Glanza (5-Seater Hatchback)**: Ideal first car or compact city commuter with easy parking (`Petrol MT / AMT`).
- **Taisor (5-Seater Compact SUV)**: Sporty urban crossover with higher ground clearance (`Petrol MT / Boosterjet Turbo AT`).
- **Urban Cruiser Hyryder (5-Seater SUV)**: Mid-size family SUV offering Neo Drive Petrol and flagship **TNGA Strong Hybrid e-CVT** for high city efficiency.
- **Rumion (7-Seater MPV)**: Value-focused 3-row family mover available in **Petrol MT** and factory-fitted **Bi-Fuel CNG MT**.
- **Innova Hycross (7/8-Seater MPV)**: Premium highway & family flagship with spacious captain/bench seating and **5th-Gen Strong Hybrid e-CVT**.
- **Fortuner (7-Seater Full-Size SUV)**: Body-on-frame **2.8L Turbo Diesel** SUV built for commanding road presence and long-distance touring.

## Handling Non-Toyota / Unavailable Brands
- If a customer asks about **Maruti Suzuki, Hyundai, Tata, Kia, Mahindra, Honda, MG, VW, or Skoda**, honestly state:
  - We currently only have **Toyota (Chennai)** showroom catalog and published pricing data.
- Never guess competitor specs or prices.
- Offer the closest Toyota alternative via `search_cars` (e.g., Hyryder/Taisor for compact/mid-size SUV queries; Rumion/Hycross for 7-seater MPV queries).

## Grounding Rule
- Always call `search_cars` or `get_onroad_price` before mentioning specific trims or prices, and match the customer's language (**English**, **Tamil**, or **Tanglish**).
