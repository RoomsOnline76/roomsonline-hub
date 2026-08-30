-- Clear the half-created distribution account state for Albatros (ru-test-3)
delete from ru_api_credentials where login_email = 'ru-c@polka.co.za';
delete from ru_owner_accounts where property_id = '0079ba7c-8196-461d-af10-4f8bb0c15896';

-- Reset every channel-side onboarding step so the run starts again at A.1
update property_channel_step_status
set status = 'pending',
    source = 'seed',
    passed_at = null,
    stale_at = null,
    last_checked_at = null,
    input_fingerprint = null,
    details = null,
    blocker_summary = 'Reset by operator — Step A must run again from the account creation leg.',
    updated_at = now()
where property_id = '0079ba7c-8196-461d-af10-4f8bb0c15896'
  and step_key in ('keys','connect','company_profile','push_owner','publish','currency','pull_listings','entitlement','signoff');

-- Make sure no listing identity or push flag survives
update properties
set rentalsunited_property_id = null,
    ru_push_enabled = false,
    updated_at = now()
where id = '0079ba7c-8196-461d-af10-4f8bb0c15896';