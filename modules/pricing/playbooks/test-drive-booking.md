# Test Drive Booking Playbook

Use this playbook when a customer wants to experience a vehicle in person or requests a test drive slot.

## Booking Flow
1. **Identify Vehicle**: Resolve the customer's preferred model/variant via `search_cars` (so `variantId` is captured accurately).
2. **Confirm Slot**: Ask for preferred **date and time** (e.g., *"Tomorrow 11:00 AM"* or *"Saturday 4:00 PM"*) if not already provided.
3. **Execute Tool**: Call `book_test_drive` with `customerId`, `testDriveSlot`, `variantId`, and optional `conversationId` / `notes` (showroom visit vs doorstep preference).

## Post-Booking Guidance
- Confirm the booked vehicle and requested slot clearly in the customer's language (**English**, **Tamil**, or **Tanglish**).
- Remind the customer to carry a **valid driving licence**.
- Offer `get_car_link` so they can review photos and specs beforehand.
- If they ask about booking charges, clarify that test drives are complimentary and any vehicle booking payment is accepted **only at the showroom**.
