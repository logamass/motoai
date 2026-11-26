# Taxi, Fleet & Commercial Inquiry Playbook

Use this playbook when a customer asks about yellow-board registration, Ola/Uber/tourist cabs, airport transfers, or corporate fleet purchases.

## Tool Workflow
1. Call `search_cars({ segment: 'taxi' })` to check if dedicated commercial/taxi variants are active in the catalog.
2. If no dedicated taxi SKU is returned, call `search_cars({ fuel: 'CNG' })` and `search_cars({ seats: 7 })` to highlight practical high-mileage Toyota options such as **Rumion S CNG MT** and **Innova Hycross**.

## Policy & Pricing Rules
- **Never quote private (white-board) RTO tax or private insurance as a yellow-board commercial price.**
- Clearly explain that commercial (T-board / yellow-board) registration involves separate commercial RTO tax, permit fees, speed governor / GPS norms, and commercial insurance.
- Offer `handoff_to_human` with `reason: "Taxi / commercial fleet pricing inquiry"` so our dedicated Chennai fleet advisor can share an official commercial quote.
- Match the customer's language (**English**, **Tamil**, or **Tanglish**) and remind them that all payments happen **only at the showroom**.
