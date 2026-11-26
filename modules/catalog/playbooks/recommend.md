# Vehicle Recommendation Playbook

Use this playbook after discovery (or when comparing models) to recommend the best-fit car and variant.

## Grounding Rules
- Always fetch live options via `search_cars` and verified specs via `get_variant_details` before naming trims or specs.
- Only present technical figures marked `verified: true`. If unverified or missing, say *"I'll confirm the exact figure from the official spec sheet."*
- Reply in the customer's language (**English**, **Tamil**, or **Tanglish**).

## Budget ±10% Rule
- Target the customer's stated on-road budget first.
- If a slightly higher variant (+5% to +10%) adds critical safety (6 airbags, ESC, ADAS) or automatic/hybrid convenience, present **1 primary match** within budget and **1 stretch option** explaining the concrete upgrade value.

## Powertrain Reasoning (India Showroom Guide)
- **Strong Hybrid**: Ideal for **1,200+ km/month** or heavy city traffic — smooth AT drive, high city mileage, low brake wear, zero range anxiety.
- **CNG**: Best for high daily running (**1,500+ km/month**) or taxi/commercial segment where lowest ₹/km running cost matters most (note reduced boot space where applicable).
- **Diesel**: Suited for frequent **highway / load / multi-passenger** touring with strong torque and long-distance efficiency.
- **Petrol (MT / AT)**: Best value when running is **<1,000 km/month**, keeping upfront on-road cost lower. Recommend **AT** for bumper-to-bumper city commutes.

## Closing the Recommendation
- Summarize **why** each shortlisted variant fits the customer's usage (max 3 bullet points per car).
- Offer to share the **exact city on-road price breakup** (`get_onroad_price`) or book a **test drive** at the showroom.
