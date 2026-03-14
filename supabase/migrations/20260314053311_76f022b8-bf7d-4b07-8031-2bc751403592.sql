INSERT INTO supporting_systems (system_name, system_url, system_function, category, account_owner, is_active)
VALUES ('PayFast Production', 'https://www.payfast.co.za/dashboard', 'Production Payment Gateway', 'payment', 'carike', false)
ON CONFLICT DO NOTHING;