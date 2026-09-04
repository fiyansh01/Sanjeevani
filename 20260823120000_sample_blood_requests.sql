-- Sample blood requests for the Blood Bank dashboard demo.
INSERT INTO blood_requests (blood_bank_id, requester_type, requester_name, blood_type, units_needed, status, drone_delivery)
SELECT b.id, sample.requester_type, sample.requester_name, sample.blood_type, sample.units_needed, sample.status, sample.drone_delivery
FROM blood_banks b
CROSS JOIN (VALUES
  ('hospital', 'AIIMS Emergency Department', 'O-', 4, 'pending', false),
  ('ambulance', 'DL-01-AB-1234', 'B+', 2, 'approved', false),
  ('hospital', 'Apollo Trauma Unit', 'AB+', 3, 'dispatched', true),
  ('ambulance', 'DL-02-EF-9012', 'A+', 1, 'delivered', true),
  ('hospital', 'Safdarjung Emergency Ward', 'O+', 5, 'rejected', false)
) AS sample(requester_type, requester_name, blood_type, units_needed, status, drone_delivery)
WHERE b.name = 'Indian Red Cross Blood Bank'
  AND NOT EXISTS (
    SELECT 1
    FROM blood_requests existing
    WHERE existing.blood_bank_id = b.id
      AND existing.requester_name = sample.requester_name
      AND existing.blood_type = sample.blood_type
  );